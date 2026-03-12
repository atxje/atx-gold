import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { listEmails, getEmailContent } from "@/lib/gmail"
import { sendSms, formatPhoneNumber } from "@/lib/twilio"
import { generateAIResponse } from "@/lib/ai-agent"

// Search for form submissions by sender or subject
// ORGANIC: from ATX Jewelry Exchange
// PAID: from JotForm or subject contains "jotform"
const FORM_FILTERS = [
  "from:noreply@jotform.com",
  "from:jotform.com",
  "from:atxjewelryexchange",
  "subject:jotform",
  "subject:\"ads campaign\"",
]

// Parse lead info from email based on format
function parseLeadFromEmail(subject: string, body: string): {
  name: string | null
  email: string | null
  phone: string | null
  items: string | null
  source: "ORGANIC" | "PAID"
} {
  const isPaid = subject.toLowerCase().includes("ads campaign") ||
                 subject.toLowerCase().includes("jotform")

  let name: string | null = null
  let email: string | null = null
  let phone: string | null = null
  let items: string | null = null

  // Try to extract name from subject for organic leads
  // Format 1: "Name-Site Contact Form-ATX..."
  // Format 2: "Name-Contact Now-ATX..."
  // Format 3: "Name-Sell Now Form-ATX..."
  const subjectNameMatch = subject.match(/^(?:Re:\s*)?([^-]+)-(?:Site Contact Form|Contact Now|Sell Now Form)/i)
  if (subjectNameMatch) {
    name = subjectNameMatch[1].trim()
  }

  // Extract fields from body - try labeled format first
  // Look for "Name: value" patterns
  const nameBodyMatch = body.match(/Name[:\s]+([^\n\r]+)/i)
  if (nameBodyMatch) {
    name = nameBodyMatch[1].trim()
  }

  // Look for phone number (with or without "Phone:" label)
  const phoneMatch = body.match(/Phone[:\s]+([0-9\-\(\)\s\+]+)/i)
  if (phoneMatch) {
    phone = phoneMatch[1].replace(/[^0-9+]/g, "").trim()
  }

  // Look for email with label
  const emailMatch = body.match(/Email[:\s]+([^\s\n\r]+@[^\s\n\r]+)/i)
  if (emailMatch) {
    email = emailMatch[1].trim()
  }

  // Look for items/message/purpose
  const itemsMatch = body.match(/(?:Items|Message|Purpose)[:\s]+([^\n\r]+(?:\n(?![A-Z][a-z]+:)[^\n\r]+)*)/i)
  if (itemsMatch) {
    items = itemsMatch[1].trim()
  }

  // If no labeled data found, try JotForm concatenated format
  // Pattern: "Name Phone Email Category Items..."
  // Example: "Carrie Trogan9284514538carrietrogan@gmail.comJewelryTurkish gemstone..."
  if (!name && !phone && !email) {
    // Extract email first (most reliable pattern)
    const rawEmailMatch = body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
    if (rawEmailMatch) {
      email = rawEmailMatch[1].trim()
    }

    // Extract phone (10-digit number)
    const rawPhoneMatch = body.match(/(\d{10})/g)
    if (rawPhoneMatch && rawPhoneMatch.length > 0) {
      phone = rawPhoneMatch[0]
    }

    // Extract name - text before the phone number
    if (phone) {
      const beforePhone = body.split(phone)[0]
      // Get the last line or chunk before phone that looks like a name
      const nameChunks = beforePhone.split(/\n+/)
      const lastChunk = nameChunks[nameChunks.length - 1].trim()
      // Name is likely letters and spaces only
      const nameMatch = lastChunk.match(/([A-Za-z][A-Za-z\s]+)$/)
      if (nameMatch) {
        name = nameMatch[1].trim()
      }
    }

    // Extract items - text after email until "You can edit"
    if (email) {
      const afterEmail = body.split(email)[1]
      if (afterEmail) {
        const itemsText = afterEmail.split(/You can edit/i)[0]
        // Remove category word (Jewelry, Other, etc.) at the start
        const cleanedItems = itemsText.replace(/^(Jewelry|Gold|Silver|Other|Coins?)\s*/i, "").trim()
        if (cleanedItems.length > 5) {
          items = cleanedItems
        }
      }
    }
  }

  return {
    name,
    email: email?.toLowerCase() || null, // Normalize email
    phone,
    items,
    source: isPaid ? "PAID" : "ORGANIC",
  }
}

// Normalize phone number for comparison (strip to digits only)
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  // If 11 digits starting with 1, remove the 1
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1)
  }
  return digits
}

// Find existing lead by phone or email (with normalization)
async function findExistingLead(phone: string | null, email: string | null) {
  if (!phone && !email) return null

  const conditions = []

  if (email) {
    conditions.push({ email: email.toLowerCase() })
  }

  if (phone) {
    const normalizedPhone = normalizePhone(phone)
    // Search for various phone formats
    conditions.push(
      { phone: normalizedPhone },
      { phone: `+1${normalizedPhone}` },
      { phone: `1${normalizedPhone}` },
      // Also check with common formatting
      { phone: { contains: normalizedPhone } }
    )
  }

  return prisma.lead.findFirst({
    where: { OR: conditions },
  })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get user's Google access token from their account
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "google",
      },
    })

    if (!account?.access_token) {
      return NextResponse.json(
        { error: "Google account not connected. Please sign in with Google." },
        { status: 400 }
      )
    }

    // Build search query for form submissions by sender
    // Always use 24h for now to ensure we catch threaded emails
    const dateFilter = `newer_than:24h`
    const filterQuery = FORM_FILTERS.join(" OR ")
    const searchQuery = `(${filterQuery}) ${dateFilter}`

    // List emails matching form keywords
    const emails = await listEmails(account.id, account.access_token, account.refresh_token, searchQuery)

    const results = {
      processed: 0,
      leadsCreated: 0,
      errors: [] as string[],
    }

    for (const email of emails) {
      try {
        // Get full email content
        const emailContent = await getEmailContent(
          account.id,
          account.access_token,
          account.refresh_token,
          email.id!
        )

        // Parse email for lead info using our custom parser
        const leadInfo = parseLeadFromEmail(
          emailContent.subject,
          emailContent.body
        )

        if (!leadInfo.name && !leadInfo.email && !leadInfo.phone) {
          // Couldn't extract useful info, skip this email
          continue
        }

        // Check if lead already exists (with normalized phone/email comparison)
        const existingLead = await findExistingLead(leadInfo.phone, leadInfo.email)

        if (existingLead) {
          // Lead exists - check if we should re-engage them
          const daysSinceUpdate = Math.floor(
            (Date.now() - new Date(existingLead.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
          )

          if (daysSinceUpdate < 1) {
            // Recently contacted, skip
            // Email processed (no need to mark as read - we track by timestamp)
            results.processed++
            continue
          }

          // Old lead re-engaging - update notes and send new text
          await prisma.lead.update({
            where: { id: existingLead.id },
            data: {
              notes: existingLead.notes
                ? `${existingLead.notes}\n\n[${new Date().toLocaleDateString()}] Re-engaged via form: ${leadInfo.items || "No message"}`
                : `[${new Date().toLocaleDateString()}] Re-engaged via form: ${leadInfo.items || "No message"}`,
              status: existingLead.status === "NO_SALE" ? "NEW" : existingLead.status,
            },
          })

          // Send new text if they have a phone
          if (existingLead.phone) {
            try {
              const conversation = await prisma.smsConversation.create({
                data: {
                  leadId: existingLead.id,
                  status: "ACTIVE",
                },
              })

              const initialMessage = await generateAIResponse(existingLead.name, [])
              const formattedPhone = formatPhoneNumber(existingLead.phone)
              const twilioMessage = await sendSms(formattedPhone, initialMessage)

              await prisma.smsMessage.create({
                data: {
                  conversationId: conversation.id,
                  direction: "OUTBOUND",
                  content: initialMessage,
                  twilioSid: twilioMessage.sid,
                },
              })
            } catch (smsError) {
              console.error("Failed to send SMS to re-engaged lead:", smsError)
            }
          }

          // Email processed (no need to mark as read - we track by timestamp)
          results.processed++
          continue
        }

        // Create new lead
        const lead = await prisma.lead.create({
          data: {
            name: leadInfo.name || "Unknown (from form)",
            email: leadInfo.email,
            phone: leadInfo.phone,
            notes: leadInfo.items
              ? `Interested in selling: ${leadInfo.items}`
              : `From form submission: ${emailContent.subject}`,
            source: leadInfo.source,
            channel: "ONLINE_FORM",
            status: "NEW",
            createdById: session.user.id,
          },
        })

        results.leadsCreated++

        // If lead has a phone number, start AI text conversation
        if (lead.phone) {
          try {
            // Create conversation
            const conversation = await prisma.smsConversation.create({
              data: {
                leadId: lead.id,
                status: "ACTIVE",
              },
            })

            // Generate initial AI message
            const initialMessage = await generateAIResponse(lead.name, [])

            // Send SMS
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

            // Update lead status
            await prisma.lead.update({
              where: { id: lead.id },
              data: { status: "CONTACTED" },
            })
          } catch (smsError) {
            console.error("Failed to send SMS to new lead:", smsError)
            // Don't fail the whole process, lead was still created
          }
        }

        // Mark email as read
        // Email processed (no need to mark as read - we track by timestamp)
        results.processed++
      } catch (emailError) {
        console.error("Error processing email:", emailError)
        results.errors.push(
          `Failed to process email ${email.id}: ${emailError}`
        )
      }
    }

    // Update last scan time
    await prisma.account.update({
      where: { id: account.id },
      data: { lastEmailScanAt: new Date() },
    })

    return NextResponse.json(results)
  } catch (error) {
    console.error("Email check error:", error)
    return NextResponse.json(
      { error: "Failed to check emails" },
      { status: 500 }
    )
  }
}
