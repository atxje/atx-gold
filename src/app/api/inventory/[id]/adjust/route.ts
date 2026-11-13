import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ADJUSTMENT_REASONS } from "@/lib/inventory-adjustments"
import { TX_OPTIONS } from "@/lib/doc-numbers"

// POST /api/inventory/[id]/adjust — admin-only correction of an item's
// on-hand weight and/or piece count (not gold, lost, weighing or entry
// mistake). Total cost is NOT changed, so the average cost per unit moves.
// Every adjustment is logged with who, when, before/after, reason and note.
//
// Body: { weight: number (new on-hand weight), quantity: number (new piece
//         count), reason: code, note?: string }
const round = (n: number) => Math.round(n * 100000) / 100000

class AdjustError extends Error {}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an admin can adjust inventory" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const newWeight = round(Number(body.weight))
  const newQuantity = Math.round(Number(body.quantity))
  const reason = String(body.reason ?? "")
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null

  if (!Number.isFinite(newWeight) || newWeight < 0) {
    return NextResponse.json({ error: "Enter the correct weight (0 or more)" }, { status: 400 })
  }
  if (!Number.isFinite(newQuantity) || newQuantity < 0) {
    return NextResponse.json({ error: "Enter the correct quantity (0 or more)" }, { status: 400 })
  }
  if (!ADJUSTMENT_REASONS.some(r => r.code === reason)) {
    return NextResponse.json({ error: "Choose a reason for the adjustment" }, { status: 400 })
  }
  if (reason === "OTHER" && !note) {
    return NextResponse.json({ error: 'Add a note explaining the "Other" reason' }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({ where: { id } })
      if (!item) throw new AdjustError("Item not found")

      // On hand = everything bought/moved in, minus what was sold
      const weightBefore = round(item.totalWeight - item.soldWeight)
      const delta = round(newWeight - weightBefore)
      if (delta === 0 && newQuantity === item.quantity) {
        throw new AdjustError("Nothing to adjust — the weight and quantity are unchanged")
      }
      // Weight out on memo is still physically accounted for; on-hand can't drop below it
      const onMemo = round(weightBefore - item.availableWeight)
      if (round(item.availableWeight + delta) < 0) {
        throw new AdjustError(
          `${onMemo} of this item is out on memo, so on-hand weight can't go below that. Return or convert the memo first.`
        )
      }

      await tx.inventoryItem.update({
        where: { id },
        data: {
          ...(delta !== 0 && { totalWeight: { increment: delta }, availableWeight: { increment: delta } }),
          quantity: newQuantity,
        },
      })
      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          inventoryItemId: id,
          userId: session.user.id,
          reason,
          note,
          weightBefore,
          weightAfter: newWeight,
          quantityBefore: item.quantity,
          quantityAfter: newQuantity,
          totalCost: item.totalCost,
        },
      })
      return adjustment
    }, TX_OPTIONS)

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AdjustError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("Inventory adjustment error:", error)
    return NextResponse.json({ error: "Couldn't save the adjustment — nothing was changed" }, { status: 500 })
  }
}
