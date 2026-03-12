import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { LeadSource, LeadChannel, LeadStatus } from "@/generated/prisma/client"
import { deleteCalendarEvent } from "@/lib/google-calendar"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      appointments: {
        orderBy: { dateTime: "desc" },
      },
      purchases: {
        orderBy: { purchaseDate: "desc" },
      },
      smsConversations: {
        include: {
          messages: {
            orderBy: { sentAt: "asc" },
          },
        },
        orderBy: { startedAt: "desc" },
      },
    },
  })

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  return NextResponse.json(lead)
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()
    const { name, phone, email, notes, source, channel, status, followUpDate } = body

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        name,
        phone,
        email,
        notes,
        source: source as LeadSource,
        channel: channel as LeadChannel,
        status: status as LeadStatus,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json(lead)
  } catch (error) {
    console.error("Error updating lead:", error)
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    // Delete Google Calendar events for all appointments of this lead
    if (session.user.accessToken) {
      const appointments = await prisma.appointment.findMany({
        where: { leadId: id },
        select: { googleCalendarEventId: true },
      })

      for (const apt of appointments) {
        if (apt.googleCalendarEventId) {
          try {
            await deleteCalendarEvent(session.user.accessToken, apt.googleCalendarEventId)
          } catch (calendarError) {
            console.error("Failed to delete calendar event:", calendarError)
          }
        }
      }
    }

    await prisma.lead.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting lead:", error)
    return NextResponse.json({ error: "Failed to delete lead" }, { status: 500 })
  }
}
