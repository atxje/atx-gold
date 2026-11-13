import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/inventory/mix/[id] — one mix / split document
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const transfer = await prisma.mixTransfer.findUnique({
    where: { id },
    include: {
      items: { include: { inventoryItem: { select: { id: true, name: true, weightUnit: true, itemCode: true } } } },
    },
  })
  if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 })
  const userIds = [transfer.userId, transfer.reversedById].filter((x): x is string => !!x)
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : []
  const nameOf = (uid: string | null) => users.find(u => u.id === uid)?.name ?? null
  return NextResponse.json({ ...transfer, userName: nameOf(transfer.userId), reversedByName: nameOf(transfer.reversedById) })
}
