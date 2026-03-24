import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { WeightUnit } from "@/generated/prisma/client"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const invoiceType = searchParams.get("type")

  const invoices = await prisma.invoice.findMany({
    where: invoiceType ? { invoiceType: invoiceType as "SALE" | "TRANSFER" } : undefined,
    include: { items: { include: { inventoryItem: { select: { name: true } } } } },
    orderBy: { date: "desc" },
  })

  return NextResponse.json(invoices)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { customerId, buyerName, buyerEmail, buyerPhone, buyerAddress, date, notes, items, memoItemIds, invoiceType: rawType } = body
    const invoiceType = rawType === "TRANSFER" ? "TRANSFER" : "SALE"

    if (!buyerName || !items?.length) {
      return NextResponse.json({ error: "Buyer name and items are required" }, { status: 400 })
    }

    // Auto-generate invoice number with prefix based on type
    const prefix = invoiceType === "TRANSFER" ? "TRN-" : "INV-"
    const last = await prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: "desc" },
    })
    const nextNum = last
      ? parseInt(last.invoiceNumber.replace(prefix, "")) + 1
      : 1
    const invoiceNumber = `${prefix}${String(nextNum).padStart(4, "0")}`

    const totalAmount = items.reduce((sum: number, i: { totalPrice: number }) => sum + i.totalPrice, 0)

    // Build inventoryItemId → memoItemId map for linking invoice items to memo items
    const memoItemMap: Record<string, string> = {}
    if (memoItemIds?.length) {
      for (const memoItemId of memoItemIds) {
        const memoItem = await prisma.memoItem.findUnique({ where: { id: memoItemId } })
        if (memoItem) {
          memoItemMap[memoItem.inventoryItemId] = memoItemId
          // Restore availableWeight so invoice can decrement it
          if (memoItem.status === "ACTIVE") {
            await prisma.inventoryItem.update({
              where: { id: memoItem.inventoryItemId },
              data: { availableWeight: { increment: memoItem.weight } },
            })
          }
        }
      }
    }

    // For each item: calculate cost basis, update inventory stats
    const itemsWithCost = []
    for (const item of items) {
      const invItem = await prisma.inventoryItem.findUnique({ where: { id: item.inventoryItemId } })
      if (!invItem) throw new Error(`Inventory item not found: ${item.inventoryItemId}`)

      const avgCostPerUnit = invItem.totalWeight > 0 ? invItem.totalCost / invItem.totalWeight : 0
      const costBasis = avgCostPerUnit * item.weight
      const profit = item.totalPrice - costBasis

      itemsWithCost.push({ ...item, costBasis, profit, memoItemId: memoItemMap[item.inventoryItemId] || null })

      await prisma.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: {
          availableWeight: { decrement: item.weight },
          soldWeight: { increment: item.weight },
          soldValue: { increment: item.totalPrice },
          totalProfit: { increment: profit },
          totalCost: { decrement: costBasis },
          ...(item.quantity > 0 && { quantity: { decrement: item.quantity } }),
        },
      })
    }

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        invoiceType,
        customerId: customerId || null,
        buyerName,
        buyerEmail: buyerEmail || null,
        buyerPhone: buyerPhone || null,
        buyerAddress: buyerAddress || null,
        date: date ? new Date(date) : new Date(),
        totalAmount,
        notes: notes || null,
        items: {
          create: itemsWithCost.map((item: {
            inventoryItemId: string
            description: string
            quantity?: number
            weight: number
            weightUnit: string
            pricePerUnit: number
            totalPrice: number
            costBasis: number
            profit: number
            memoItemId: string | null
          }) => ({
            inventoryItemId: item.inventoryItemId,
            description: item.description,
            quantity: item.quantity ?? 0,
            weight: item.weight,
            weightUnit: item.weightUnit as WeightUnit,
            pricePerUnit: item.pricePerUnit,
            totalPrice: item.totalPrice,
            costBasis: item.costBasis,
            profit: item.profit,
            memoItemId: item.memoItemId,
          })),
        },
      },
      include: { items: { include: { inventoryItem: { select: { name: true } } } } },
    })

    // Mark memo items as CONVERTED now that invoice is confirmed
    if (memoItemIds?.length) {
      for (const memoItemId of memoItemIds) {
        await prisma.memoItem.update({ where: { id: memoItemId }, data: { status: "CONVERTED" } })
      }
      // Update memo-level status
      const firstMemoItem = await prisma.memoItem.findUnique({ where: { id: memoItemIds[0] } })
      if (firstMemoItem) {
        const allItems = await prisma.memoItem.findMany({ where: { memoId: firstMemoItem.memoId } })
        const allDone = allItems.every(i => i.status !== "ACTIVE")
        if (allDone) {
          const anyConverted = allItems.some(i => i.status === "CONVERTED")
          await prisma.memo.update({ where: { id: firstMemoItem.memoId }, data: { status: anyConverted ? "CONVERTED" : "RETURNED" } })
        }
      }
    }

    return NextResponse.json(invoice)
  } catch (error) {
    console.error("Error creating invoice:", error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
