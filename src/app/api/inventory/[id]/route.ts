import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { InventoryStatus } from "@/generated/prisma/client"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      diamondDetails: true,
      jewelryDetails: true,
      watchDetails: true,
      purchases: {
        include: { lead: { select: { id: true, name: true, phone: true } } },
        orderBy: { purchaseDate: "desc" },
      },
      invoiceItems: {
        include: {
          invoice: {
            select: { id: true, invoiceNumber: true, buyerName: true, date: true },
          },
        },
      },
      memoItems: {
        include: {
          memo: {
            select: { id: true, memoNumber: true, customerName: true, memoDate: true, status: true },
          },
        },
      },
      mixTransferItems: {
        include: {
          mixTransfer: {
            include: {
              items: {
                include: { inventoryItem: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
    },
  })

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(item)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { status, askingPrice, totalWeight, totalCost, diamondData, jewelryData, watchData } = body

  const current = await prisma.inventoryItem.findUnique({ where: { id } })
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (status !== undefined) data.status = status as InventoryStatus
  if (askingPrice !== undefined) data.askingPrice = askingPrice
  if (totalWeight !== undefined) {
    const newWeight = parseFloat(totalWeight) || 0
    const delta = newWeight - current.totalWeight
    data.totalWeight = newWeight
    // Keep the unsold/available portion in step with the total change
    data.availableWeight = Math.max(0, current.availableWeight + delta)
  }
  if (totalCost !== undefined) {
    data.totalCost = parseFloat(totalCost) || 0
  }

  await prisma.inventoryItem.update({ where: { id }, data })

  // Upsert detail records (client sends already-typed values: numbers or null)
  if (diamondData) {
    await prisma.diamondDetails.upsert({
      where: { inventoryItemId: id },
      update: diamondData,
      create: { inventoryItemId: id, ...diamondData },
    })
  }
  if (jewelryData) {
    await prisma.jewelryDetails.upsert({
      where: { inventoryItemId: id },
      update: jewelryData,
      create: { inventoryItemId: id, ...jewelryData },
    })
  }
  if (watchData) {
    await prisma.watchDetails.upsert({
      where: { inventoryItemId: id },
      update: watchData,
      create: { inventoryItemId: id, ...watchData },
    })
  }

  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: { diamondDetails: true, jewelryDetails: true, watchDetails: true },
  })

  return NextResponse.json(item)
}
