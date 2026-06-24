import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MetalType, WeightUnit } from "@/generated/prisma/client"
import { recalcPurchaseGrossProfit } from "@/lib/compensation"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const leadId = searchParams.get("leadId")
  const metalType = searchParams.get("metalType") as MetalType | null

  const where: Record<string, unknown> = {}

  if (leadId) {
    where.leadId = leadId
  }

  if (metalType) {
    where.metalType = metalType
  }

  const purchases = await prisma.purchase.findMany({
    where,
    include: {
      lead: {
        select: { id: true, name: true, phone: true, email: true },
      },
      user: {
        select: { id: true, name: true, email: true },
      },
      inventoryItem: {
        select: { id: true, name: true, status: true },
      },
    },
    orderBy: { purchaseDate: "desc" },
  })

  return NextResponse.json(purchases)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      leadId,
      description,
      metalType,
      weight,
      weightUnit,
      purity,
      pricePaid,
      pricePerUnit,
      category,
      subcategory,
      purchaseDate,
      notes,
      paymentMethod,
      purchaseNumber: providedPurchaseNumber,
      quantity: rawQuantity,
    } = body
    const parsedQuantity = parseInt(rawQuantity) || 0

    if (!leadId || !description || !metalType || !weight || !pricePaid) {
      return NextResponse.json(
        { error: "Lead, description, metal type, weight, and price are required" },
        { status: 400 }
      )
    }

    // Verify lead exists
    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    const parsedWeight = parseFloat(weight)
    const parsedPrice = parseFloat(pricePaid)
    const parsedWeightUnit = (weightUnit as WeightUnit) || WeightUnit.GRAM

    // Find or create InventoryItem if category+subcategory provided
    let inventoryItemId: string | null = null
    let generatedItemCode: string | null = null
    const effectiveSubcategory = subcategory || (metalType === "WATCH" ? "Watch" : null)
    if (category && effectiveSubcategory) {
      const isUniqueItem = metalType === "DIAMOND" || metalType === "JEWELRY" || metalType === "WATCH"

      if (isUniqueItem) {
        // Generate unique item code: D0001 for diamonds, J0001 for jewelry, W0001 for watches
        const prefix = metalType === "DIAMOND" ? "D" : metalType === "WATCH" ? "W" : "J"
        const lastCoded = await prisma.inventoryItem.findFirst({
          where: { itemCode: { startsWith: prefix } },
          orderBy: { itemCode: "desc" },
          select: { itemCode: true },
        })
        const nextNum = lastCoded?.itemCode
          ? parseInt(lastCoded.itemCode.slice(1)) + 1
          : 1000
        generatedItemCode = `${prefix}${String(nextNum).padStart(4, "0")}`

        // Use item code as subcategory for uniqueness
        const itemName = `${generatedItemCode} – ${effectiveSubcategory}`
        const inventoryItem = await prisma.inventoryItem.create({
          data: {
            itemCode: generatedItemCode,
            category,
            subcategory: generatedItemCode,
            name: itemName,
            weightUnit: parsedWeightUnit,
            totalWeight: parsedWeight,
            availableWeight: parsedWeight,
            totalCost: parsedPrice,
            quantity: parsedQuantity,
          },
        })
        inventoryItemId = inventoryItem.id
      } else {
        const itemName = `${subcategory} ${getCategoryLabel(category)}`
        const inventoryItem = await prisma.inventoryItem.upsert({
          where: { category_subcategory: { category, subcategory } },
          update: {
            totalWeight: { increment: parsedWeight },
            availableWeight: { increment: parsedWeight },
            totalCost: { increment: parsedPrice },
            quantity: { increment: parsedQuantity },
          },
          create: {
            category,
            subcategory,
            name: itemName,
            weightUnit: parsedWeightUnit,
            totalWeight: parsedWeight,
            availableWeight: parsedWeight,
            totalCost: parsedPrice,
            quantity: parsedQuantity,
          },
        })
        inventoryItemId = inventoryItem.id
      }
    }

    // Use provided purchase number (for multi-item batches) or auto-generate
    let purchaseNumber = providedPurchaseNumber || null
    if (!purchaseNumber) {
      const last = await prisma.purchase.findFirst({
        where: { purchaseNumber: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { purchaseNumber: true },
      })
      const nextNum = last?.purchaseNumber
        ? parseInt(last.purchaseNumber.replace("PUR-", "")) + 1
        : 1
      purchaseNumber = `PUR-${String(nextNum).padStart(4, "0")}`
    }

    const purchase = await prisma.purchase.create({
      data: {
        purchaseNumber,
        leadId,
        userId: session.user.id,
        description,
        metalType: metalType as MetalType,
        weight: parsedWeight,
        weightUnit: parsedWeightUnit,
        purity,
        pricePaid: parsedPrice,
        pricePerUnit: pricePerUnit ? parseFloat(pricePerUnit) : null,
        quantity: parsedQuantity,
        category: category || null,
        subcategory: effectiveSubcategory || null,
        inventoryItemId,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
        notes,
        paymentMethod: paymentMethod ? JSON.stringify(paymentMethod) : null,
      },
      include: {
        lead: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    })

    // Compute employee gross profit (jewelry gets recomputed once its metal is
    // saved via /api/jewelry; scrap/coins are complete here)
    await recalcPurchaseGrossProfit(purchase.id)

    // Update lead status to BOUGHT if not already
    if (lead.status !== "BOUGHT") {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "BOUGHT" },
      })
    }

    return NextResponse.json({ ...purchase, itemCode: generatedItemCode })
  } catch (error) {
    console.error("Error creating purchase:", error)
    return NextResponse.json(
      { error: "Failed to create purchase" },
      { status: 500 }
    )
  }
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    GOLD_JEWELRY: "Gold Jewelry",
    SILVER: "Silver",
    COINS_SILVER: "Silver Coins/Bars",
    COINS_GOLD: "Gold Coins/Bars",
  }
  return labels[category] || category
}
