import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MetalType, WeightUnit } from "@/generated/prisma/client"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const categories = await prisma.stockCategory.findMany({
    include: { subcategories: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  })

  return NextResponse.json(categories)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, metalType, weightUnit, subcategories } = await request.json()

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  try {
    const maxOrder = await prisma.stockCategory.aggregate({ _max: { sortOrder: true } })
    const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1

    const category = await prisma.stockCategory.create({
      data: {
        name,
        metalType: (metalType as MetalType) || "GOLD",
        weightUnit: (weightUnit as WeightUnit) || "GRAM",
        sortOrder: nextOrder,
        subcategories: {
          create: (subcategories || []).map((sub: string, i: number) => ({
            name: sub,
            sortOrder: i,
          })),
        },
      },
      include: { subcategories: { orderBy: { sortOrder: "asc" } } },
    })

    return NextResponse.json(category)
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create category"
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
