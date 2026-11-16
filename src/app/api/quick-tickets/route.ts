import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { nextPurchaseNumber, TX_OPTIONS } from "@/lib/doc-numbers"
import { parsePurchaseDate } from "@/lib/purchase-date"
import { resolveSeller, SellerError } from "@/lib/seller-fields"
import { scheduleReviewRequest, requestOrigin } from "@/lib/review-requests"
import { parseTicketBody, paymentJson } from "@/lib/quick-tickets"

// Quick tickets: the short bill of sale signed at the desk; completed later
// into a full purchase under the same PUR number.

// GET /api/quick-tickets?status=OPEN
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const status = new URL(request.url).searchParams.get("status")
  const tickets = await prisma.quickTicket.findMany({
    where: status === "OPEN" || status === "COMPLETED" ? { status } : undefined,
    include: { lead: { select: { id: true, name: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(tickets)
}

// POST /api/quick-tickets — save a signed ticket
// Body: { leadId | newLead, seller, purchaseDate, notes, paymentMethod,
//         lines: [{ categoryId, category, type, quantity, weight, weightUnit, description }],
//         categoryTotals: [{ category, amount }] }
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()

    const parsed = parseTicketBody(body)
    if (parsed.error !== undefined) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { lines, categoryTotals, total } = parsed

    const userId = session.user.id
    const ticket = await prisma.$transaction(async (tx) => {
      const leadId = await resolveSeller(tx, { leadId: body.leadId, newLead: body.newLead, seller: body.seller }, userId)
      const purchaseNumber = await nextPurchaseNumber(tx)
      return tx.quickTicket.create({
        data: {
          purchaseNumber,
          leadId,
          userId,
          purchaseDate: body.purchaseDate ? parsePurchaseDate(body.purchaseDate) : new Date(),
          lines: lines as unknown as object,
          categoryTotals,
          total,
          paymentMethod: paymentJson(body),
          notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
        },
      })
    }, TX_OPTIONS)

    // Thank-you text with the Google review link, sent later by Twilio.
    // Runs after the save is committed and can never fail the ticket.
    const review = body.sendReviewRequest === false
      ? { status: "skipped" as const, reason: "Turned off for this ticket" }
      : await scheduleReviewRequest({
          leadId: ticket.leadId,
          purchaseNumber: ticket.purchaseNumber,
          purchaseDate: body.purchaseDate ? parsePurchaseDate(body.purchaseDate) : null,
          origin: requestOrigin(request),
        })

    return NextResponse.json({ ...ticket, review })
  } catch (error) {
    if (error instanceof SellerError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("Error creating quick ticket:", error)
    return NextResponse.json({ error: "Failed to save the ticket — nothing was saved. Please try again." }, { status: 500 })
  }
}
