import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { name } = await request.json()

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  try {
    const brand = await prisma.brand.update({
      where: { id },
      data: { name: name.trim() },
    })
    return NextResponse.json(brand)
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update brand"
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "That brand already exists" }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  await prisma.brand.delete({ where: { id } })

  return NextResponse.json({ deleted: true })
}
