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

  const memo = await prisma.memo.findUnique({
    where: { id },
    include: {
      items: {
        include: { inventoryItem: { select: { id: true, name: true, weightUnit: true, totalCost: true, totalWeight: true } } },
      },
    },
  })

  if (!memo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(memo)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const memo = await prisma.memo.findUnique({ where: { id }, include: { items: true } })
  if (!memo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Status-only update (return/convert)
  if (body.status) {
    if (body.status === "RETURNED" && memo.status === "ACTIVE") {
      for (const item of memo.items) {
        if (item.status === "ACTIVE") {
          await prisma.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { availableWeight: { increment: item.weight } },
          })
        }
      }
    }
    const updated = await prisma.memo.update({ where: { id }, data: { status: body.status } })
    return NextResponse.json(updated)
  }

  // Field edit update
  const { customerName, customerEmail, customerPhone, returnDate, notes, items, removeItemIds, newItems } = body

  // Delete removed items and reverse inventory effects
  if (removeItemIds?.length) {
    for (const itemId of removeItemIds) {
      const item = await prisma.memoItem.findUnique({ where: { id: itemId } })
      if (!item) continue

      // Restore availableWeight for active items
      if (item.status === "ACTIVE") {
        await prisma.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: { availableWeight: { increment: item.weight } },
        })
      }

      await prisma.memoItem.delete({ where: { id: itemId } })
    }

    // If no items remain, delete the memo
    const remaining = await prisma.memoItem.count({ where: { memoId: id } })
    if (remaining === 0) {
      await prisma.memo.delete({ where: { id } })
      return NextResponse.json({ deleted: true })
    }
  }

  if (items?.length) {
    for (const item of items) {
      const existing = await prisma.memoItem.findUnique({ where: { id: item.id } })
      if (!existing) continue

      const weightDelta = (item.weight ?? existing.weight) - existing.weight

      await prisma.memoItem.update({
        where: { id: item.id },
        data: {
          description: item.description,
          quantity: item.quantity ?? existing.quantity,
          pricePerUnit: item.pricePerUnit,
          totalValue: item.totalValue,
          weight: item.weight ?? existing.weight,
        },
      })

      // Sync inventory: memo holds weight, so if weight changes adjust availableWeight
      if (weightDelta !== 0) {
        await prisma.inventoryItem.update({
          where: { id: existing.inventoryItemId },
          data: { availableWeight: { increment: -weightDelta } },
        })
      }
    }
  }

  // Add new items to existing memo
  if (newItems?.length) {
    for (const item of newItems) {
      const invItem = await prisma.inventoryItem.findUnique({ where: { id: item.inventoryItemId } })
      if (!invItem) continue

      await prisma.memoItem.create({
        data: {
          memoId: id,
          inventoryItemId: item.inventoryItemId,
          description: item.description,
          quantity: item.quantity ?? 0,
          weight: item.weight,
          weightUnit: item.weightUnit || invItem.weightUnit,
          pricePerUnit: item.pricePerUnit,
          totalValue: item.totalValue,
        },
      })

      await prisma.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { availableWeight: { decrement: item.weight } },
      })
    }
  }

  // Recalculate total from all current items
  const allMemoItems = await prisma.memoItem.findMany({ where: { memoId: id } })
  const recalcTotal = allMemoItems.reduce((s, i) => s + i.totalValue, 0)

  const updated = await prisma.memo.update({
    where: { id },
    data: {
      customerName: customerName ?? memo.customerName,
      customerEmail: customerEmail ?? memo.customerEmail,
      customerPhone: customerPhone ?? memo.customerPhone,
      returnDate: returnDate ? new Date(returnDate) : memo.returnDate,
      notes: notes ?? memo.notes,
      totalValue: recalcTotal,
    },
    include: { items: { include: { inventoryItem: { select: { id: true, name: true, weightUnit: true, totalCost: true, totalWeight: true } } } } },
  })

  return NextResponse.json(updated)
}
