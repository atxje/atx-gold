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
  const { status, askingPrice } = body

  const data: Record<string, unknown> = {}
  if (status !== undefined) data.status = status as InventoryStatus
  if (askingPrice !== undefined) data.askingPrice = askingPrice

  const item = await prisma.inventoryItem.update({
    where: { id },
    data,
  })

  return NextResponse.json(item)
}
