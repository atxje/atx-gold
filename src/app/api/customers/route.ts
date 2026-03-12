import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(customers)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const { name, address, phone, contactPerson, salesTax } = body

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  const customer = await prisma.customer.create({
    data: { name, address: address || null, phone: phone || null, contactPerson: contactPerson || null, salesTax: !!salesTax },
  })

  return NextResponse.json(customer)
}
