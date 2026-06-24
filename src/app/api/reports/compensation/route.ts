import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { allocateMonthlyComp, monthKey, monthLabel, MonthlyPurchase } from "@/lib/compensation"

// Per-employee compensation, grouped by calendar month. Employees (non-ADMIN)
// only ever see their own data, regardless of query params.
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role ?? "ADMIN"
  const { searchParams } = new URL(request.url)

  let userIds: string[] | undefined
  if (role !== "ADMIN") {
    userIds = [session.user.id]
  } else {
    const q = searchParams.get("userId")
    if (q) userIds = [q]
  }

  const rows = await prisma.purchase.findMany({
    where: userIds ? { userId: { in: userIds } } : {},
    select: {
      id: true, purchaseNumber: true, purchaseDate: true, description: true,
      metalType: true, weight: true, weightUnit: true, pricePaid: true, grossProfit: true,
      user: { select: { id: true, name: true, email: true } },
      inventoryItem: { select: { itemCode: true } },
    },
    orderBy: { purchaseDate: "asc" },
  })

  // Group by user → month
  const users = new Map<
    string,
    { userId: string; name: string | null; email: string; months: Map<string, MonthlyPurchase[]> }
  >()
  for (const r of rows) {
    let u = users.get(r.user.id)
    if (!u) {
      u = { userId: r.user.id, name: r.user.name, email: r.user.email, months: new Map() }
      users.set(r.user.id, u)
    }
    const mk = monthKey(r.purchaseDate)
    const bucket = u.months.get(mk) ?? []
    bucket.push({
      id: r.id, purchaseNumber: r.purchaseNumber, purchaseDate: r.purchaseDate,
      description: r.description, metalType: r.metalType, weight: r.weight,
      weightUnit: r.weightUnit, pricePaid: r.pricePaid, grossProfit: r.grossProfit,
      itemCode: r.inventoryItem?.itemCode ?? null,
    })
    u.months.set(mk, bucket)
  }

  const employees = Array.from(users.values())
    .map((u) => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
      months: Array.from(u.months.entries())
        .sort((a, b) => b[0].localeCompare(a[0])) // newest month first
        .map(([key, ps]) => {
          const alloc = allocateMonthlyComp(ps)
          return {
            key,
            label: monthLabel(key),
            totalGrossProfit: alloc.totalGrossProfit,
            totalComp: alloc.totalComp,
            guarantee: alloc.guarantee,
            payout: alloc.payout,
            guaranteeApplied: alloc.guaranteeApplied,
            // show newest purchase first in the list
            purchases: alloc.purchases.slice().reverse(),
          }
        }),
    }))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))

  return NextResponse.json({ role, employees })
}
