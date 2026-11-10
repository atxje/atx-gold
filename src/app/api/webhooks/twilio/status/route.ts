import { NextResponse } from "next/server"
import twilio from "twilio"
import { prisma } from "@/lib/prisma"

// Twilio delivery-status callback for scheduled review-request texts.
// Marks the request SENT once it goes out, or FAILED with the reason.

const ERROR_HINTS: Record<string, string> = {
  "30034": "Number not registered with carriers yet (A2P 10DLC)",
  "21610": "Seller opted out (replied STOP)",
  "30003": "Phone unreachable",
  "30005": "Unknown or inactive number",
  "30006": "Landline or unreachable carrier",
  "30007": "Blocked by carrier as spam",
  "21614": "Not a mobile number",
}

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const signature = request.headers.get("x-twilio-signature")
  const formData = await request.formData()
  const params: Record<string, string> = {}
  formData.forEach((value, key) => { params[key] = value.toString() })

  if (!authToken || !signature) return new NextResponse("Forbidden", { status: 403 })

  const url = new URL(request.url)
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host
  const publicUrl = `${proto}://${host}${url.pathname}${url.search}`
  if (!twilio.validateRequest(authToken, signature, publicUrl, params)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const sid = params["MessageSid"]
  const status = (params["MessageStatus"] || "").toLowerCase()
  if (!sid) return new NextResponse(null, { status: 204 })

  try {
    if (status === "sent" || status === "delivered") {
      await prisma.reviewRequest.updateMany({
        where: { twilioSid: sid, status: { in: ["SCHEDULED", "SENT"] } },
        data: { status: "SENT", error: null },
      })
    } else if (status === "failed" || status === "undelivered") {
      const code = params["ErrorCode"] || ""
      await prisma.reviewRequest.updateMany({
        where: { twilioSid: sid },
        data: { status: "FAILED", error: ERROR_HINTS[code] ? `${ERROR_HINTS[code]} (${code})` : `Not delivered${code ? ` (error ${code})` : ""}` },
      })
    } else if (status === "canceled") {
      await prisma.reviewRequest.updateMany({ where: { twilioSid: sid, status: "SCHEDULED" }, data: { status: "CANCELED" } })
    }
  } catch (error) {
    console.error("Twilio status callback error:", error instanceof Error ? error.message : error)
  }
  return new NextResponse(null, { status: 204 })
}

export const runtime = "nodejs"
