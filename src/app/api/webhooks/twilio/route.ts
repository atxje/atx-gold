import { NextResponse } from "next/server"
import twilio from "twilio"
import { prisma } from "@/lib/prisma"
import { sendSms, formatPhoneNumber } from "@/lib/twilio"
import { generateAIResponse } from "@/lib/ai-agent"
import { cancelReviewRequests } from "@/lib/review-requests"

export async function POST(request: Request) {
  try {
    // Validate the Twilio request signature; fail closed if the auth token is unset
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const signature = request.headers.get("x-twilio-signature")

    const formData = await request.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    if (!authToken || !signature) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    // Reconstruct the public URL Twilio signed (Vercel terminates TLS at the proxy)
    const requestUrl = new URL(request.url)
    const proto =
      request.headers.get("x-forwarded-proto") ??
      requestUrl.protocol.replace(":", "")
    const host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      requestUrl.host
    const publicUrl = `${proto}://${host}${requestUrl.pathname}${requestUrl.search}`

    if (!twilio.validateRequest(authToken, signature, publicUrl, params)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const from = params["From"]
    const body = params["Body"]
    const messageSid = params["MessageSid"]

    if (!from || !body) {
      return new NextResponse("Missing required fields", { status: 400 })
    }

    // Normalize phone number for lookup
    const normalizedPhone = from.replace(/^\+1/, "").replace(/\D/g, "")
    const phoneVariants = [
      from,
      `+1${normalizedPhone}`,
      normalizedPhone,
      `1${normalizedPhone}`,
    ]

    // Find lead by phone number
    const lead = await prisma.lead.findFirst({
      where: {
        phone: { in: phoneVariants },
      },
    })

    if (!lead) {
      console.log("No lead found for phone:", from)
      // Return empty TwiML - don't respond to unknown numbers
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { "Content-Type": "text/xml" } }
      )
    }

    const empty = () =>
      new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
      })

    // Opt-out / opt-in keywords. Twilio sends the confirmation reply itself;
    // we record the choice so the app never tries to text this person again.
    const keyword = body.trim().toUpperCase().replace(/[^A-Z]/g, "")
    if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"].includes(keyword)) {
      await prisma.lead.update({ where: { id: lead.id }, data: { smsOptOut: true } })
      await cancelReviewRequests({ leadId: lead.id })
      await prisma.smsConversation.updateMany({
        where: { leadId: lead.id, status: "ACTIVE" },
        data: { status: "COMPLETED", completedAt: new Date() },
      })
      return empty()
    }
    if (["START", "UNSTOP"].includes(keyword)) {
      await prisma.lead.update({ where: { id: lead.id }, data: { smsOptOut: false } })
      return empty()
    }
    if (keyword === "HELP" || keyword === "INFO") return empty()

    // A reply to the thank-you / review text (or from someone who opted out)
    // is logged for staff to read — the appointment-scheduling AI stays out of it.
    const activeExists = await prisma.smsConversation.count({ where: { leadId: lead.id, status: "ACTIVE" } })
    if (activeExists === 0) {
      const recentReview = await prisma.reviewRequest.findFirst({
        where: {
          leadId: lead.id,
          status: { in: ["SCHEDULED", "SENT"] },
          sendAt: { gte: new Date(Date.now() - 14 * 86_400_000) },
        },
        select: { id: true },
      })
      if (recentReview || lead.smsOptOut) {
        const thread =
          (await prisma.smsConversation.findFirst({
            where: { leadId: lead.id, status: "PAUSED" },
            orderBy: { startedAt: "desc" },
            select: { id: true },
          })) ?? (await prisma.smsConversation.create({ data: { leadId: lead.id, status: "PAUSED" }, select: { id: true } }))
        await prisma.smsMessage.create({
          data: { conversationId: thread.id, direction: "INBOUND", content: body, twilioSid: messageSid },
        })
        return empty()
      }
    }

    // Find active conversation
    let conversation = await prisma.smsConversation.findFirst({
      where: {
        leadId: lead.id,
        status: "ACTIVE",
      },
      include: {
        messages: {
          orderBy: { sentAt: "asc" },
        },
      },
    })

    // If no active conversation, create one
    if (!conversation) {
      conversation = await prisma.smsConversation.create({
        data: {
          leadId: lead.id,
          status: "ACTIVE",
        },
        include: {
          messages: true,
        },
      })
    }

    // Save the inbound message
    await prisma.smsMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "INBOUND",
        content: body,
        twilioSid: messageSid,
      },
    })

    // Get conversation history for AI context
    const messageHistory = [
      ...conversation.messages.map((m) => ({
        role: m.direction === "OUTBOUND" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: body },
    ]

    // Generate AI response
    const aiResponse = await generateAIResponse(
      lead.name,
      messageHistory as Array<{ role: string; content: string }>
    )

    // Send response via Twilio
    const formattedPhone = formatPhoneNumber(from)
    const twilioMessage = await sendSms(formattedPhone, aiResponse)

    // Save the outbound message
    await prisma.smsMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: aiResponse,
        twilioSid: twilioMessage.sid,
      },
    })

    // Check if appointment was scheduled (AI might include this info)
    if (
      aiResponse.toLowerCase().includes("appointment") &&
      (aiResponse.toLowerCase().includes("confirmed") ||
        aiResponse.toLowerCase().includes("scheduled"))
    ) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "APPOINTMENT_SET" },
      })
    }

    // Return empty TwiML (we handle the response ourselves)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" } }
    )
  } catch (error) {
    console.error("Twilio webhook error:", error)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" } }
    )
  }
}

// Twilio requires this endpoint to be publicly accessible
export const runtime = "nodejs"
