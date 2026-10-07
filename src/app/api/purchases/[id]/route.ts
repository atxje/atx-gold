import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recalcPurchaseGrossProfit, COMP_RATE } from "@/lib/compensation"
import { getSpotPrices } from "@/lib/spot"
import { parsePurchaseDate } from "@/lib/purchase-date"
import { applyOverpayFlag, loadGuidelines, stripOverpay } from "@/lib/overpay"
import { nextPurchaseNumber, TX_OPTIONS } from "@/lib/doc-numbers"
import {
  createPurchaseLine,
  pickDiamond,
  pickJewelry,
  pickWatch,
  PurchaseInputError,
  type PurchaseLineInput,
} from "@/lib/purchases"

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
      lead: { select: { id: true, name: true, phone: true, email: true, address: true, idNumber: true } },
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

  // Overpay flags are admin-only — strip them for everyone else
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ ...stripOverpay(purchase), items: itemsWithComp.map(stripOverpay) })
  }
  return NextResponse.json({ ...purchase, items: itemsWithComp })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { purchaseDate, notes, paymentMethod, items, removeItemIds, newItems, seller } = await request.json()

  const paymentMethodJson = paymentMethod?.length ? JSON.stringify(paymentMethod) : null

  // Grab purchaseNumber before any deletions so we can find surviving siblings
  const original = await prisma.purchase.findUnique({
    where: { id },
    select: { purchaseNumber: true, leadId: true },
  })
  if (!original) return NextResponse.json({ error: "Purchase not found" }, { status: 404 })
  let purchaseNumber = original.purchaseNumber

  const editedIds: string[] = []

  // Removals, edits and added lines are saved together: all or nothing
  try {
    await prisma.$transaction(async (tx) => {
      // Seller address / DL# for the bill of sale
      if (seller) {
        await tx.lead.update({
          where: { id: original.leadId },
          data: {
            address: (seller.address || "").trim() || null,
            idNumber: (seller.idNumber || "").trim() || null,
          },
        })
      }

      // Delete removed items and reverse their inventory effects
      for (const removeId of removeItemIds ?? []) {
        const purchase = await tx.purchase.findUnique({ where: { id: removeId } })
        if (!purchase) continue

        if (purchase.inventoryItemId) {
          await tx.inventoryItem.update({
            where: { id: purchase.inventoryItemId },
            data: {
              totalWeight: { decrement: purchase.weight },
              availableWeight: { decrement: purchase.weight },
              totalCost: { decrement: purchase.pricePaid },
              ...(purchase.quantity > 0 && { quantity: { decrement: purchase.quantity } }),
            },
          })
        }

        await tx.purchase.delete({ where: { id: removeId } })
      }

      for (const item of items ?? []) {
        const existing = await tx.purchase.findUnique({ where: { id: item.id } })
        if (!existing) continue
        editedIds.push(existing.id)

        const weightDelta = item.weight - existing.weight
        const priceDelta = item.pricePaid - existing.pricePaid
        const qtyDelta = (item.quantity ?? 0) - (existing.quantity ?? 0)

        await tx.purchase.update({
          where: { id: item.id },
          data: {
            description: item.description,
            quantity: item.quantity ?? 0,
            weight: item.weight,
            pricePerUnit: item.pricePerUnit ?? null,
            pricePaid: item.pricePaid,
            purchaseDate: purchaseDate ? parsePurchaseDate(purchaseDate) : undefined,
            notes: notes ?? null,
            paymentMethod: paymentMethodJson,
          },
        })

        // Sync inventory if weight, price, or quantity changed
        if (existing.inventoryItemId && (weightDelta !== 0 || priceDelta !== 0 || qtyDelta !== 0)) {
          await tx.inventoryItem.update({
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

        if (item.diamondData && existing.inventoryItemId) {
          const d = pickDiamond(item.diamondData)
          await tx.diamondDetails.upsert({
            where: { inventoryItemId: existing.inventoryItemId },
            update: d,
            create: { inventoryItemId: existing.inventoryItemId, ...d },
          })
        }
        if (item.jewelryData && existing.inventoryItemId) {
          const d = pickJewelry(item.jewelryData)
          await tx.jewelryDetails.upsert({
            where: { inventoryItemId: existing.inventoryItemId },
            update: d,
            create: { inventoryItemId: existing.inventoryItemId, ...d },
          })
        }
        if (item.watchData && existing.inventoryItemId) {
          const d = pickWatch(item.watchData)
          await tx.watchDetails.upsert({
            where: { inventoryItemId: existing.inventoryItemId },
            update: d,
            create: { inventoryItemId: existing.inventoryItemId, ...d },
          })
        }
      }

      // New lines added while editing join the same purchase document
      if (newItems?.length) {
        const number = purchaseNumber || (await nextPurchaseNumber(tx))
        if (!purchaseNumber && !(removeItemIds ?? []).includes(id)) {
          // Legacy row without a number: give the whole document one now
          await tx.purchase.update({ where: { id }, data: { purchaseNumber: number } })
        }
        purchaseNumber = number
        const header = {
          purchaseNumber: number,
          leadId: original.leadId,
          userId: session.user.id,
          purchaseDate: purchaseDate ? parsePurchaseDate(purchaseDate) : new Date(),
          notes: notes || null,
          paymentMethod: paymentMethodJson,
        }
        for (const line of newItems as PurchaseLineInput[]) {
          const created = await createPurchaseLine(tx, header, line)
          editedIds.push(created.id)
        }
      }
    }, TX_OPTIONS)
  } catch (error) {
    if (error instanceof PurchaseInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("Error updating purchase:", error)
    return NextResponse.json(
      { error: "Failed to save changes — nothing was changed. Please try again." },
      { status: 500 }
    )
  }

  // Recompute gross profit on every edited item (weight/price may have changed)
  try {
    const spot = await getSpotPrices()
    for (const pid of editedIds) await recalcPurchaseGrossProfit(pid, spot)
  } catch {}

  // Recompute overpay flags — informational, never blocks the save
  try {
    const spot = await getSpotPrices()
    const guidelines = await loadGuidelines()
    for (const pid of editedIds) await applyOverpayFlag(pid, guidelines, spot)
  } catch {}

  // Re-fetch the full document to return — if the original id was deleted, find a surviving sibling
  let purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true, address: true, idNumber: true } },
      inventoryItem: { include: { diamondDetails: true, jewelryDetails: true, watchDetails: true } },
    },
  })
  if (!purchase && purchaseNumber) {
    purchase = await prisma.purchase.findFirst({
      where: { purchaseNumber },
      include: {
        lead: { select: { id: true, name: true, phone: true, email: true, address: true, idNumber: true } },
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

  // Overpay flags are admin-only — strip them for everyone else
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ ...stripOverpay(purchase), items: allItems.map(stripOverpay) })
  }
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
