import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const prefix = searchParams.get("prefix")
  if (!prefix || !["D", "J", "W"].includes(prefix)) {
    return NextResponse.json({ error: "prefix must be D, J, or W" }, { status: 400 })
  }

  const last = await prisma.inventoryItem.findFirst({
    where: { itemCode: { startsWith: prefix } },
    orderBy: { itemCode: "desc" },
    select: { itemCode: true },
  })

  const nextNum = last?.itemCode ? parseInt(last.itemCode.slice(1)) + 1 : 1000

  return NextResponse.json({ nextNum })
}
