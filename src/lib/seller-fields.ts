import { LeadSource, LeadChannel } from "@/generated/prisma/client"

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
