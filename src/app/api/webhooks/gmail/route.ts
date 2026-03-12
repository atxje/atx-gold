import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { listEmails, getEmailContent, markEmailAsRead } from "@/lib/gmail"
import { parseEmailForLeadInfo, generateAIResponse } from "@/lib/ai-agent"
import { sendSms, formatPhoneNumber } from "@/lib/twilio"

// This webhook is called by Google Pub/Sub when new emails arrive
// You need to set up a Pub/Sub topic and subscription in Google Cloud Console
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Google Pub/Sub sends data as base64 encoded
    const data = body.message?.data
    if (!data) {
      return NextResponse.json({ error: "No data" }, { status: 400 })
    }

    const decoded = Buffer.from(data, "base64").toString("utf-8")
    const notification = JSON.parse(decoded)

    // notification contains: emailAddress, historyId
    const { emailAddress } = notification

    if (!emailAddress) {
      return NextResponse.json({ error: "No email address" }, { status: 400 })
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: emailAddress },
      include: {
        accounts: {
          where: { provider: "google" },
        },
      },
    })

    if (!user || !user.accounts[0]?.access_token) {
      console.log("No user or access token for:", emailAddress)
      return NextResponse.json({ success: true }) // Acknowledge to prevent retries
    }

    const account = user.accounts[0]
    const accessToken = account.access_token!
    const refreshToken = account.refresh_token ?? null

    // Get the latest unread emails
    const emails = await listEmails(account.id, accessToken, refreshToken, "is:unread")

    if (emails.length === 0) {
      return NextResponse.json({ success: true })
    }

    // Process first unread email
    const email = emails[0]
    const emailContent = await getEmailContent(account.id, accessToken, refreshToken, email.id!)

    // Check if this looks like a form submission
    const formKeywords = [
      "form submission",
      "contact form",
      "new submission",
      "sell gold",
      "sell silver",
      "sell jewelry",
    ]

    const isFormSubmission = formKeywords.some(
      (kw) =>
        emailContent.subject.toLowerCase().includes(kw) ||
        emailContent.body.toLowerCase().includes(kw)
    )

    if (!isFormSubmission) {
      return NextResponse.json({ success: true })
    }

    // Parse email for lead info
    const leadInfo = await parseEmailForLeadInfo(
      `Subject: ${emailContent.subject}\n\nFrom: ${emailContent.from}\n\n${emailContent.body}`
    )

    if (!leadInfo.name && !leadInfo.email && !leadInfo.phone) {
      return NextResponse.json({ success: true })
    }

    // Check if lead exists
    const existingLead = await prisma.lead.findFirst({
      where: {
        OR: [
          leadInfo.email ? { email: leadInfo.email } : {},
          leadInfo.phone ? { phone: leadInfo.phone } : {},
        ].filter((o) => Object.keys(o).length > 0),
      },
    })

    if (existingLead) {
      await markEmailAsRead(account.id, accessToken, refreshToken, email.id!)
      return NextResponse.json({ success: true })
    }

    // Create lead
    const lead = await prisma.lead.create({
      data: {
        name: leadInfo.name || "Unknown (from form)",
        email: leadInfo.email,
        phone: leadInfo.phone,
        notes: leadInfo.items
          ? `Interested in selling: ${leadInfo.items}`
          : `From form: ${emailContent.subject}`,
        source: leadInfo.source,
        channel: "ONLINE_FORM",
        status: "NEW",
        createdById: user.id,
      },
    })

    // Auto-start AI text if phone available
    if (lead.phone) {
      try {
        const conversation = await prisma.smsConversation.create({
          data: {
            leadId: lead.id,
            status: "ACTIVE",
          },
        })

        const initialMessage = await generateAIResponse(lead.name, [])
        const formattedPhone = formatPhoneNumber(lead.phone)
        const twilioMessage = await sendSms(formattedPhone, initialMessage)

        await prisma.smsMessage.create({
          data: {
            conversationId: conversation.id,
            direction: "OUTBOUND",
            content: initialMessage,
            twilioSid: twilioMessage.sid,
          },
        })

        await prisma.lead.update({
          where: { id: lead.id },
          data: { status: "CONTACTED" },
        })
      } catch (smsError) {
        console.error("Failed to send SMS:", smsError)
      }
    }

    await markEmailAsRead(account.id, accessToken, refreshToken, email.id!)

    return NextResponse.json({ success: true, leadId: lead.id })
  } catch (error) {
    console.error("Gmail webhook error:", error)
    // Return 200 to acknowledge receipt and prevent retries
    return NextResponse.json({ success: true })
  }
}
