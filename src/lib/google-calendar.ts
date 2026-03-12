import { google } from "googleapis"

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
)

export function getCalendarClient(accessToken: string) {
  oauth2Client.setCredentials({ access_token: accessToken })
  return google.calendar({ version: "v3", auth: oauth2Client })
}

export async function createCalendarEvent(
  accessToken: string,
  event: {
    summary: string
    description?: string
    location?: string
    start: Date
    end: Date
  }
) {
  const calendar = getCalendarClient(accessToken)

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: {
        dateTime: event.start.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: event.end.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
  })

  return response.data
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  event: {
    summary?: string
    description?: string
    location?: string
    start?: Date
    end?: Date
  }
) {
  const calendar = getCalendarClient(accessToken)

  const requestBody: Record<string, unknown> = {}
  if (event.summary) requestBody.summary = event.summary
  if (event.description) requestBody.description = event.description
  if (event.location) requestBody.location = event.location
  if (event.start) {
    requestBody.start = {
      dateTime: event.start.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  }
  if (event.end) {
    requestBody.end = {
      dateTime: event.end.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  }

  const response = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody,
  })

  return response.data
}

export async function deleteCalendarEvent(accessToken: string, eventId: string) {
  const calendar = getCalendarClient(accessToken)

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  })
}

export async function listCalendarEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date
) {
  const calendar = getCalendarClient(accessToken)

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  })

  return response.data.items || []
}
