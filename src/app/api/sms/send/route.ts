import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendSms, formatPhoneNumber } from "@/lib/twilio"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { leadId, message } = await request.json()

    if (!leadId || !message) {
      return NextResponse.json(
        { error: "Lead ID and message are required" },
        { status: 400 }
      )
    }

    // Get lead info
    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    if (!lead.phone) {
      return NextResponse.json(
        { error: "Lead does not have a phone number" },
        { status: 400 }
      )
    }

    // Send SMS via Twilio
    const formattedPhone = formatPhoneNumber(lead.phone)
    const twilioMessage = await sendSms(formattedPhone, message)

    // Find or create a conversation to log this message
    let conversation = await prisma.smsConversation.findFirst({
      where: {
        leadId,
        status: "ACTIVE",
      },
    })

    if (!conversation) {
      conversation = await prisma.smsConversation.create({
        data: {
          leadId,
          status: "ACTIVE",
        },
      })
    }

    // Save the outbound message
    await prisma.smsMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: message,
        twilioSid: twilioMessage.sid,
      },
    })

    // Update lead status to CONTACTED if it's NEW
    if (lead.status === "NEW") {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "CONTACTED" },
      })
    }

    return NextResponse.json({
      success: true,
      messageSid: twilioMessage.sid,
    })
  } catch (error) {
    console.error("Error sending SMS:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send SMS" },
      { status: 500 }
    )
  }
}
