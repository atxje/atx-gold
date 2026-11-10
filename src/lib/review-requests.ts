import { prisma } from "./prisma"
import { scheduleSms, cancelScheduledSms, formatPhoneNumber } from "./twilio"

// Thank-you text with a Google review link, sent a while after a completed sale.
// Twilio holds the message and sends it at the scheduled time; its status
// callback (/api/webhooks/twilio/status) marks it SENT or FAILED.

export const REVIEW_DEFAULTS = {
  reviewEnabled: false,
  reviewLink: "https://g.page/r/CV2x77rr29k4EBE/review",
  reviewMessage:
    "Thank you for visiting ATX Jewelry Exchange today, {first_name}! If you have a minute, we'd really appreciate a Google review: {link} Reply STOP to opt out.",
  reviewDelayMinutes: 60,
  reviewCooldownDays: 90,
}

export type MessagingSettingsValues = typeof REVIEW_DEFAULTS

export async function loadMessagingSettings(): Promise<MessagingSettingsValues> {
  const row = await prisma.messagingSettings.findFirst()
  return row
    ? {
        reviewEnabled: row.reviewEnabled,
        reviewLink: row.reviewLink,
        reviewMessage: row.reviewMessage,
        reviewDelayMinutes: row.reviewDelayMinutes,
        reviewCooldownDays: row.reviewCooldownDays,
      }
    : REVIEW_DEFAULTS
}

// "John Smith" → "John"; business-like or empty names fall back to "there"
export function firstNameOf(name: string): string {
  const first = (name || "").trim().split(/\s+/)[0] || ""
  if (!/^[A-Za-z][A-Za-z'’-]*$/.test(first)) return "there"
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

export function renderReviewMessage(template: string, vars: { firstName: string; link: string }): string {
  return template
    .replace(/\{first_name\}/gi, vars.firstName)
    .replace(/\{link\}/gi, vars.link)
    .replace(/\s+/g, " ")
    .trim()
}

const STORE_TZ = "America/Chicago"
const QUIET_BEFORE_HOUR = 9 // no texts before 9:00 AM
const QUIET_FROM_HOUR = 19 // or from 7:00 PM
const MORNING_SEND_HOUR = 10 // held-over texts go out at 10:00 AM

function storeParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TZ, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(d)
  const n = (t: string) => Number(parts.find(p => p.type === t)?.value)
  return { year: n("year"), month: n("month"), day: n("day"), hour: n("hour"), minute: n("minute"), second: n("second") }
}

// "YYYY-MM-DD" of a moment in the store's timezone
export function storeDateKey(d: Date): string {
  const p = storeParts(d)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

// When to send: now + delay, but never during quiet hours (store time) —
// an evening sale's text waits until 10 AM the next morning.
export function reviewSendTime(now: Date, delayMinutes: number): Date {
  const candidate = new Date(now.getTime() + delayMinutes * 60_000)
  const p = storeParts(candidate)
  if (p.hour >= QUIET_BEFORE_HOUR && p.hour < QUIET_FROM_HOUR) return candidate
  // Offset between store wall-clock time and UTC at that moment
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const offset = wallAsUtc - Math.floor(candidate.getTime() / 1000) * 1000
  const dayShift = p.hour >= QUIET_FROM_HOUR ? 1 : 0
  return new Date(Date.UTC(p.year, p.month - 1, p.day + dayShift, MORNING_SEND_HOUR, 0, 0) - offset)
}

export type ReviewOutcome =
  | { status: "scheduled"; sendAt: Date }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }

/**
 * Queue the review-request text for a sale that was just saved. Never throws —
 * a texting problem must not affect the purchase. Skips (with a reason) when
 * the feature is off, the sale is backdated, the seller has no mobile number,
 * opted out, or was already asked within the cooldown.
 */
export async function scheduleReviewRequest(input: {
  leadId: string
  purchaseNumber: string | null
  purchaseDate: Date | null // null = dated today
  origin: string | null // public site URL, for Twilio's delivery-status callback
  now?: Date
}): Promise<ReviewOutcome> {
  try {
    const settings = await loadMessagingSettings()
    if (!settings.reviewEnabled) return { status: "skipped", reason: "Review requests are turned off" }
    if (!settings.reviewLink.trim()) return { status: "skipped", reason: "No review link set" }

    const now = input.now ?? new Date()
    // purchaseDate is a calendar day pinned to UTC; only text for sales dated today
    if (input.purchaseDate && input.purchaseDate.toISOString().slice(0, 10) !== storeDateKey(now)) {
      return { status: "skipped", reason: "Sale is not dated today" }
    }

    const lead = await prisma.lead.findUnique({
      where: { id: input.leadId },
      select: { id: true, name: true, phone: true, smsOptOut: true },
    })
    if (!lead) return { status: "skipped", reason: "Seller not found" }
    if (lead.smsOptOut) return { status: "skipped", reason: "Seller opted out of texts" }
    const digits = (lead.phone || "").replace(/\D/g, "")
    if (digits.length < 10) return { status: "skipped", reason: "Seller has no mobile number" }

    const since = new Date(now.getTime() - settings.reviewCooldownDays * 86_400_000)
    const recent = await prisma.reviewRequest.findFirst({
      where: { leadId: lead.id, status: { in: ["SCHEDULED", "SENT"] }, createdAt: { gte: since } },
      select: { id: true },
    })
    if (recent) return { status: "skipped", reason: `Already asked within ${settings.reviewCooldownDays} days` }

    const phone = formatPhoneNumber(lead.phone!)
    const message = renderReviewMessage(settings.reviewMessage, {
      firstName: firstNameOf(lead.name),
      link: settings.reviewLink.trim(),
    })
    const sendAt = reviewSendTime(now, Math.max(15, settings.reviewDelayMinutes))

    let twilioSid: string | null = null
    try {
      const callback = input.origin ? `${input.origin}/api/webhooks/twilio/status` : undefined
      twilioSid = (await scheduleSms(phone, message, sendAt, callback)).sid
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 300) : "Could not schedule the text"
      await prisma.reviewRequest.create({
        data: { leadId: lead.id, purchaseNumber: input.purchaseNumber, phone, message, sendAt, status: "FAILED", error: reason },
      })
      return { status: "failed", reason }
    }

    await prisma.reviewRequest.create({
      data: { leadId: lead.id, purchaseNumber: input.purchaseNumber, phone, message, sendAt, twilioSid },
    })

    // The sale is done: close any appointment-scheduling chat so the AI
    // scheduler doesn't answer a reply to the thank-you text, and log the
    // text in a paused (human-only) conversation so the thread reads naturally.
    await prisma.smsConversation.updateMany({
      where: { leadId: lead.id, status: "ACTIVE" },
      data: { status: "COMPLETED", completedAt: now },
    })
    await prisma.smsConversation.create({
      data: {
        leadId: lead.id,
        status: "PAUSED",
        messages: { create: { direction: "OUTBOUND", content: message, sentAt: sendAt, twilioSid } },
      },
    })

    return { status: "scheduled", sendAt }
  } catch (error) {
    console.error("Review request error:", error instanceof Error ? error.message : error)
    return { status: "failed", reason: "Unexpected error" }
  }
}

// Cancel texts that haven't gone out yet — for a deleted sale (by purchase
// number) or a seller who opted out (by lead). Never throws.
export async function cancelReviewRequests(where: { purchaseNumber?: string; leadId?: string }): Promise<number> {
  try {
    if (!where.purchaseNumber && !where.leadId) return 0
    const pending = await prisma.reviewRequest.findMany({
      where: { ...where, status: "SCHEDULED", sendAt: { gt: new Date() } },
      select: { id: true, twilioSid: true },
    })
    for (const r of pending) {
      try {
        if (r.twilioSid) {
          await cancelScheduledSms(r.twilioSid)
          await prisma.smsMessage.deleteMany({ where: { twilioSid: r.twilioSid } })
        }
        await prisma.reviewRequest.update({ where: { id: r.id }, data: { status: "CANCELED" } })
      } catch (error) {
        console.error("Could not cancel review text:", error instanceof Error ? error.message : error)
      }
    }
    return pending.length
  } catch {
    return 0
  }
}

// Public origin of the request (Vercel terminates TLS at its proxy)
export function requestOrigin(request: Request): string | null {
  const url = new URL(request.url)
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host
  if (!host || /^localhost|^127\./.test(host)) return null
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
  return `${proto}://${host}`
}
