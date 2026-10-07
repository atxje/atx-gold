import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MetalType, LeadSource, LeadChannel } from "@/generated/prisma/client"
import { recalcPurchaseGrossProfit } from "@/lib/compensation"
import { parsePurchaseDate } from "@/lib/purchase-date"
import { applyOverpayFlag, stripOverpay } from "@/lib/overpay"
import { nextPurchaseNumber, TX_OPTIONS } from "@/lib/doc-numbers"
import { parseSellerFields } from "@/lib/seller-fields"
import { createPurchaseLine, PurchaseInputError, type PurchaseLineInput } from "@/lib/purchases"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const leadId = searchParams.get("leadId")
  const metalType = searchParams.get("metalType") as MetalType | null

  const where: Record<string, unknown> = {}

  if (leadId) {
    where.leadId = leadId
  }

  if (metalType) {
    where.metalType = metalType
  }

  const purchases = await prisma.purchase.findMany({
    where,
    include: {
      lead: {
        select: { id: true, name: true, phone: true, email: true },
      },
      user: {
        select: { id: true, name: true, email: true },
      },
      inventoryItem: {
        select: { id: true, name: true, status: true },
      },
    },
    orderBy: { purchaseDate: "desc" },
  })

  // Overpay flags are admin-only — strip them for everyone else
  const isAdmin = session.user.role === "ADMIN"
  return NextResponse.json(isAdmin ? purchases : purchases.map(stripOverpay))
}

// POST /api/purchases — record a purchase document.
//
// Body: { leadId | newLead, purchaseDate, notes, paymentMethod, items: [...] }
//   or the older single-line shape (the line's fields at the top level).
// Pass purchaseNumber to add lines to an existing document; otherwise a new
// number is issued. Everything — new lead, inventory, details, purchase rows,
// lead status — is saved in ONE transaction: all of it or none of it.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { leadId: bodyLeadId, newLead, purchaseDate, notes, paymentMethod, purchaseNumber: providedNumber, seller, ticketId } = body
    // Seller contact details (address, DL#, phone, email, source, channel)
    const sellerDetails = parseSellerFields(seller)
    const lines: PurchaseLineInput[] = Array.isArray(body.items) ? body.items : [body]

    if (!bodyLeadId && !newLead?.name) {
      return NextResponse.json({ error: "Seller is required" }, { status: 400 })
    }
    if (lines.length === 0) {
      return NextResponse.json({ error: "Add at least one item" }, { status: 400 })
    }
    for (const line of lines) {
      if (!line?.description || !line?.metalType || !line?.weight || !line?.pricePaid) {
        return NextResponse.json(
          { error: "Description, metal type, weight, and price are required for every item" },
          { status: 400 }
        )
      }
    }

    const userId = session.user.id
    const result = await prisma.$transaction(async (tx) => {
      // Seller: existing lead or a new one created in the same transaction
      let leadId: string
      let leadStatus: string
      if (bodyLeadId) {
        const lead = await tx.lead.findUnique({ where: { id: bodyLeadId }, select: { id: true, status: true } })
        if (!lead) throw new PurchaseInputError("Lead not found")
        leadId = lead.id
        leadStatus = lead.status
        if (sellerDetails) await tx.lead.update({ where: { id: leadId }, data: sellerDetails })
      } else {
        const lead = await tx.lead.create({
          data: {
            name: newLead.name,
            phone: newLead.phone || null,
            email: newLead.email || null,
            ...(sellerDetails ?? {}),
            source: (newLead.source as LeadSource) || "ORGANIC",
            channel: (newLead.channel as LeadChannel) || "PHONE",
            status: "BOUGHT",
            createdById: userId,
          },
          select: { id: true, status: true },
        })
        leadId = lead.id
        leadStatus = lead.status
      }

      // Completing a quick ticket: the purchase takes over the ticket's number,
      // and the ticket is marked completed in this same transaction
      let purchaseNumber: string
      if (ticketId) {
        const ticket = await tx.quickTicket.findUnique({ where: { id: ticketId }, select: { purchaseNumber: true, status: true } })
        if (!ticket) throw new PurchaseInputError("Quick ticket not found")
        if (ticket.status !== "OPEN") throw new PurchaseInputError(`Ticket ${ticket.purchaseNumber} was already completed`)
        const claimed = await tx.quickTicket.updateMany({
          where: { id: ticketId, status: "OPEN" },
          data: { status: "COMPLETED", completedAt: new Date() },
        })
        if (claimed.count !== 1) throw new PurchaseInputError(`Ticket ${ticket.purchaseNumber} was already completed`)
        purchaseNumber = ticket.purchaseNumber
      } else {
        purchaseNumber = providedNumber || (await nextPurchaseNumber(tx))
      }
      const header = {
        purchaseNumber,
        leadId,
        userId,
        purchaseDate: purchaseDate ? parsePurchaseDate(purchaseDate) : new Date(),
        notes: notes || null,
        paymentMethod: paymentMethod ? JSON.stringify(paymentMethod) : null,
      }

      const created = []
      for (const line of lines) created.push(await createPurchaseLine(tx, header, line))

      if (leadStatus !== "BOUGHT") {
        await tx.lead.update({ where: { id: leadId }, data: { status: "BOUGHT" } })
      }
      return { purchaseNumber, leadId, created }
    }, TX_OPTIONS)

    // Informational numbers that need live spot prices — computed after the
    // save is committed; a spot-price outage never blocks a purchase.
    for (const c of result.created) {
      await recalcPurchaseGrossProfit(c.id)
      await applyOverpayFlag(c.id)
    }

    const first = await prisma.purchase.findUnique({
      where: { id: result.created[0].id },
      include: { lead: { select: { id: true, name: true, phone: true, email: true } } },
    })
    const responsePurchase = first && session.user.role !== "ADMIN" ? stripOverpay(first) : first
    return NextResponse.json({
      ...responsePurchase,
      itemCode: result.created[0].itemCode,
      purchaseNumber: result.purchaseNumber,
      leadId: result.leadId,
      items: result.created,
    })
  } catch (error) {
    if (error instanceof PurchaseInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("Error creating purchase:", error)
    return NextResponse.json(
      { error: "Failed to record purchase — nothing was saved. Please try again." },
      { status: 500 }
    )
  }
}
