import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MetalType, WeightUnit } from "@/generated/prisma/client"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { name, metalType, weightUnit, subcategories } = await request.json()

  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name
  if (metalType !== undefined) data.metalType = metalType as MetalType
  if (weightUnit !== undefined) data.weightUnit = weightUnit as WeightUnit

  const category = await prisma.stockCategory.update({
    where: { id },
    data,
    include: { subcategories: { orderBy: { sortOrder: "asc" } } },
  })

  // Sync subcategories if provided
  if (subcategories !== undefined) {
    const existing = category.subcategories
    const newNames: string[] = subcategories

    // Delete removed
    const toDelete = existing.filter(e => !newNames.includes(e.name))
    if (toDelete.length) {
      await prisma.stockSubcategory.deleteMany({
        where: { id: { in: toDelete.map(d => d.id) } },
      })
    }

    // Add new and update order
    for (let i = 0; i < newNames.length; i++) {
      const ex = existing.find(e => e.name === newNames[i])
      if (ex) {
        await prisma.stockSubcategory.update({ where: { id: ex.id }, data: { sortOrder: i } })
      } else {
        await prisma.stockSubcategory.create({
          data: { categoryId: id, name: newNames[i], sortOrder: i },
        })
      }
    }
  }

  const updated = await prisma.stockCategory.findUnique({
    where: { id },
    include: { subcategories: { orderBy: { sortOrder: "asc" } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  await prisma.stockCategory.delete({ where: { id } })

  return NextResponse.json({ deleted: true })
}
