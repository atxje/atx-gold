import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listCalendarEvents } from "@/lib/google-calendar"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!session.user.accessToken) {
    return NextResponse.json(
      { error: "No Google Calendar access. Please sign in with Google." },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")

  if (!date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 })
  }

  try {
    // Parse date as local time (not UTC)
    const [year, month, day] = date.split("-").map(Number)

    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0)
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)

    const events = await listCalendarEvents(
      session.user.accessToken,
      startOfDay,
      endOfDay
    )

    // Extract busy times (exclude all-day events which only have date, not dateTime)
    const busySlots = events
      .filter((event) => event.start?.dateTime && event.end?.dateTime)
      .map((event) => ({
        start: event.start?.dateTime,
        end: event.end?.dateTime,
        summary: event.summary,
      }))

    // Track all-day events separately (for display only, don't block slots)
    const allDayEvents = events
      .filter((event) => event.start?.date && !event.start?.dateTime)
      .map((event) => ({
        summary: event.summary,
      }))

    // Generate available slots (9 AM to 6 PM, 30-min intervals)
    const availableSlots: string[] = []
    const workdayStart = 9 // 9 AM
    const workdayEnd = 18 // 6 PM
    const slotDuration = 30 // minutes

    for (let hour = workdayStart; hour < workdayEnd; hour++) {
      for (let minute = 0; minute < 60; minute += slotDuration) {
        const slotStart = new Date(year, month - 1, day, hour, minute, 0, 0)
        const slotEnd = new Date(year, month - 1, day, hour, minute + slotDuration, 0, 0)

        // Check if this slot conflicts with any busy time
        const isConflict = busySlots.some((busy) => {
          if (!busy.start || !busy.end) return false
          const busyStart = new Date(busy.start)
          const busyEnd = new Date(busy.end)
          // Overlap check: slot starts before busy ends AND slot ends after busy starts
          return slotStart < busyEnd && slotEnd > busyStart
        })

        if (!isConflict) {
          availableSlots.push(
            `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
          )
        }
      }
    }

    return NextResponse.json({
      date,
      busySlots,
      availableSlots,
      allDayEvents,
    })
  } catch (error) {
    console.error("Error fetching calendar availability:", error)
    return NextResponse.json(
      { error: "Failed to fetch calendar availability" },
      { status: 500 }
    )
  }
}
