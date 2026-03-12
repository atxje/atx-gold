import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH /api/memo-items/[id]
// body: { action: "return" | "convert" }
// "return"  → restore availableWeight, mark item RETURNED
// "convert" → restore availableWeight (so invoice can decrement it), mark item CONVERTED
// Both actions check remaining active items and update memo status accordingly
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { action } = await request.json()

  if (!["return", "revert"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  }

  const memoItem = await prisma.memoItem.findUnique({
    where: { id },
    include: {
      memo: { include: { items: true } },
      invoiceItem: { include: { invoice: { include: { items: true } } } },
    },
  })

  if (!memoItem) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (action === "revert") {
    // Revert a CONVERTED item back to ACTIVE.
    // This reverses the linked invoice item's effects on inventory and removes it from the invoice.
    if (memoItem.status !== "CONVERTED") return NextResponse.json({ error: "Only CONVERTED items can be reverted" }, { status: 400 })
    const invoiceItem = memoItem.invoiceItem

    await prisma.$transaction(async (tx) => {
      // Reverse invoice effects on inventory stats
      if (invoiceItem) {
        await tx.inventoryItem.update({
          where: { id: memoItem.inventoryItemId },
          data: {
            soldWeight: { decrement: invoiceItem.weight },
            soldValue: { decrement: invoiceItem.totalPrice },
            totalProfit: { decrement: invoiceItem.profit },
            totalCost: { increment: invoiceItem.costBasis },
            // availableWeight stays at 0 — item is back on memo as ACTIVE
            // (invoice had restored +weight then decremented -weight, net 0 vs memo state)
            // But we need to re-decrement to put it back "on memo":
            // Current state: availableWeight = originalAvailable - invoiceWeight (invoice decremented after restoring)
            // Target state: availableWeight = originalAvailable - memoWeight (on memo, same weight)
            // Since invoiceWeight == memoWeight, no change needed
          },
        })
        // Remove invoice item
        await tx.invoiceItem.delete({ where: { id: invoiceItem.id } })
        // Update or delete the invoice
        const remainingItems = invoiceItem.invoice.items.filter(i => i.id !== invoiceItem.id)
        if (remainingItems.length === 0) {
          await tx.invoice.delete({ where: { id: invoiceItem.invoiceId } })
        } else {
          const newTotal = remainingItems.reduce((s, i) => s + i.totalPrice, 0)
          await tx.invoice.update({ where: { id: invoiceItem.invoiceId }, data: { totalAmount: newTotal } })
        }
      }
      // Restore memo item to ACTIVE
      await tx.memoItem.update({ where: { id }, data: { status: "ACTIVE" } })
      await tx.memo.update({ where: { id: memoItem.memoId }, data: { status: "ACTIVE" } })
    })
    const updated = await prisma.memoItem.findUnique({ where: { id } })
    return NextResponse.json(updated)
  }

  if (memoItem.status !== "ACTIVE") return NextResponse.json({ error: "Item already resolved" }, { status: 400 })

  await prisma.$transaction(async (tx) => {
    await tx.memoItem.update({ where: { id }, data: { status: "RETURNED" } })
    await tx.inventoryItem.update({
      where: { id: memoItem.inventoryItemId },
      data: { availableWeight: { increment: memoItem.weight } },
    })
    const otherItems = memoItem.memo.items.filter(i => i.id !== id)
    const allResolved = otherItems.every(i => i.status !== "ACTIVE")
    if (allResolved) {
      const anyConverted = otherItems.some(i => i.status === "CONVERTED")
      await tx.memo.update({ where: { id: memoItem.memoId }, data: { status: anyConverted ? "CONVERTED" : "RETURNED" } })
    }
  })

  const updated = await prisma.memoItem.findUnique({ where: { id } })
  return NextResponse.json(updated)
}
