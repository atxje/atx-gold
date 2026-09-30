import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TX_OPTIONS } from "@/lib/doc-numbers"
import { avgCostPerUnit } from "@/lib/inventory-cost"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      items: {
        include: { inventoryItem: { select: { id: true, name: true, weightUnit: true } } },
      },
    },
  })

  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(invoice)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { buyerName, buyerEmail, buyerPhone, buyerAddress, date, notes, items, removeItemIds, newItems } = await request.json()

  // All edits to the invoice and its inventory effects are saved together
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Remove rows: reverse their inventory effects then delete them
      if (removeItemIds?.length) {
        for (const itemId of removeItemIds) {
          const item = await tx.invoiceItem.findUnique({
            where: { id: itemId },
            include: { memoItem: true },
          })
          if (!item || item.invoiceId !== id) continue

          await tx.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: {
              soldWeight: { decrement: item.weight },
              soldValue: { decrement: item.totalPrice },
              totalProfit: { decrement: item.profit },
              totalCost: { increment: item.costBasis },
              ...(!item.memoItemId && { availableWeight: { increment: item.weight } }),
              ...(item.quantity > 0 && { quantity: { increment: item.quantity } }),
            },
          })

          if (item.memoItemId && item.memoItem) {
            await tx.memoItem.update({ where: { id: item.memoItemId }, data: { status: "ACTIVE" } })
            await tx.memo.update({ where: { id: item.memoItem.memoId }, data: { status: "ACTIVE" } })
          }

          await tx.invoiceItem.delete({ where: { id: itemId } })
        }

        // If no items remain (and none are being added), delete the invoice
        const remaining = await tx.invoiceItem.count({ where: { invoiceId: id } })
        if (remaining === 0 && !newItems?.length) {
          await tx.invoice.delete({ where: { id } })
          return { deleted: true as const }
        }
      }

      // Update prices/descriptions/weights for kept items and sync inventory stats
      for (const item of items ?? []) {
        const existing = await tx.invoiceItem.findUnique({
          where: { id: item.id },
          include: { memoItem: true },
        })
        if (!existing || existing.invoiceId !== id) continue

        const weightDelta = (item.weight ?? existing.weight) - existing.weight
        const newWeight = existing.weight + weightDelta

        // Recalculate costBasis if weight changed: average cost of the stock on
        // hand, counting this line's weight and cost as back on the shelf
        let newCostBasis = existing.costBasis
        if (weightDelta !== 0) {
          const inv = await tx.inventoryItem.findUnique({ where: { id: existing.inventoryItemId } })
          if (inv) {
            const avgCost = avgCostPerUnit({
              totalCost: inv.totalCost + existing.costBasis,
              totalWeight: inv.totalWeight,
              soldWeight: inv.soldWeight - existing.weight,
            })
            newCostBasis = avgCost * newWeight
          }
        }

        const newProfit = item.totalPrice - newCostBasis
        const priceDelta = item.totalPrice - existing.totalPrice
        const profitDelta = newProfit - existing.profit
        const costBasisDelta = newCostBasis - existing.costBasis

        await tx.invoiceItem.update({
          where: { id: item.id },
          data: {
            description: item.description,
            quantity: item.quantity ?? existing.quantity,
            pricePerUnit: item.pricePerUnit,
            totalPrice: item.totalPrice,
            weight: newWeight,
            costBasis: newCostBasis,
            profit: newProfit,
          },
        })

        // Sync inventory stats
        const inventoryUpdates: Record<string, unknown> = {}
        if (priceDelta !== 0 || profitDelta !== 0) {
          inventoryUpdates.soldValue = { increment: priceDelta }
          inventoryUpdates.totalProfit = { increment: profitDelta }
        }
        if (weightDelta !== 0) {
          inventoryUpdates.soldWeight = { increment: weightDelta }
          // For non-memo items, availableWeight changes inversely
          if (!existing.memoItemId) {
            inventoryUpdates.availableWeight = { increment: -weightDelta }
          }
        }
        if (costBasisDelta !== 0) {
          inventoryUpdates.totalCost = { increment: -costBasisDelta }
        }
        if (Object.keys(inventoryUpdates).length > 0) {
          await tx.inventoryItem.update({
            where: { id: existing.inventoryItemId },
            data: inventoryUpdates,
          })
        }
      }

      // Add new items to existing invoice
      for (const item of newItems ?? []) {
        const invItem = await tx.inventoryItem.findUnique({ where: { id: item.inventoryItemId } })
        if (!invItem) throw new Error(`Inventory item not found: ${item.inventoryItemId}`)

        const costBasis = avgCostPerUnit(invItem) * item.weight
        const profit = item.totalPrice - costBasis

        await tx.invoiceItem.create({
          data: {
            invoiceId: id,
            inventoryItemId: item.inventoryItemId,
            description: item.description,
            quantity: item.quantity ?? 0,
            weight: item.weight,
            weightUnit: item.weightUnit || invItem.weightUnit,
            pricePerUnit: item.pricePerUnit,
            totalPrice: item.totalPrice,
            costBasis,
            profit,
          },
        })

        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: {
            availableWeight: { decrement: item.weight },
            soldWeight: { increment: item.weight },
            soldValue: { increment: item.totalPrice },
            totalProfit: { increment: profit },
            totalCost: { decrement: costBasis },
            ...((item.quantity ?? 0) > 0 && { quantity: { decrement: item.quantity } }),
          },
        })
      }

      // Recalculate total from all current items
      const allInvoiceItems = await tx.invoiceItem.findMany({ where: { invoiceId: id } })
      const recalcTotal = allInvoiceItems.reduce((s, i) => s + i.totalPrice, 0)

      const updated = await tx.invoice.update({
        where: { id },
        data: {
          buyerName, buyerEmail, buyerPhone, buyerAddress, notes,
          date: date ? new Date(date) : undefined,
          totalAmount: recalcTotal,
        },
        include: { items: { include: { inventoryItem: { select: { id: true, name: true, weightUnit: true } } } } },
      })
      return { updated }
    }, TX_OPTIONS)

    if ("deleted" in result) return NextResponse.json({ deleted: true })
    return NextResponse.json(result.updated)
  } catch (error) {
    console.error("Error updating invoice:", error)
    return NextResponse.json(
      { error: "Failed to save invoice changes — nothing was changed. Please try again." },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { items: { include: { memoItem: true } } },
  })
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Reverse inventory effects and delete the invoice together
  try {
    await prisma.$transaction(async (tx) => {
      for (const item of invoice.items) {
        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: {
            soldWeight: { decrement: item.weight },
            soldValue: { decrement: item.totalPrice },
            totalProfit: { decrement: item.profit },
            totalCost: { increment: item.costBasis },
            ...(!item.memoItemId && { availableWeight: { increment: item.weight } }),
            ...(item.quantity > 0 && { quantity: { increment: item.quantity } }),
          },
        })

        if (item.memoItemId && item.memoItem) {
          await tx.memoItem.update({ where: { id: item.memoItemId }, data: { status: "ACTIVE" } })
          await tx.memo.update({ where: { id: item.memoItem.memoId }, data: { status: "ACTIVE" } })
        }
      }

      // Delete invoice — cascade deletes all InvoiceItems
      await tx.invoice.delete({ where: { id } })
    }, TX_OPTIONS)
  } catch (error) {
    console.error("Error cancelling invoice:", error)
    return NextResponse.json(
      { error: "Failed to cancel invoice — nothing was changed. Please try again." },
      { status: 500 }
    )
  }

  return NextResponse.json({ deleted: true })
}
