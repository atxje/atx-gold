import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")

  const brands = await prisma.brand.findMany({
    where: type ? { type } : undefined,
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
  })

  return NextResponse.json(brands)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, type } = await request.json()

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  if (!["JEWELRY", "WATCH"].includes(type)) {
    return NextResponse.json({ error: "type must be JEWELRY or WATCH" }, { status: 400 })
  }

  try {
    const maxOrder = await prisma.brand.aggregate({ where: { type }, _max: { sortOrder: true } })
    const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1

    const brand = await prisma.brand.create({
      data: { name: name.trim(), type, sortOrder: nextOrder },
    })

    return NextResponse.json(brand)
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create brand"
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "That brand already exists" }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
