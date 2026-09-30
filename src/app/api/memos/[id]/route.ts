import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TX_OPTIONS } from "@/lib/doc-numbers"

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
        include: { inventoryItem: { select: { id: true, name: true, weightUnit: true, totalCost: true, totalWeight: true, soldWeight: true } } },
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

  // Status-only update (return whole memo)
  if (body.status) {
    const updated = await prisma.$transaction(async (tx) => {
      if (body.status === "RETURNED" && memo.status === "ACTIVE") {
        for (const item of memo.items) {
          if (item.status === "ACTIVE") {
            await tx.inventoryItem.update({
              where: { id: item.inventoryItemId },
              data: { availableWeight: { increment: item.weight } },
            })
            // Mark the line returned too, so it can't be returned (and its
            // weight restored) a second time from the line-level buttons
            await tx.memoItem.update({ where: { id: item.id }, data: { status: "RETURNED" } })
          }
        }
      }
      return tx.memo.update({ where: { id }, data: { status: body.status } })
    }, TX_OPTIONS)
    return NextResponse.json(updated)
  }

  // Field edit update
  const { customerName, customerEmail, customerPhone, returnDate, notes, items, removeItemIds, newItems } = body

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Delete removed items and reverse inventory effects
      if (removeItemIds?.length) {
        for (const itemId of removeItemIds) {
          const item = await tx.memoItem.findUnique({ where: { id: itemId } })
          if (!item || item.memoId !== id) continue

          // Restore availableWeight for active items
          if (item.status === "ACTIVE") {
            await tx.inventoryItem.update({
              where: { id: item.inventoryItemId },
              data: { availableWeight: { increment: item.weight } },
            })
          }

          await tx.memoItem.delete({ where: { id: itemId } })
        }

        // If no items remain (and none are being added), delete the memo
        const remaining = await tx.memoItem.count({ where: { memoId: id } })
        if (remaining === 0 && !newItems?.length) {
          await tx.memo.delete({ where: { id } })
          return { deleted: true as const }
        }
      }

      for (const item of items ?? []) {
        const existing = await tx.memoItem.findUnique({ where: { id: item.id } })
        if (!existing || existing.memoId !== id) continue

        const weightDelta = (item.weight ?? existing.weight) - existing.weight

        await tx.memoItem.update({
          where: { id: item.id },
          data: {
            description: item.description,
            quantity: item.quantity ?? existing.quantity,
            pricePerUnit: item.pricePerUnit,
            totalValue: item.totalValue,
            weight: item.weight ?? existing.weight,
          },
        })

        // Memo holds weight: if an active line's weight changes, adjust availableWeight
        if (weightDelta !== 0 && existing.status === "ACTIVE") {
          await tx.inventoryItem.update({
            where: { id: existing.inventoryItemId },
            data: { availableWeight: { increment: -weightDelta } },
          })
        }
      }

      // Add new items to existing memo
      for (const item of newItems ?? []) {
        const invItem = await tx.inventoryItem.findUnique({ where: { id: item.inventoryItemId } })
        if (!invItem) throw new Error(`Inventory item not found: ${item.inventoryItemId}`)

        await tx.memoItem.create({
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

        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: { availableWeight: { decrement: item.weight } },
        })
      }

      // Recalculate total from all current items
      const allMemoItems = await tx.memoItem.findMany({ where: { memoId: id } })
      const recalcTotal = allMemoItems.reduce((s, i) => s + i.totalValue, 0)

      const updated = await tx.memo.update({
        where: { id },
        data: {
          customerName: customerName ?? memo.customerName,
          customerEmail: customerEmail ?? memo.customerEmail,
          customerPhone: customerPhone ?? memo.customerPhone,
          returnDate: returnDate ? new Date(returnDate) : memo.returnDate,
          notes: notes ?? memo.notes,
          totalValue: recalcTotal,
        },
        include: { items: { include: { inventoryItem: { select: { id: true, name: true, weightUnit: true, totalCost: true, totalWeight: true, soldWeight: true } } } } },
      })
      return { updated }
    }, TX_OPTIONS)

    if ("deleted" in result) return NextResponse.json({ deleted: true })
    return NextResponse.json(result.updated)
  } catch (error) {
    console.error("Error updating memo:", error)
    return NextResponse.json(
      { error: "Failed to save memo changes — nothing was changed. Please try again." },
      { status: 500 }
    )
  }
}
