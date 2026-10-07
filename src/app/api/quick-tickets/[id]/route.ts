import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/quick-tickets/[id] — ticket with seller details (for print / completing)
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const ticket = await prisma.quickTicket.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true, address: true, idNumber: true } },
      user: { select: { name: true } },
    },
  })
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })

  // Completed tickets link to the purchase that took over their number
  let purchaseId: string | null = null
  if (ticket.status === "COMPLETED") {
    const p = await prisma.purchase.findFirst({ where: { purchaseNumber: ticket.purchaseNumber }, select: { id: true } })
    purchaseId = p?.id ?? null
  }
  return NextResponse.json({ ...ticket, purchaseId })
}

// DELETE /api/quick-tickets/[id] — void an open ticket (admins only)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Only an admin can delete a ticket" }, { status: 403 })
  const { id } = await params
  const ticket = await prisma.quickTicket.findUnique({ where: { id }, select: { status: true } })
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  if (ticket.status !== "OPEN") {
    return NextResponse.json({ error: "This ticket is already a completed purchase — delete the purchase instead" }, { status: 409 })
  }
  await prisma.quickTicket.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
