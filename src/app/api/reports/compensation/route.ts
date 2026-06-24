import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { allocateMonthlyComp, monthKey, monthLabel, MonthlyPurchase } from "@/lib/compensation"

// Collapse a month's per-line purchases into one row per purchase document
// (siblings sharing a purchaseNumber), summing their compensation
function groupByDocument(purchases: (MonthlyPurchase & { comp: number })[]) {
  const map = new Map<
    string,
    { id: string; purchaseNumber: string | null; purchaseDate: Date; itemCount: number; comp: number; firstDesc: string; firstCode: string | null }
  >()
  for (const p of purchases) {
    const key = p.purchaseNumber ?? `id:${p.id}`
    let d = map.get(key)
    if (!d) {
      d = { id: p.id, purchaseNumber: p.purchaseNumber, purchaseDate: p.purchaseDate, itemCount: 0, comp: 0, firstDesc: p.description, firstCode: p.itemCode }
      map.set(key, d)
    }
    d.itemCount += 1
    d.comp += p.comp
  }
  return Array.from(map.values())
    .map((d) => ({
      id: d.id,
      purchaseNumber: d.purchaseNumber,
      purchaseDate: d.purchaseDate,
      itemCount: d.itemCount,
      label: d.itemCount === 1 ? `${d.firstCode ? d.firstCode + " · " : ""}${d.firstDesc}` : `${d.itemCount} items`,
      comp: d.comp,
    }))
    .sort((a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime())
}

// Per-employee compensation, grouped by calendar month. Only EMPLOYEE-role users
// appear; non-admins only ever see their own data regardless of query params.
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role ?? "ADMIN"
  const { searchParams } = new URL(request.url)

  // Resolve which employees are in scope
  let employeeUsers: { id: string; name: string | null; email: string }[]
  if (role !== "ADMIN") {
    const self = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true },
    })
    employeeUsers = self ? [self] : []
  } else {
    const q = searchParams.get("userId")
    employeeUsers = await prisma.user.findMany({
      where: { role: "EMPLOYEE", ...(q ? { id: q } : {}) },
      select: { id: true, name: true, email: true },
    })
  }

  const scopeIds = employeeUsers.map((u) => u.id)

  const rows = scopeIds.length
    ? await prisma.purchase.findMany({
        where: { userId: { in: scopeIds } },
        select: {
          id: true, purchaseNumber: true, purchaseDate: true, description: true,
          metalType: true, weight: true, weightUnit: true, pricePaid: true, grossProfit: true,
          userId: true,
          inventoryItem: { select: { itemCode: true } },
        },
        orderBy: { purchaseDate: "asc" },
      })
    : []

  // Seed an entry for every in-scope employee so they show even with no purchases
  const users = new Map<
    string,
    { userId: string; name: string | null; email: string; months: Map<string, MonthlyPurchase[]> }
  >()
  for (const u of employeeUsers) {
    users.set(u.id, { userId: u.id, name: u.name, email: u.email, months: new Map() })
  }

  for (const r of rows) {
    const u = users.get(r.userId)
    if (!u) continue
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

  const currentKey = monthKey(new Date())

  const employees = Array.from(users.values())
    .map((u) => {
      const months = Array.from(u.months.entries())
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
            documents: groupByDocument(alloc.purchases), // one row per purchase document, newest first
          }
        })

      // Always surface the current month (with the guaranteed minimum) up top
      if (!months.some((m) => m.key === currentKey)) {
        const empty = allocateMonthlyComp([])
        months.unshift({
          key: currentKey,
          label: monthLabel(currentKey),
          totalGrossProfit: 0,
          totalComp: 0,
          guarantee: empty.guarantee,
          payout: empty.payout,
          guaranteeApplied: empty.guaranteeApplied,
          documents: [],
        })
      }

      return { userId: u.userId, name: u.name, email: u.email, months }
    })
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))

  return NextResponse.json({ role, employees })
}
