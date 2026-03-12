import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateCalendarEvent, deleteCalendarEvent } from "@/lib/google-calendar"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      leadRelation: {
        select: { id: true, name: true, phone: true, email: true },
      },
      lead: {
        select: { id: true, name: true, email: true },
      },
    },
  })

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  }

  return NextResponse.json(appointment)
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
    const { dateTime, duration, location, notes } = body

    const existingAppointment = await prisma.appointment.findUnique({
      where: { id },
      include: { leadRelation: { select: { name: true } } },
    })

    const appointmentDateTime = dateTime ? new Date(dateTime) : undefined
    const appointmentDuration = duration ?? existingAppointment?.duration ?? 30

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        dateTime: appointmentDateTime,
        duration,
        location,
        notes,
      },
      include: {
        leadRelation: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    })

    // Update Google Calendar event if exists
    if (session.user.accessToken && existingAppointment?.googleCalendarEventId) {
      try {
        const endTime = appointmentDateTime
          ? new Date(appointmentDateTime.getTime() + appointmentDuration * 60000)
          : undefined

        await updateCalendarEvent(
          session.user.accessToken,
          existingAppointment.googleCalendarEventId,
          {
            summary: `Appointment with ${appointment.leadRelation.name}`,
            start: appointmentDateTime,
            end: endTime,
          }
        )
      } catch (calendarError) {
        console.error("Failed to update calendar event:", calendarError)
      }
    }

    return NextResponse.json(appointment)
  } catch (error) {
    console.error("Error updating appointment:", error)
    return NextResponse.json(
      { error: "Failed to update appointment" },
      { status: 500 }
    )
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
    const appointment = await prisma.appointment.findUnique({ where: { id } })

    // Delete Google Calendar event if exists
    if (session.user.accessToken && appointment?.googleCalendarEventId) {
      try {
        await deleteCalendarEvent(
          session.user.accessToken,
          appointment.googleCalendarEventId
        )
      } catch (calendarError) {
        console.error("Failed to delete calendar event:", calendarError)
      }
    }

    await prisma.appointment.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting appointment:", error)
    return NextResponse.json(
      { error: "Failed to delete appointment" },
      { status: 500 }
    )
  }
}
