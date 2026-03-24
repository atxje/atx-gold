import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MetalType, WeightUnit } from "@/generated/prisma/client"

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    GOLD_JEWELRY: "Gold Jewelry",
    SILVER: "Silver",
    COINS_SILVER: "Silver Coins/Bars",
    COINS_GOLD: "Gold Coins/Bars",
  }
  return labels[category] || category
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { items } = body as {
      items: {
        category: string
        subcategory: string
        metalType: string
        weightUnit: string
        weight: number
        cost: number
        quantity: number
        description?: string
        diamondData?: {
          shape?: string; caratWeight?: number; color?: string; clarity?: string
          lab?: string; certNumber?: string; cutGrade?: string; polish?: string
          symmetry?: string; fluorescence?: string; measurements?: string
          costPerCarat?: number; rapPrice?: number; rapDiscount?: number; notes?: string
        }
        jewelryData?: {
          metal?: string; brand?: string; mainStone?: string; costPerGram?: number
        }
      }[]
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 })
    }

    const results: { id: string; name: string; itemCode?: string }[] = []

    for (const item of items) {
      const { category, subcategory, metalType, weightUnit, weight, cost, quantity } = item
      const parsedWeight = weight || 0
      const parsedCost = cost || 0
      const parsedQuantity = quantity || 0
      const parsedWeightUnit = (weightUnit as WeightUnit) || WeightUnit.GRAM
      const isUniqueItem = metalType === "DIAMOND" || metalType === "JEWELRY"

      if (isUniqueItem) {
        // Generate item code
        const prefix = metalType === "DIAMOND" ? "D" : "J"
        const lastCoded = await prisma.inventoryItem.findFirst({
          where: { itemCode: { startsWith: prefix } },
          orderBy: { itemCode: "desc" },
          select: { itemCode: true },
        })
        const nextNum = lastCoded?.itemCode
          ? parseInt(lastCoded.itemCode.slice(1)) + 1
          : 1000
        const itemCode = `${prefix}${String(nextNum).padStart(4, "0")}`
        const itemName = `${itemCode} – ${subcategory}`

        const inventoryItem = await prisma.inventoryItem.create({
          data: {
            itemCode,
            category,
            subcategory: itemCode,
            name: itemName,
            weightUnit: parsedWeightUnit,
            totalWeight: parsedWeight,
            availableWeight: parsedWeight,
            totalCost: parsedCost,
            quantity: parsedQuantity,
          },
        })

        // Create diamond/jewelry details
        if (metalType === "DIAMOND" && item.diamondData) {
          const dd = item.diamondData
          await prisma.diamondDetails.create({
            data: {
              inventoryItemId: inventoryItem.id,
              shape: dd.shape || null,
              caratWeight: dd.caratWeight || null,
              color: dd.color || null,
              clarity: dd.clarity || null,
              lab: dd.lab || null,
              certNumber: dd.certNumber || null,
              cutGrade: dd.cutGrade || null,
              polish: dd.polish || null,
              symmetry: dd.symmetry || null,
              fluorescence: dd.fluorescence || null,
              measurements: dd.measurements || null,
              costPerCarat: dd.costPerCarat || null,
              rapPrice: dd.rapPrice || null,
              rapDiscount: dd.rapDiscount || null,
              notes: dd.notes || null,
            },
          })
        } else if (metalType === "JEWELRY" && item.jewelryData) {
          const jd = item.jewelryData
          await prisma.jewelryDetails.create({
            data: {
              inventoryItemId: inventoryItem.id,
              metal: jd.metal || null,
              brand: jd.brand || null,
              mainStone: jd.mainStone || null,
              costPerGram: jd.costPerGram || null,
            },
          })
        }

        results.push({ id: inventoryItem.id, name: itemName, itemCode })
      } else {
        // Regular item — upsert by category+subcategory
        const itemName = `${subcategory} ${getCategoryLabel(category)}`
        const inventoryItem = await prisma.inventoryItem.upsert({
          where: { category_subcategory: { category, subcategory } },
          update: {
            totalWeight: { increment: parsedWeight },
            availableWeight: { increment: parsedWeight },
            totalCost: { increment: parsedCost },
            quantity: { increment: parsedQuantity },
          },
          create: {
            category,
            subcategory,
            name: itemName,
            weightUnit: parsedWeightUnit,
            totalWeight: parsedWeight,
            availableWeight: parsedWeight,
            totalCost: parsedCost,
            quantity: parsedQuantity,
          },
        })
        results.push({ id: inventoryItem.id, name: itemName })
      }
    }

    return NextResponse.json({ imported: results.length, items: results })
  } catch (error) {
    console.error("Error importing inventory:", error)
    return NextResponse.json(
      { error: "Failed to import inventory" },
      { status: 500 }
    )
  }
}
