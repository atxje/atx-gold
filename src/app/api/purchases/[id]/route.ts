import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recalcPurchaseGrossProfit, COMP_RATE } from "@/lib/compensation"
import { getSpotPrices } from "@/lib/spot"

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
      inventoryItem: { include: { diamondDetails: true, jewelryDetails: true, watchDetails: true } },
    },
  })

  if (!purchase) return NextResponse.json({ error: "Purchase not found" }, { status: 404 })

  let items = [purchase]
  if (purchase.purchaseNumber) {
    items = await prisma.purchase.findMany({
      where: { purchaseNumber: purchase.purchaseNumber },
      include: { inventoryItem: { include: { diamondDetails: true, jewelryDetails: true, watchDetails: true } } },
      orderBy: { createdAt: "asc" },
    }) as typeof items
  }

  // Compensation earned on each line: a flat 10% of its gross profit
  const itemsWithComp = items.map((i) => ({
    ...i,
    comp: i.grossProfit == null ? null : COMP_RATE * i.grossProfit,
  }))

  return NextResponse.json({ ...purchase, items: itemsWithComp })
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
    const qtyDelta = (item.quantity ?? 0) - (existing.quantity ?? 0)

    await prisma.purchase.update({
      where: { id: item.id },
      data: {
        description: item.description,
        quantity: item.quantity ?? 0,
        weight: item.weight,
        pricePerUnit: item.pricePerUnit ?? null,
        pricePaid: item.pricePaid,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        notes: notes ?? null,
        paymentMethod: paymentMethodJson,
      },
    })

    // Sync inventory if weight, price, or quantity changed
    if (existing.inventoryItemId && (weightDelta !== 0 || priceDelta !== 0 || qtyDelta !== 0)) {
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
          ...(qtyDelta !== 0 && {
            quantity: { increment: qtyDelta },
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

    // Update watch details if present
    if (item.watchData && existing.inventoryItemId) {
      await prisma.watchDetails.upsert({
        where: { inventoryItemId: existing.inventoryItemId },
        update: item.watchData,
        create: { inventoryItemId: existing.inventoryItemId, ...item.watchData },
      })
    }
  }

  // Recompute gross profit on every edited item (weight/price may have changed)
  try {
    const spot = await getSpotPrices()
    for (const item of items ?? []) {
      if (item.id) await recalcPurchaseGrossProfit(item.id, spot)
    }
  } catch {}

  // Re-fetch the full document to return — if the original id was deleted, find a surviving sibling
  let purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true } },
      inventoryItem: { include: { diamondDetails: true, jewelryDetails: true, watchDetails: true } },
    },
  })
  if (!purchase && purchaseNumber) {
    purchase = await prisma.purchase.findFirst({
      where: { purchaseNumber },
      include: {
        lead: { select: { id: true, name: true, phone: true, email: true } },
        inventoryItem: { include: { diamondDetails: true, jewelryDetails: true, watchDetails: true } },
      },
    })
  }
  if (!purchase) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const allItems = purchase.purchaseNumber
    ? await prisma.purchase.findMany({
        where: { purchaseNumber: purchase.purchaseNumber },
        include: { inventoryItem: { include: { diamondDetails: true, jewelryDetails: true, watchDetails: true } } },
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
  const { searchParams } = new URL(request.url)
  const scopeDocument = searchParams.get("scope") === "document"

  const target = await prisma.purchase.findUnique({
    where: { id },
    select: { id: true, purchaseNumber: true },
  })
  if (!target) return NextResponse.json({ error: "Purchase not found" }, { status: 404 })

  // Which purchase rows to remove: just this line, or the whole document
  const toDelete = await prisma.purchase.findMany({
    where: scopeDocument && target.purchaseNumber ? { purchaseNumber: target.purchaseNumber } : { id },
    select: { id: true, weight: true, pricePaid: true, quantity: true, inventoryItemId: true },
  })

  const itemIds = [...new Set(toDelete.map((p) => p.inventoryItemId).filter(Boolean))] as string[]

  // Block deletion if the linked stock already has downstream documents — removing
  // it would corrupt sale/memo/mix records
  if (itemIds.length) {
    const [inv, memo, mix] = await Promise.all([
      prisma.invoiceItem.count({ where: { inventoryItemId: { in: itemIds } } }),
      prisma.memoItem.count({ where: { inventoryItemId: { in: itemIds } } }),
      prisma.mixTransferItem.count({ where: { inventoryItemId: { in: itemIds } } }),
    ])
    if (inv > 0 || memo > 0 || mix > 0) {
      return NextResponse.json(
        { error: "This purchase's stock has been invoiced, memoed, or mixed/transferred. Reverse those documents first." },
        { status: 409 }
      )
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Reverse each purchase's contribution to its inventory item
      for (const p of toDelete) {
        if (p.inventoryItemId) {
          await tx.inventoryItem.update({
            where: { id: p.inventoryItemId },
            data: {
              totalWeight: { decrement: p.weight },
              availableWeight: { decrement: p.weight },
              totalCost: { decrement: p.pricePaid },
              quantity: { decrement: p.quantity },
            },
          })
        }
      }

      await tx.purchase.deleteMany({ where: { id: { in: toDelete.map((p) => p.id) } } })

      // Remove now-orphaned coded items (jewelry/diamond/watch); details cascade
      for (const itemId of itemIds) {
        const item = await tx.inventoryItem.findUnique({ where: { id: itemId }, select: { itemCode: true } })
        if (!item?.itemCode) continue
        const remaining = await tx.purchase.count({ where: { inventoryItemId: itemId } })
        if (remaining === 0) await tx.inventoryItem.delete({ where: { id: itemId } })
      }
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting purchase:", error)
    return NextResponse.json({ error: "Failed to delete purchase" }, { status: 500 })
  }
}
