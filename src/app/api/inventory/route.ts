import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const items = await prisma.inventoryItem.findMany({
    include: {
      purchases: {
        select: { id: true },
      },
      diamondDetails: true,
      jewelryDetails: true,
      watchDetails: true,
    },
    orderBy: { updatedAt: "desc" },
  })

  return NextResponse.json(items)
}
