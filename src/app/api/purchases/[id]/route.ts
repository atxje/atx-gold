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

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true } },
      user: { select: { id: true, name: true, email: true } },
      inventoryItem: { include: { diamondDetails: true, jewelryDetails: true } },
    },
  })

  if (!purchase) return NextResponse.json({ error: "Purchase not found" }, { status: 404 })

  let items = [purchase]
  if (purchase.purchaseNumber) {
    items = await prisma.purchase.findMany({
      where: { purchaseNumber: purchase.purchaseNumber },
      include: { inventoryItem: { include: { diamondDetails: true, jewelryDetails: true } } },
      orderBy: { createdAt: "asc" },
    }) as typeof items
  }

  return NextResponse.json({ ...purchase, items })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { purchaseDate, notes, paymentMethod, items, removeItemIds } = await request.json()

  const paymentMethodJson = paymentMethod?.length ? JSON.stringify(paymentMethod) : null

  // Grab purchaseNumber before any deletions so we can find surviving siblings
  const original = await prisma.purchase.findUnique({ where: { id }, select: { purchaseNumber: true } })
  const purchaseNumber = original?.purchaseNumber

  // Delete removed items and reverse their inventory effects
  if (removeItemIds?.length) {
    for (const removeId of removeItemIds) {
      const purchase = await prisma.purchase.findUnique({ where: { id: removeId } })
      if (!purchase) continue

      if (purchase.inventoryItemId) {
        await prisma.inventoryItem.update({
          where: { id: purchase.inventoryItemId },
          data: {
            totalWeight: { decrement: purchase.weight },
            availableWeight: { decrement: purchase.weight },
            totalCost: { decrement: purchase.pricePaid },
          },
        })
      }

      await prisma.purchase.delete({ where: { id: removeId } })
    }
  }

  for (const item of items ?? []) {
    const existing = await prisma.purchase.findUnique({ where: { id: item.id } })
    if (!existing) continue

    const weightDelta = item.weight - existing.weight
    const priceDelta = item.pricePaid - existing.pricePaid

    await prisma.purchase.update({
      where: { id: item.id },
      data: {
        description: item.description,
        weight: item.weight,
        pricePerUnit: item.pricePerUnit ?? null,
        pricePaid: item.pricePaid,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        notes: notes ?? null,
        paymentMethod: paymentMethodJson,
      },
    })

    // Sync inventory if weight or price changed
    if (existing.inventoryItemId && (weightDelta !== 0 || priceDelta !== 0)) {
      await prisma.inventoryItem.update({
        where: { id: existing.inventoryItemId },
        data: {
          ...(weightDelta !== 0 && {
            totalWeight: { increment: weightDelta },
            availableWeight: { increment: weightDelta },
          }),
          ...(priceDelta !== 0 && {
            totalCost: { increment: priceDelta },
          }),
        },
      })
    }

    // Update diamond details if present
    if (item.diamondData && existing.inventoryItemId) {
      await prisma.diamondDetails.upsert({
        where: { inventoryItemId: existing.inventoryItemId },
        update: item.diamondData,
        create: { inventoryItemId: existing.inventoryItemId, ...item.diamondData },
      })
    }

    // Update jewelry details if present
    if (item.jewelryData && existing.inventoryItemId) {
      await prisma.jewelryDetails.upsert({
        where: { inventoryItemId: existing.inventoryItemId },
        update: item.jewelryData,
        create: { inventoryItemId: existing.inventoryItemId, ...item.jewelryData },
      })
    }
  }

  // Re-fetch the full document to return — if the original id was deleted, find a surviving sibling
  let purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true } },
      inventoryItem: { include: { diamondDetails: true, jewelryDetails: true } },
    },
  })
  if (!purchase && purchaseNumber) {
    purchase = await prisma.purchase.findFirst({
      where: { purchaseNumber },
      include: {
        lead: { select: { id: true, name: true, phone: true, email: true } },
        inventoryItem: { include: { diamondDetails: true, jewelryDetails: true } },
      },
    })
  }
  if (!purchase) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const allItems = purchase.purchaseNumber
    ? await prisma.purchase.findMany({
        where: { purchaseNumber: purchase.purchaseNumber },
        include: { inventoryItem: { include: { diamondDetails: true, jewelryDetails: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [purchase]

  return NextResponse.json({ ...purchase, items: allItems })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  try {
    await prisma.purchase.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting purchase:", error)
    return NextResponse.json({ error: "Failed to delete purchase" }, { status: 500 })
  }
}
