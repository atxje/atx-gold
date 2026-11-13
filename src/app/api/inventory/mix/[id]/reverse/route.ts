import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { TX_OPTIONS } from "@/lib/doc-numbers"

// POST /api/inventory/mix/[id]/reverse — undo a mix / split (admin only):
// the weight, pieces and cost go back from the destination to the sources.
// Blocked if the destination no longer holds what was moved (sold, on memo,
// or moved again) — reverse those first.
class ReverseError extends Error {}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an admin can reverse a transfer" }, { status: 403 })
  }
  const { id } = await params

  try {
    await prisma.$transaction(async (tx) => {
      const transfer = await tx.mixTransfer.findUnique({
        where: { id },
        include: { items: { include: { inventoryItem: true } } },
      })
      if (!transfer) throw new ReverseError("Transfer not found")
      if (transfer.reversedAt) throw new ReverseError("This transfer was already reversed")
      // Claim it first so two clicks can't reverse it twice
      const claimed = await tx.mixTransfer.updateMany({
        where: { id, reversedAt: null },
        data: { reversedAt: new Date(), reversedById: session.user.id },
      })
      if (claimed.count !== 1) throw new ReverseError("This transfer was already reversed")

      for (const d of transfer.items.filter(i => i.role === "DEST")) {
        const it = d.inventoryItem
        if (it.availableWeight + 0.0001 < d.weight || it.totalCost + 0.005 < d.totalCost || it.quantity < d.quantity) {
          throw new ReverseError(
            `"${it.name}" no longer holds everything that was moved into it (some was sold, put on memo or moved again). Reverse those first.`
          )
        }
        await tx.inventoryItem.update({
          where: { id: it.id },
          data: {
            totalWeight: { decrement: d.weight },
            availableWeight: { decrement: d.weight },
            totalCost: { decrement: d.totalCost },
            ...(d.quantity ? { quantity: { decrement: d.quantity } } : {}),
          },
        })
      }
      for (const s of transfer.items.filter(i => i.role === "SOURCE")) {
        await tx.inventoryItem.update({
          where: { id: s.inventoryItemId },
          data: {
            totalWeight: { increment: s.weight },
            availableWeight: { increment: s.weight },
            totalCost: { increment: s.totalCost },
            ...(s.quantity ? { quantity: { increment: s.quantity } } : {}),
          },
        })
      }
    }, TX_OPTIONS)
    return NextResponse.json({ reversed: true })
  } catch (error) {
    if (error instanceof ReverseError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("Mix reverse error:", error)
    return NextResponse.json({ error: "Couldn't reverse the transfer — nothing was changed" }, { status: 500 })
  }
}
