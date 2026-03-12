import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createCalendarEvent } from "@/lib/google-calendar"
import { sendSms, formatPhoneNumber } from "@/lib/twilio"
import { format } from "date-fns"

const OFFICE_ADDRESS = "7951 Shoal Creek Blvd, suite 250 Austin, TX 78757"
const OFFICE_INSTRUCTIONS = "We are located in an office inside the PNC Bank building - Second floor suite 250"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const leadId = searchParams.get("leadId")
  const startDate = searchParams.get("startDate")
  const endDate = searchParams.get("endDate")

  const where: Record<string, unknown> = {}

  if (leadId) {
    where.leadId = leadId
  }

  if (startDate || endDate) {
    where.dateTime = {}
    if (startDate) {
      (where.dateTime as Record<string, unknown>).gte = new Date(startDate)
    }
    if (endDate) {
      (where.dateTime as Record<string, unknown>).lte = new Date(endDate)
    }
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      leadRelation: {
        select: { id: true, name: true, phone: true, email: true },
      },
      lead: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { dateTime: "asc" },
  })

  return NextResponse.json(appointments)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { leadId, dateTime, duration, location, notes } = body

    if (!leadId || !dateTime) {
      return NextResponse.json(
        { error: "Lead and date/time are required" },
        { status: 400 }
      )
    }

    // Verify lead exists
    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    const appointmentDateTime = new Date(dateTime)
    const appointmentDuration = duration || 30
    const endTime = new Date(appointmentDateTime.getTime() + appointmentDuration * 60000)

    let googleCalendarEventId: string | null = null

    // Create Google Calendar event if user has access token
    if (session.user.accessToken) {
      try {
        const calendarEvent = await createCalendarEvent(session.user.accessToken, {
          summary: `Appointment with ${lead.name}`,
          description: `Lead: ${lead.name}\nPhone: ${lead.phone || "N/A"}\nEmail: ${lead.email || "N/A"}\n\n${notes || ""}`,
          start: appointmentDateTime,
          end: endTime,
        })
        googleCalendarEventId = calendarEvent.id || null
      } catch (calendarError) {
        console.error("Failed to create calendar event:", calendarError)
        // Continue without calendar event
      }
    }

    const appointment = await prisma.appointment.create({
      data: {
        leadId,
        userId: session.user.id,
        dateTime: appointmentDateTime,
        duration: appointmentDuration,
        location,
        notes,
        googleCalendarEventId,
      },
      include: {
        leadRelation: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    })

    // Update lead status to APPOINTMENT_SET if it's NEW or CONTACTED
    if (["NEW", "CONTACTED"].includes(lead.status)) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "APPOINTMENT_SET" },
      })
    }

    // Send confirmation SMS if lead has phone number
    if (lead.phone) {
      try {
        const formattedDate = format(appointmentDateTime, "EEEE, MMMM d 'at' h:mm a")
        const smsBody = `Your appointment is confirmed for ${formattedDate}.\n\nAddress: ${OFFICE_ADDRESS}\n\n${OFFICE_INSTRUCTIONS}`

        await sendSms(formatPhoneNumber(lead.phone), smsBody)
      } catch (smsError) {
        console.error("Failed to send appointment confirmation SMS:", smsError)
        // Continue without SMS - don't fail the appointment creation
      }
    }

    return NextResponse.json(appointment)
  } catch (error) {
    console.error("Error creating appointment:", error)
    return NextResponse.json(
      { error: "Failed to create appointment" },
      { status: 500 }
    )
  }
}
