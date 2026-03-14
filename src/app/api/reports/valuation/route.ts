import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/reports/valuation?asOf=2026-03-10
// Reconstructs inventory state as of a given date by replaying transactions
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const asOfParam = searchParams.get("asOf")
  // Add 1-day buffer to account for timezone shifts (dates stored as next-day UTC midnight)
  const isPointInTime = !!asOfParam
  const asOf = asOfParam
    ? new Date(new Date(asOfParam + "T23:59:59.999Z").getTime() + 24 * 60 * 60 * 1000)
    : new Date(Date.now() + 24 * 60 * 60 * 1000)

  // Get all inventory items (even zeroed ones — they may have had stock at that date)
  const items = await prisma.inventoryItem.findMany()

  // Build a map: inventoryItemId → reconstructed state
  const state = new Map<string, {
    id: string; name: string; category: string; subcategory: string; weightUnit: string
    totalWeight: number; availableWeight: number; totalCost: number
    soldWeight: number; soldValue: number; totalProfit: number; askingPrice: number
  }>()

  for (const item of items) {
    state.set(item.id, {
      id: item.id, name: item.name, category: item.category,
      subcategory: item.subcategory, weightUnit: item.weightUnit,
      totalWeight: 0, availableWeight: 0, totalCost: 0,
      soldWeight: 0, soldValue: 0, totalProfit: 0,
      askingPrice: item.askingPrice,
    })
  }

  // 1. Purchases up to asOf
  const purchases = await prisma.purchase.findMany({
    where: { purchaseDate: { lte: asOf }, inventoryItemId: { not: null } },
  })
  for (const p of purchases) {
    const s = state.get(p.inventoryItemId!)
    if (!s) continue
    s.totalWeight += p.weight
    s.availableWeight += p.weight
    s.totalCost += p.pricePaid
  }

  // 2. Mix/transfers up to asOf
  const mixItems = await prisma.mixTransferItem.findMany({
    include: { mixTransfer: { select: { createdAt: true } } },
  })
  for (const mi of mixItems) {
    if (mi.mixTransfer.createdAt > asOf) continue
    const s = state.get(mi.inventoryItemId)
    if (!s) continue
    if (mi.role === "SOURCE") {
      s.totalWeight -= mi.weight
      s.availableWeight -= mi.weight
      s.totalCost -= mi.totalCost
    } else {
      s.totalWeight += mi.weight
      s.availableWeight += mi.weight
      s.totalCost += mi.totalCost
    }
  }

  // 3. Invoices up to asOf
  const invoiceItems = await prisma.invoiceItem.findMany({
    include: { invoice: { select: { date: true } } },
  })
  for (const ii of invoiceItems) {
    if (ii.invoice.date > asOf) continue
    const s = state.get(ii.inventoryItemId)
    if (!s) continue
    s.soldWeight += ii.weight
    s.soldValue += ii.totalPrice
    s.totalProfit += ii.profit
    s.totalCost -= ii.costBasis
    if (!ii.memoItemId) {
      s.availableWeight -= ii.weight
    }
  }

  // 4. Memos created up to asOf
  // We don't have timestamps for when items were returned/converted, so for point-in-time
  // queries, we treat all memo items created before asOf as on-memo (availableWeight--)
  // unless the memo has no active items left (fully resolved). The invoice section already
  // handles soldWeight for converted items without touching availableWeight.
  const memoItems = await prisma.memoItem.findMany({
    include: { memo: { select: { memoDate: true } } },
  })
  for (const mi of memoItems) {
    if (mi.memo.memoDate > asOf) continue
    const s = state.get(mi.inventoryItemId)
    if (!s) continue
    // Memo creation takes weight out of available
    s.availableWeight -= mi.weight
    // For "current" valuation (no date filter / today), apply actual status
    // RETURNED: weight goes back to available
    // CONVERTED: weight stays out (it was sold via invoice, tracked in soldWeight)
    if (!isPointInTime) {
      if (mi.status === "RETURNED") {
        s.availableWeight += mi.weight
      }
    }
  }

  // Filter to items that had stock at that date
  const result = Array.from(state.values()).filter(s => (s.totalWeight - s.soldWeight) > 0.0005)

  return NextResponse.json(result)
}
