import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { nextPurchaseNumber, TX_OPTIONS } from "@/lib/doc-numbers"
import { parsePurchaseDate } from "@/lib/purchase-date"
import { resolveSeller, SellerError } from "@/lib/seller-fields"

// Quick tickets: the short bill of sale signed at the desk; completed later
// into a full purchase under the same PUR number.

export interface TicketLine {
  categoryId: string | null
  category: string
  type: string | null
  quantity: number | null
  weight: number | null
  weightUnit: string
  description: string | null
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : null
}

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

    const lines: TicketLine[] = (Array.isArray(body.lines) ? body.lines : [])
      .filter((l: Record<string, unknown>) => l && typeof l.category === "string" && l.category.trim())
      .map((l: Record<string, unknown>) => ({
        categoryId: typeof l.categoryId === "string" ? l.categoryId : null,
        category: String(l.category).trim(),
        type: typeof l.type === "string" && l.type.trim() ? l.type.trim() : null,
        quantity: num(l.quantity) && num(l.quantity)! > 0 ? Math.round(num(l.quantity)!) : null,
        weight: num(l.weight) && num(l.weight)! > 0 ? num(l.weight) : null,
        weightUnit: typeof l.weightUnit === "string" ? l.weightUnit : "GRAM",
        description: typeof l.description === "string" && l.description.trim() ? l.description.trim() : null,
      }))
    if (lines.length === 0) return NextResponse.json({ error: "Add at least one item" }, { status: 400 })

    // One amount per category that appears on the ticket
    const cats = [...new Set(lines.map(l => l.category))]
    const given: Record<string, number> = {}
    for (const t of Array.isArray(body.categoryTotals) ? body.categoryTotals : []) {
      const a = num(t?.amount)
      if (typeof t?.category === "string" && a != null) given[t.category] = a
    }
    const categoryTotals = cats.map(c => ({ category: c, amount: given[c] ?? 0 }))
    if (categoryTotals.some(t => t.amount < 0)) {
      return NextResponse.json({ error: "Amounts can't be negative" }, { status: 400 })
    }
    const total = Math.round(categoryTotals.reduce((s, t) => s + t.amount, 0) * 100) / 100
    if (!(total > 0)) return NextResponse.json({ error: "Enter the amount paid for each category" }, { status: 400 })

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
          paymentMethod: Array.isArray(body.paymentMethod) && body.paymentMethod.length ? JSON.stringify(body.paymentMethod) : null,
          notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
        },
      })
    }, TX_OPTIONS)

    return NextResponse.json(ticket)
  } catch (error) {
    if (error instanceof SellerError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error("Error creating quick ticket:", error)
    return NextResponse.json({ error: "Failed to save the ticket — nothing was saved. Please try again." }, { status: 500 })
  }
}
