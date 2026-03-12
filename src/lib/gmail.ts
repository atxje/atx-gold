import { google } from "googleapis"
import { prisma } from "./prisma"

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
)

export async function getGmailClientWithRefresh(accountId: string, accessToken: string, refreshToken: string | null) {
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  // Check if token needs refresh
  try {
    const tokenInfo = await oauth2Client.getAccessToken()

    // If we got a new token, update it in the database
    if (tokenInfo.token && tokenInfo.token !== accessToken) {
      await prisma.account.update({
        where: { id: accountId },
        data: { access_token: tokenInfo.token },
      })
    }
  } catch (error) {
    // If refresh fails, try to refresh manually
    if (refreshToken) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken()
        oauth2Client.setCredentials(credentials)

        // Update the new access token in database
        if (credentials.access_token) {
          await prisma.account.update({
            where: { id: accountId },
            data: { access_token: credentials.access_token },
          })
        }
      } catch (refreshError) {
        console.error("Failed to refresh token:", refreshError)
        throw new Error("Google authentication expired. Please sign out and sign in again.")
      }
    }
  }

  return google.gmail({ version: "v1", auth: oauth2Client })
}

export async function listEmails(accountId: string, accessToken: string, refreshToken: string | null, query?: string) {
  const gmail = await getGmailClientWithRefresh(accountId, accessToken, refreshToken)

  const searchQuery = query || ""

  const response = await gmail.users.messages.list({
    userId: "me",
    q: searchQuery,
    maxResults: 50,
  })

  return response.data.messages || []
}

export async function getEmailContent(accountId: string, accessToken: string, refreshToken: string | null, messageId: string) {
  const gmail = await getGmailClientWithRefresh(accountId, accessToken, refreshToken)

  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  })

  const message = response.data

  // Extract headers
  const headers = message.payload?.headers || []
  const subject = headers.find((h) => h.name === "Subject")?.value || ""
  const from = headers.find((h) => h.name === "From")?.value || ""
  const date = headers.find((h) => h.name === "Date")?.value || ""

  // Extract body
  let body = ""
  const payload = message.payload

  if (payload?.body?.data) {
    body = Buffer.from(payload.body.data, "base64").toString("utf-8")
  } else if (payload?.parts) {
    // Handle multipart messages
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        body = Buffer.from(part.body.data, "base64").toString("utf-8")
        break
      } else if (part.mimeType === "text/html" && part.body?.data && !body) {
        // Fallback to HTML if no plain text
        body = Buffer.from(part.body.data, "base64").toString("utf-8")
        // Strip HTML tags for basic parsing
        body = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
      }
    }
  }

  return {
    id: messageId,
    subject,
    from,
    date,
    body,
    snippet: message.snippet || "",
  }
}

export async function markEmailAsRead(accountId: string, accessToken: string, refreshToken: string | null, messageId: string) {
  const gmail = await getGmailClientWithRefresh(accountId, accessToken, refreshToken)

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
    },
  })
}
