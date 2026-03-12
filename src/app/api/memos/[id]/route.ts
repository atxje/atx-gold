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

  const memo = await prisma.memo.findUnique({
    where: { id },
    include: {
      items: {
        include: { inventoryItem: { select: { id: true, name: true, weightUnit: true } } },
      },
    },
  })

  if (!memo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(memo)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const memo = await prisma.memo.findUnique({ where: { id }, include: { items: true } })
  if (!memo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Status-only update (return/convert)
  if (body.status) {
    if (body.status === "RETURNED" && memo.status === "ACTIVE") {
      for (const item of memo.items) {
        if (item.status === "ACTIVE") {
          await prisma.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { availableWeight: { increment: item.weight } },
          })
        }
      }
    }
    const updated = await prisma.memo.update({ where: { id }, data: { status: body.status } })
    return NextResponse.json(updated)
  }

  // Field edit update
  const { customerName, customerEmail, customerPhone, returnDate, notes, items } = body

  if (items?.length) {
    for (const item of items) {
      await prisma.memoItem.update({
        where: { id: item.id },
        data: { description: item.description, pricePerUnit: item.pricePerUnit, totalValue: item.totalValue },
      })
    }
  }

  const newTotal = items?.reduce((s: number, i: { totalValue: number }) => s + i.totalValue, 0) ?? memo.totalValue

  const updated = await prisma.memo.update({
    where: { id },
    data: {
      customerName: customerName ?? memo.customerName,
      customerEmail: customerEmail ?? memo.customerEmail,
      customerPhone: customerPhone ?? memo.customerPhone,
      returnDate: returnDate ? new Date(returnDate) : memo.returnDate,
      notes: notes ?? memo.notes,
      totalValue: newTotal,
    },
    include: { items: { include: { inventoryItem: { select: { id: true, name: true, weightUnit: true } } } } },
  })

  return NextResponse.json(updated)
}
