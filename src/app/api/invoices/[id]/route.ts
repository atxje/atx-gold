import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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
  const { buyerName, buyerEmail, buyerPhone, buyerAddress, date, notes, items, removeItemIds } = await request.json()

  // Remove rows: reverse their inventory effects then delete them
  if (removeItemIds?.length) {
    for (const itemId of removeItemIds) {
      const item = await prisma.invoiceItem.findUnique({
        where: { id: itemId },
        include: { memoItem: true },
      })
      if (!item) continue

      await prisma.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: {
          soldWeight: { decrement: item.weight },
          soldValue: { decrement: item.totalPrice },
          totalProfit: { decrement: item.profit },
          totalCost: { increment: item.costBasis },
          ...(!item.memoItemId && { availableWeight: { increment: item.weight } }),
        },
      })

      if (item.memoItemId && item.memoItem) {
        await prisma.memoItem.update({ where: { id: item.memoItemId }, data: { status: "ACTIVE" } })
        await prisma.memo.update({ where: { id: item.memoItem.memoId }, data: { status: "ACTIVE" } })
      }

      await prisma.invoiceItem.delete({ where: { id: itemId } })
    }

    // If no items remain, delete the invoice
    const remaining = await prisma.invoiceItem.count({ where: { invoiceId: id } })
    if (remaining === 0) {
      await prisma.invoice.delete({ where: { id } })
      return NextResponse.json({ deleted: true })
    }
  }

  // Update prices/descriptions/weights for kept items and sync inventory stats
  if (items?.length) {
    for (const item of items) {
      const existing = await prisma.invoiceItem.findUnique({
        where: { id: item.id },
        include: { memoItem: true },
      })
      if (!existing) continue

      const weightDelta = (item.weight ?? existing.weight) - existing.weight
      const newWeight = existing.weight + weightDelta

      // Recalculate costBasis if weight changed
      let newCostBasis = existing.costBasis
      if (weightDelta !== 0) {
        const inv = await prisma.inventoryItem.findUnique({ where: { id: existing.inventoryItemId } })
        if (inv) {
          // Avg cost per unit based on current totalCost + the old costBasis we're holding
          const poolCost = inv.totalCost + existing.costBasis
          const poolWeight = inv.availableWeight + existing.weight
          const avgCost = poolWeight > 0 ? poolCost / poolWeight : 0
          newCostBasis = avgCost * newWeight
        }
      }

      const newProfit = item.totalPrice - newCostBasis
      const priceDelta = item.totalPrice - existing.totalPrice
      const profitDelta = newProfit - existing.profit
      const costBasisDelta = newCostBasis - existing.costBasis

      await prisma.invoiceItem.update({
        where: { id: item.id },
        data: {
          description: item.description,
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
        await prisma.inventoryItem.update({
          where: { id: existing.inventoryItemId },
          data: inventoryUpdates,
        })
      }
    }
  }

  const newTotal = items?.reduce((s: number, i: { totalPrice: number }) => s + i.totalPrice, 0)

  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      buyerName, buyerEmail, buyerPhone, buyerAddress, notes,
      date: date ? new Date(date) : undefined,
      ...(newTotal !== undefined && { totalAmount: newTotal }),
    },
    include: { items: { include: { inventoryItem: { select: { id: true, name: true, weightUnit: true } } } } },
  })

  return NextResponse.json(updated)
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

  // Reverse inventory effects for every item
  for (const item of invoice.items) {
    await prisma.inventoryItem.update({
      where: { id: item.inventoryItemId },
      data: {
        soldWeight: { decrement: item.weight },
        soldValue: { decrement: item.totalPrice },
        totalProfit: { decrement: item.profit },
        totalCost: { increment: item.costBasis },
        ...(!item.memoItemId && { availableWeight: { increment: item.weight } }),
      },
    })

    if (item.memoItemId && item.memoItem) {
      await prisma.memoItem.update({ where: { id: item.memoItemId }, data: { status: "ACTIVE" } })
      await prisma.memo.update({ where: { id: item.memoItem.memoId }, data: { status: "ACTIVE" } })
    }
  }

  // Delete invoice — cascade deletes all InvoiceItems
  await prisma.invoice.delete({ where: { id } })

  return NextResponse.json({ deleted: true })
}
