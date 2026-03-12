import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendSms, formatPhoneNumber } from "@/lib/twilio"
import { generateAIResponse } from "@/lib/ai-agent"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()

    const from = formData.get("From") as string
    const body = formData.get("Body") as string
    const messageSid = formData.get("MessageSid") as string

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
