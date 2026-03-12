import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { WeightUnit } from "@/generated/prisma/client"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { sources, destination } = body
    // sources: [{ inventoryItemId, weight, totalCost }]
    // destination: { type: "existing"|"new", inventoryItemId?, category?, subcategory?, weightUnit? }

    if (!sources?.length) return NextResponse.json({ error: "At least one source item required" }, { status: 400 })
    if (!destination) return NextResponse.json({ error: "Destination required" }, { status: 400 })

    const totalTransferWeight = sources.reduce((s: number, r: { weight: number }) => s + r.weight, 0)
    const totalTransferCost = sources.reduce((s: number, r: { totalCost: number }) => s + r.totalCost, 0)

    // Validate sources
    for (const src of sources) {
      const item = await prisma.inventoryItem.findUnique({ where: { id: src.inventoryItemId } })
      if (!item) return NextResponse.json({ error: "Source item not found" }, { status: 404 })
      if (src.weight > item.availableWeight + 0.0001) {
        return NextResponse.json({ error: `Not enough available weight for "${item.name}"` }, { status: 400 })
      }
    }

    await prisma.$transaction(async (tx) => {
      // Create the MixTransfer record first
      const transfer = await tx.mixTransfer.create({ data: {} })

      // Deduct from each source and record source items
      for (const src of sources) {
        await tx.inventoryItem.update({
          where: { id: src.inventoryItemId },
          data: {
            totalWeight:     { decrement: src.weight },
            availableWeight: { decrement: src.weight },
            totalCost:       { decrement: src.totalCost },
          },
        })
        await tx.mixTransferItem.create({
          data: { mixTransferId: transfer.id, inventoryItemId: src.inventoryItemId, weight: src.weight, totalCost: src.totalCost, role: "SOURCE" },
        })
      }

      // Add to destination and record dest item
      let destItemId: string
      if (destination.type === "existing") {
        await tx.inventoryItem.update({
          where: { id: destination.inventoryItemId },
          data: {
            totalWeight:     { increment: totalTransferWeight },
            availableWeight: { increment: totalTransferWeight },
            totalCost:       { increment: totalTransferCost },
          },
        })
        destItemId = destination.inventoryItemId
      } else {
        const { category, subcategory, weightUnit } = destination
        const name = `${subcategory} ${getCategoryLabel(category)}`.trim()
        const destItem = await tx.inventoryItem.upsert({
          where: { category_subcategory: { category, subcategory } },
          update: {
            totalWeight:     { increment: totalTransferWeight },
            availableWeight: { increment: totalTransferWeight },
            totalCost:       { increment: totalTransferCost },
          },
          create: {
            category, subcategory, name,
            weightUnit: (weightUnit as WeightUnit) || WeightUnit.GRAM,
            totalWeight: totalTransferWeight,
            availableWeight: totalTransferWeight,
            totalCost: totalTransferCost,
          },
        })
        destItemId = destItem.id
      }
      await tx.mixTransferItem.create({
        data: { mixTransferId: transfer.id, inventoryItemId: destItemId, weight: totalTransferWeight, totalCost: totalTransferCost, role: "DEST" },
      })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Mix error:", error)
    return NextResponse.json({ error: "Failed to process transfer" }, { status: 500 })
  }
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    GOLD_JEWELRY: "Gold Jewelry", SILVER: "Silver",
    COINS_SILVER: "Silver Coins/Bars", COINS_GOLD: "Gold Coins/Bars",
  }
  return labels[category] || category
}
