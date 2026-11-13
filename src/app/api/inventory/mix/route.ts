import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { WeightUnit, type Prisma } from "@/generated/prisma/client"
import { nextMixNumber, nextItemCode, TX_OPTIONS } from "@/lib/doc-numbers"
import { pickDiamond, pickJewelry, pickWatch } from "@/lib/purchases"

// Mix / split: move part of one or more inventory items (weight, pieces and a
// cost the user sets — default average cost × weight) into
//   • an existing item,
//   • a new pooled parcel (category + type), or
//   • a new individual piece with its own D/J/W code and details.
// Whatever cost is not moved stays in the source. Saved as a MIX-#### document
// in one transaction; it can be reversed later.

class MixError extends Error {}
const round = (n: number, d = 5) => Math.round(n * 10 ** d) / 10 ** d
const cents = (n: number) => Math.round(n * 100) / 100

interface SourceInput { inventoryItemId: string; weight: number; quantity?: number; totalCost: number }

// GET /api/inventory/mix — recent transfers (for the Stock Documents list)
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const transfers = await prisma.mixTransfer.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { items: { include: { inventoryItem: { select: { id: true, name: true, weightUnit: true } } } } },
  })
  return NextResponse.json(transfers)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const destination = body.destination as Record<string, unknown> | undefined
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null

    const sources: SourceInput[] = (Array.isArray(body.sources) ? body.sources : []).map((s: Record<string, unknown>) => ({
      inventoryItemId: String(s.inventoryItemId ?? ""),
      weight: round(Number(s.weight)),
      quantity: Math.max(0, Math.round(Number(s.quantity) || 0)),
      totalCost: cents(Number(s.totalCost)),
    }))
    if (sources.length === 0) return NextResponse.json({ error: "Choose at least one item to move from" }, { status: 400 })
    if (!destination?.type) return NextResponse.json({ error: "Choose where it's moving to" }, { status: 400 })
    if (new Set(sources.map(s => s.inventoryItemId)).size !== sources.length) {
      return NextResponse.json({ error: "The same item is listed twice" }, { status: 400 })
    }
    for (const s of sources) {
      if (!s.inventoryItemId || !Number.isFinite(s.weight) || s.weight <= 0) {
        return NextResponse.json({ error: "Enter the weight to move for every item" }, { status: 400 })
      }
      if (!Number.isFinite(s.totalCost) || s.totalCost < 0) {
        return NextResponse.json({ error: "Enter the cost to move for every item (0 or more)" }, { status: 400 })
      }
    }

    const totalWeight = round(sources.reduce((a, s) => a + s.weight, 0))
    const totalQuantity = sources.reduce((a, s) => a + (s.quantity || 0), 0)
    const totalCost = cents(sources.reduce((a, s) => a + s.totalCost, 0))

    const result = await prisma.$transaction(async (tx) => {
      // Check and reduce each source
      let unit: WeightUnit | null = null
      for (const s of sources) {
        const item = await tx.inventoryItem.findUnique({ where: { id: s.inventoryItemId } })
        if (!item) throw new MixError("One of the items no longer exists")
        if (s.weight > item.availableWeight + 0.0001) {
          throw new MixError(`"${item.name}" only has ${round(item.availableWeight, 3)} available`)
        }
        if (s.totalCost > item.totalCost + 0.005) {
          throw new MixError(`"${item.name}" only carries $${item.totalCost.toFixed(2)} of cost`)
        }
        if ((s.quantity || 0) > item.quantity) {
          throw new MixError(`"${item.name}" only has ${item.quantity} piece(s)`)
        }
        if (unit && unit !== item.weightUnit) {
          throw new MixError("The items being moved are measured in different units (e.g. grams and troy oz) — move them separately")
        }
        unit = item.weightUnit
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            totalWeight: { decrement: s.weight },
            availableWeight: { decrement: s.weight },
            totalCost: { decrement: s.totalCost },
            ...(s.quantity ? { quantity: { decrement: s.quantity } } : {}),
          },
        })
      }
      const sourceUnit = unit ?? WeightUnit.GRAM
      const addStock = {
        totalWeight: { increment: totalWeight },
        availableWeight: { increment: totalWeight },
        totalCost: { increment: totalCost },
        ...(totalQuantity ? { quantity: { increment: totalQuantity } } : {}),
      }

      // Destination
      let destItemId: string
      if (destination.type === "existing") {
        const destId = String(destination.inventoryItemId ?? "")
        if (sources.some(s => s.inventoryItemId === destId)) throw new MixError("An item can't be moved into itself")
        const dest = await tx.inventoryItem.findUnique({ where: { id: destId } })
        if (!dest) throw new MixError("The destination item no longer exists")
        if (dest.weightUnit !== sourceUnit) {
          throw new MixError(`"${dest.name}" is measured in a different unit than what you're moving`)
        }
        await tx.inventoryItem.update({ where: { id: destId }, data: addStock })
        destItemId = destId
      } else if (destination.type === "new") {
        // New pooled parcel: category (from Stock Categories) + type
        const cat = destination.categoryId
          ? await tx.stockCategory.findUnique({ where: { id: String(destination.categoryId) } })
          : null
        const category = cat?.name ?? String(destination.category ?? "")
        const subcategory = String(destination.subcategory ?? "").trim()
        if (!category || !subcategory) throw new MixError("Choose the category and type of the new parcel")
        if (cat && cat.weightUnit !== sourceUnit) {
          throw new MixError(`${cat.name} is measured in a different unit than what you're moving`)
        }
        const dest = await tx.inventoryItem.upsert({
          where: { category_subcategory: { category, subcategory } },
          update: addStock,
          create: {
            category, subcategory,
            name: `${subcategory} ${category}`.trim(),
            weightUnit: cat?.weightUnit ?? sourceUnit,
            totalWeight, availableWeight: totalWeight, totalCost, quantity: totalQuantity,
          },
        })
        if (sources.some(s => s.inventoryItemId === dest.id)) throw new MixError("An item can't be moved into itself")
        destItemId = dest.id
      } else if (destination.type === "piece") {
        // New individual piece with its own code (J…, D…, W…) and details
        const cat = await tx.stockCategory.findUnique({ where: { id: String(destination.categoryId ?? "") } })
        if (!cat || !["JEWELRY", "DIAMOND", "WATCH"].includes(cat.metalType)) {
          throw new MixError("Choose what kind of piece this is (jewelry, diamond or watch)")
        }
        const prefix = cat.metalType === "DIAMOND" ? "D" : cat.metalType === "WATCH" ? "W" : "J"
        const itemCode = await nextItemCode(tx, prefix)
        const label = String(destination.label ?? "").trim() || cat.name
        const dest = await tx.inventoryItem.create({
          data: {
            itemCode,
            category: cat.name,
            subcategory: itemCode, // the code keeps (category, subcategory) unique
            name: `${itemCode} – ${label}`,
            weightUnit: sourceUnit,
            totalWeight, availableWeight: totalWeight, totalCost,
            quantity: totalQuantity || 1,
          },
        })
        const details = (destination.details ?? {}) as Record<string, unknown>
        if (cat.metalType === "JEWELRY") {
          await tx.jewelryDetails.create({
            data: {
              inventoryItemId: dest.id,
              ...pickJewelry(details),
              costPerGram: totalWeight > 0 ? round(totalCost / totalWeight, 4) : null,
            } as Prisma.JewelryDetailsUncheckedCreateInput,
          })
        } else if (cat.metalType === "DIAMOND") {
          await tx.diamondDetails.create({
            data: { inventoryItemId: dest.id, ...pickDiamond(details) } as Prisma.DiamondDetailsUncheckedCreateInput,
          })
        } else {
          await tx.watchDetails.create({
            data: { inventoryItemId: dest.id, ...pickWatch(details) } as Prisma.WatchDetailsUncheckedCreateInput,
          })
        }
        destItemId = dest.id
      } else {
        throw new MixError("Choose where it's moving to")
      }

      const number = await nextMixNumber(tx)
      const transfer = await tx.mixTransfer.create({
        data: {
          number,
          note,
          userId: session.user.id,
          items: {
            create: [
              ...sources.map(s => ({
                inventoryItemId: s.inventoryItemId, weight: s.weight, quantity: s.quantity || 0, totalCost: s.totalCost, role: "SOURCE",
              })),
              { inventoryItemId: destItemId, weight: totalWeight, quantity: totalQuantity, totalCost, role: "DEST" },
            ],
          },
        },
      })
      return { id: transfer.id, number, destItemId }
    }, TX_OPTIONS)

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof MixError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("Mix error:", error)
    return NextResponse.json({ error: "Couldn't save the transfer — nothing was changed" }, { status: 500 })
  }
}
