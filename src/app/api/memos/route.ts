import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { WeightUnit } from "@/generated/prisma/client"
import { nextMemoNumber, TX_OPTIONS } from "@/lib/doc-numbers"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const memos = await prisma.memo.findMany({
    include: { items: { include: { inventoryItem: { select: { name: true } } } } },
    orderBy: { memoDate: "desc" },
  })

  return NextResponse.json(memos)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { customerId, customerName, customerEmail, customerPhone, memoDate, returnDate, notes, items } = body

    if (!customerName || !returnDate || !items?.length) {
      return NextResponse.json({ error: "Customer name, return date, and items are required" }, { status: 400 })
    }

    const totalValue = items.reduce((sum: number, i: { totalValue: number }) => sum + i.totalValue, 0)

    // Number, inventory hold and memo are saved together: all or nothing
    const memo = await prisma.$transaction(async (tx) => {
      const memoNumber = await nextMemoNumber(tx)

      // Deduct availableWeight from each inventory item
      for (const item of items) {
        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: { availableWeight: { decrement: item.weight } },
        })
      }

      return tx.memo.create({
        data: {
          memoNumber,
          customerId: customerId || null,
          customerName,
          customerEmail: customerEmail || null,
          customerPhone: customerPhone || null,
          memoDate: memoDate ? new Date(memoDate) : new Date(),
          returnDate: new Date(returnDate),
          totalValue,
          notes: notes || null,
          items: {
            create: items.map((item: {
              inventoryItemId: string
              description: string
              quantity?: number
              weight: number
              weightUnit: string
              pricePerUnit: number
              totalValue: number
            }) => ({
              inventoryItemId: item.inventoryItemId,
              description: item.description,
              quantity: item.quantity ?? 0,
              weight: item.weight,
              weightUnit: item.weightUnit as WeightUnit,
              pricePerUnit: item.pricePerUnit,
              totalValue: item.totalValue,
            })),
          },
        },
        include: { items: { include: { inventoryItem: { select: { name: true } } } } },
      })
    }, TX_OPTIONS)

    return NextResponse.json(memo)
  } catch (error) {
    console.error("Error creating memo:", error)
    return NextResponse.json({ error: "Failed to create memo" }, { status: 500 })
  }
}
