import { LeadSource, LeadChannel, type Prisma } from "@/generated/prisma/client"

// Seller contact fields sent with a purchase ({ address, idNumber, phone, email,
// source, channel }). Only fields that were sent are returned, blanks become
// null, and source/channel must be valid values — so an older client that
// doesn't send a field never wipes it.
export function parseSellerFields(seller: unknown) {
  if (!seller || typeof seller !== "object") return null
  const s = seller as Record<string, unknown>
  const out: {
    address?: string | null
    idNumber?: string | null
    phone?: string | null
    email?: string | null
    source?: LeadSource
    channel?: LeadChannel
  } = {}
  for (const k of ["address", "idNumber", "phone", "email"] as const) {
    if (k in s) out[k] = typeof s[k] === "string" && (s[k] as string).trim() ? (s[k] as string).trim() : null
  }
  if (typeof s.source === "string" && (Object.values(LeadSource) as string[]).includes(s.source)) {
    out.source = s.source as LeadSource
  }
  if (typeof s.channel === "string" && (Object.values(LeadChannel) as string[]).includes(s.channel)) {
    out.channel = s.channel as LeadChannel
  }
  return Object.keys(out).length ? out : null
}


export class SellerError extends Error {}

// Find the selected seller (updating their contact details) or create a new
// one, inside the caller's transaction. Returns the seller's id.
export async function resolveSeller(
  tx: Prisma.TransactionClient,
  input: { leadId?: string; newLead?: { name?: string; phone?: string; email?: string; source?: string; channel?: string }; seller?: unknown },
  userId: string
): Promise<string> {
  const details = parseSellerFields(input.seller)
  if (input.leadId) {
    const lead = await tx.lead.findUnique({ where: { id: input.leadId }, select: { id: true, status: true } })
    if (!lead) throw new SellerError("Seller not found")
    await tx.lead.update({ where: { id: lead.id }, data: { ...(details ?? {}), status: "BOUGHT" } })
    return lead.id
  }
  const name = input.newLead?.name?.trim()
  if (!name) throw new SellerError("Seller name is required")
  const fromNew = parseSellerFields({
    phone: input.newLead?.phone, email: input.newLead?.email,
    source: input.newLead?.source, channel: input.newLead?.channel,
  })
  const lead = await tx.lead.create({
    data: { name, ...(fromNew ?? {}), ...(details ?? {}), status: "BOUGHT", createdById: userId },
    select: { id: true },
  })
  return lead.id
}
