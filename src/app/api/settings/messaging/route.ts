import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { loadMessagingSettings } from "@/lib/review-requests"
import { smsConfigStatus } from "@/lib/twilio"

// GET — any signed-in user learns whether review requests are on (to show the
// checkbox on the purchase forms); admins get the full settings, the Twilio
// connection status and the recent requests.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const settings = await loadMessagingSettings()
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ reviewEnabled: settings.reviewEnabled, reviewDelayMinutes: settings.reviewDelayMinutes })
  }

  const recent = await prisma.reviewRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true, purchaseNumber: true, phone: true, sendAt: true, status: true, error: true, createdAt: true,
      lead: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json({ ...settings, twilio: smsConfigStatus(), recent })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await request.json()
  const reviewLink = String(body.reviewLink ?? "").trim()
  const reviewMessage = String(body.reviewMessage ?? "").trim()
  const reviewDelayMinutes = Math.round(Number(body.reviewDelayMinutes))
  const reviewCooldownDays = Math.round(Number(body.reviewCooldownDays))
  const reviewEnabled = body.reviewEnabled === true

  if (!/^https:\/\/\S+$/.test(reviewLink)) {
    return NextResponse.json({ error: "Enter the review link (it should start with https://)" }, { status: 400 })
  }
  if (!reviewMessage.includes("{link}")) {
    return NextResponse.json({ error: "The message must include {link} where the review link goes" }, { status: 400 })
  }
  if (!/\bSTOP\b/i.test(reviewMessage)) {
    return NextResponse.json({ error: 'The message must tell people how to opt out, e.g. "Reply STOP to opt out."' }, { status: 400 })
  }
  if (reviewMessage.length > 600) {
    return NextResponse.json({ error: "The message is too long — keep it under 600 characters" }, { status: 400 })
  }
  if (!Number.isFinite(reviewDelayMinutes) || reviewDelayMinutes < 15 || reviewDelayMinutes > 10080) {
    return NextResponse.json({ error: "Delay must be between 15 minutes and 7 days" }, { status: 400 })
  }
  if (!Number.isFinite(reviewCooldownDays) || reviewCooldownDays < 0 || reviewCooldownDays > 3650) {
    return NextResponse.json({ error: "Enter how many days to wait before asking the same seller again" }, { status: 400 })
  }

  const data = { reviewEnabled, reviewLink, reviewMessage, reviewDelayMinutes, reviewCooldownDays, updatedBy: session.user.id }
  const existing = await prisma.messagingSettings.findFirst()
  const row = existing
    ? await prisma.messagingSettings.update({ where: { id: existing.id }, data })
    : await prisma.messagingSettings.create({ data })
  return NextResponse.json(row)
}
