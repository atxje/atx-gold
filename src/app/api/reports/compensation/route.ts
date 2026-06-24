import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Per-employee gross-profit report. Groups purchases by the user who logged them.
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const start = searchParams.get("start")
  const end = searchParams.get("end")

  const where: Record<string, unknown> = {}
  if (start || end) {
    const range: Record<string, Date> = {}
    if (start) range.gte = new Date(start)
    if (end) {
      // +1 day buffer: local dates are stored as next-day UTC midnight
      const e = new Date(end)
      e.setDate(e.getDate() + 1)
      range.lt = e
    }
    where.purchaseDate = range
  }

  const purchases = await prisma.purchase.findMany({
    where,
    select: {
      id: true,
      purchaseNumber: true,
      purchaseDate: true,
      description: true,
      metalType: true,
      weight: true,
      weightUnit: true,
      pricePaid: true,
      grossProfit: true,
      user: { select: { id: true, name: true, email: true } },
      lead: { select: { name: true } },
      inventoryItem: { select: { itemCode: true } },
    },
    orderBy: { purchaseDate: "desc" },
  })

  const byUser = new Map<
    string,
    {
      userId: string
      name: string | null
      email: string
      purchaseCount: number
      compedCount: number
      totalPaid: number
      totalGrossProfit: number
      purchases: typeof purchases
    }
  >()

  for (const p of purchases) {
    const key = p.user.id
    let row = byUser.get(key)
    if (!row) {
      row = {
        userId: p.user.id,
        name: p.user.name,
        email: p.user.email,
        purchaseCount: 0,
        compedCount: 0,
        totalPaid: 0,
        totalGrossProfit: 0,
        purchases: [],
      }
      byUser.set(key, row)
    }
    row.purchaseCount += 1
    row.totalPaid += p.pricePaid
    if (p.grossProfit !== null && p.grossProfit !== undefined) {
      row.compedCount += 1
      row.totalGrossProfit += p.grossProfit
    }
    row.purchases.push(p)
  }

  const employees = Array.from(byUser.values()).sort((a, b) => b.totalGrossProfit - a.totalGrossProfit)
  return NextResponse.json({ employees })
}
