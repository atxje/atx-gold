import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listCalendarEvents } from "@/lib/google-calendar"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!session.user.accessToken) {
    return NextResponse.json({ events: [], noAccess: true })
  }

  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get("startDate")
  const endDate = searchParams.get("endDate")

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 })
  }

  try {
    const events = await listCalendarEvents(
      session.user.accessToken,
      new Date(startDate),
      new Date(endDate)
    )

    // Format events for display
    const formattedEvents = events
      .filter(event => event.start?.dateTime) // Only timed events, not all-day
      .map(event => ({
        id: event.id,
        summary: event.summary || "Untitled",
        start: event.start?.dateTime,
        end: event.end?.dateTime,
        location: event.location,
        isGoogleEvent: true,
      }))

    return NextResponse.json({ events: formattedEvents })
  } catch (error) {
    console.error("Error fetching calendar events:", error)
    return NextResponse.json({ events: [], error: "Failed to fetch events" })
  }
}
