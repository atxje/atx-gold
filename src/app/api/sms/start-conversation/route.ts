import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendSms, formatPhoneNumber } from "@/lib/twilio"
import { generateAIResponse } from "@/lib/ai-agent"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { leadId } = await request.json()

    if (!leadId) {
      return NextResponse.json({ error: "Lead ID is required" }, { status: 400 })
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

    // Check if there's already an active conversation
    const existingConversation = await prisma.smsConversation.findFirst({
      where: {
        leadId,
        status: "ACTIVE",
      },
    })

    if (existingConversation) {
      return NextResponse.json(
        { error: "There is already an active conversation with this lead" },
        { status: 400 }
      )
    }

    // Create new conversation
    const conversation = await prisma.smsConversation.create({
      data: {
        leadId,
        status: "ACTIVE",
      },
    })

    // Generate initial AI message
    const initialMessage = await generateAIResponse(lead.name, [])

    // Send SMS via Twilio
    const formattedPhone = formatPhoneNumber(lead.phone)
    const twilioMessage = await sendSms(formattedPhone, initialMessage)

    // Save the outbound message
    await prisma.smsMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: initialMessage,
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
      conversationId: conversation.id,
      message: initialMessage,
    })
  } catch (error) {
    console.error("Error starting SMS conversation:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start conversation" },
      { status: 500 }
    )
  }
}
