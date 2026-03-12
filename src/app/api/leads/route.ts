import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { LeadSource, LeadChannel, LeadStatus } from "@/generated/prisma/client"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") as LeadStatus | null
  const search = searchParams.get("search")
  const followUpFilter = searchParams.get("followUp")

  const where: Record<string, unknown> = {}

  if (status) {
    where.status = status
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
    ]
  }

  if (followUpFilter === "overdue") {
    where.followUpDate = { lt: new Date() }
    where.status = { notIn: ["BOUGHT", "NO_SALE"] }
  } else if (followUpFilter === "upcoming") {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 7)
    where.followUpDate = {
      gte: new Date(),
      lte: tomorrow,
    }
    where.status = { notIn: ["BOUGHT", "NO_SALE"] }
  }

  const leads = await prisma.lead.findMany({
    where,
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { appointments: true, purchases: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(leads)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, phone, email, notes, source, channel, status, followUpDate } = body

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const lead = await prisma.lead.create({
      data: {
        name,
        phone,
        email,
        notes,
        source: source as LeadSource || "ORGANIC",
        channel: channel as LeadChannel || "PHONE",
        status: status as LeadStatus || "NEW",
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        createdById: session.user.id,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json(lead)
  } catch (error) {
    console.error("Error creating lead:", error)
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 })
  }
}
