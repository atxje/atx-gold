import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { recalcGrossProfitForInventoryItem } from "@/lib/compensation"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const inventoryItemId = searchParams.get("inventoryItemId")
  if (!inventoryItemId) return NextResponse.json({ error: "inventoryItemId required" }, { status: 400 })

  const details = await prisma.jewelryDetails.findUnique({
    where: { inventoryItemId },
  })

  return NextResponse.json(details)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { inventoryItemId, ...fields } = body

  if (!inventoryItemId) return NextResponse.json({ error: "inventoryItemId required" }, { status: 400 })

  try {
    const details = await prisma.jewelryDetails.upsert({
      where: { inventoryItemId },
      create: { inventoryItemId, ...fields },
      update: fields,
    })

    // Metal is now known → (re)compute gross profit on the linked purchase(s)
    await recalcGrossProfitForInventoryItem(inventoryItemId)

    return NextResponse.json(details)
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to save jewelry details"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
