import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  // Local dates (e.g. "2026-03-10" CST) get stored as next-day UTC midnight (2026-03-11T00:00:00Z)
  // Shift from/to forward by 1 day to match DB storage
  const fromDate = from ? new Date(from + "T00:00:00.000Z") : null
  const toDate = to ? new Date(to + "T00:00:00.000Z") : null
  if (fromDate) fromDate.setUTCDate(fromDate.getUTCDate() + 1)
  if (toDate) toDate.setUTCDate(toDate.getUTCDate() + 2) // +2 because we need end of that shifted day
  const dateFilter = {
    ...(fromDate && { gte: fromDate }),
    ...(toDate && { lt: toDate }),
  }
  const hasDateFilter = from || to

  // Purchases grouped by date
  const purchases = await prisma.purchase.findMany({
    where: hasDateFilter ? { purchaseDate: dateFilter } : undefined,
    select: {
      id: true,
      purchaseNumber: true,
      purchaseDate: true,
      description: true,
      metalType: true,
      weight: true,
      weightUnit: true,
      pricePaid: true,
      category: true,
      subcategory: true,
      paymentMethod: true,
      lead: { select: { name: true } },
    },
    orderBy: { purchaseDate: "desc" },
  })

  // Invoices with items
  const invoices = await prisma.invoice.findMany({
    where: hasDateFilter ? { date: dateFilter } : undefined,
    include: {
      items: {
        include: { inventoryItem: { select: { name: true, category: true, subcategory: true, weightUnit: true } } },
      },
    },
    orderBy: { date: "desc" },
  })

  return NextResponse.json({ purchases, invoices })
}
