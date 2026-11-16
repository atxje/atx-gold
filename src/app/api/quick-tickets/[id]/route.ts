import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cancelReviewRequests } from "@/lib/review-requests"
import { TX_OPTIONS } from "@/lib/doc-numbers"
import { parsePurchaseDate } from "@/lib/purchase-date"
import { resolveSeller, SellerError } from "@/lib/seller-fields"
import { parseTicketBody, paymentJson } from "@/lib/quick-tickets"

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

// PATCH /api/quick-tickets/[id] — correct an open ticket (admins only).
// Same body as creating one; the PUR number stays the same.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Only an admin can edit a ticket" }, { status: 403 })
  const { id } = await params

  try {
    const body = await request.json()
    const parsed = parseTicketBody(body)
    if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { lines, categoryTotals, total } = parsed
    const userId = session.user.id

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.quickTicket.findUnique({ where: { id }, select: { status: true, leadId: true, purchaseNumber: true } })
      if (!existing) return { notFound: true as const }
      if (existing.status !== "OPEN") return { completed: true as const }
      const leadId = await resolveSeller(tx, { leadId: body.leadId, newLead: body.newLead, seller: body.seller }, userId)
      const ticket = await tx.quickTicket.update({
        where: { id },
        data: {
          leadId,
          ...(body.purchaseDate ? { purchaseDate: parsePurchaseDate(body.purchaseDate) } : {}),
          lines: lines as unknown as object,
          categoryTotals,
          total,
          paymentMethod: paymentJson(body),
          notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
        },
      })
      return { ticket, sellerChanged: leadId !== existing.leadId }
    }, TX_OPTIONS)

    if ("notFound" in result) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
    if ("completed" in result) {
      return NextResponse.json({ error: "This ticket is already a completed purchase — edit the purchase instead" }, { status: 409 })
    }
    // A different seller now: the thank-you text queued for the old one must not go out
    if (result.sellerChanged) await cancelReviewRequests({ purchaseNumber: result.ticket.purchaseNumber })
    return NextResponse.json(result.ticket)
  } catch (error) {
    if (error instanceof SellerError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("Error editing quick ticket:", error)
    return NextResponse.json({ error: "Failed to save the changes — nothing was changed. Please try again." }, { status: 500 })
  }
}

// DELETE /api/quick-tickets/[id] — void an open ticket (admins only)
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Only an admin can delete a ticket" }, { status: 403 })
  const { id } = await params
  const ticket = await prisma.quickTicket.findUnique({ where: { id }, select: { status: true, purchaseNumber: true } })
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  if (ticket.status !== "OPEN") {
    return NextResponse.json({ error: "This ticket is already a completed purchase — delete the purchase instead" }, { status: 409 })
  }
  await prisma.quickTicket.delete({ where: { id } })
  // The sale didn't happen — don't send its review-request text
  await cancelReviewRequests({ purchaseNumber: ticket.purchaseNumber })
  return NextResponse.json({ deleted: true })
}
