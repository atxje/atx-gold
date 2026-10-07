import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { auth } from "@/lib/auth"

// POST /api/id-scan — read a photo of a driver's license / ID card and return
// the seller's name, address and ID number so the purchase form can fill them in.
//
// Body: { image: "data:image/jpeg;base64,..." }
// The photo is only passed to the AI for reading. It is never stored or logged.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Newest model first; fall back to the model the rest of the app already uses
const MODELS = ["claude-sonnet-5-5", "claude-sonnet-4-20250514"]

const PROMPT = `This is a photo of a government-issued photo ID (usually a US driver's license or state ID card).
Read it and reply with ONLY a JSON object, no other text, in exactly this shape:
{
  "isId": true or false,
  "firstName": string or null,
  "lastName": string or null,
  "street": string or null,
  "city": string or null,
  "state": string or null (2-letter code of the address),
  "zip": string or null,
  "idNumber": string or null (the DL / ID number, exactly as printed, no label),
  "issuingState": string or null (2-letter code),
  "dateOfBirth": "YYYY-MM-DD" or null,
  "expirationDate": "YYYY-MM-DD" or null
}
Rules: use null for anything you cannot read with confidence; never guess digits.
Write names and addresses in normal capitalization (e.g. "John Smith", "123 Main St").
If the image is not an ID card, set "isId" to false and everything else to null.`

interface IdFields {
  isId: boolean
  firstName: string | null
  lastName: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  idNumber: string | null
  issuingState: string | null
  dateOfBirth: string | null
  expirationDate: string | null
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ID scanning is not configured" }, { status: 503 })
  }

  let image: string | undefined
  try {
    image = (await request.json())?.image
  } catch {
    // fall through to the validation below
  }
  const match = typeof image === "string" ? image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/) : null
  if (!match) {
    return NextResponse.json({ error: "Please take or choose a photo of the ID" }, { status: 400 })
  }
  const mediaType = match[1] as "image/jpeg" | "image/png" | "image/webp" | "image/gif"
  const data = match[2]

  let text = ""
  let lastError: unknown = null
  for (const model of MODELS) {
    try {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: PROMPT },
          ],
        }],
      })
      text = response.content.map(b => (b.type === "text" ? b.text : "")).join("")
      lastError = null
      break
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) {
    // Log only the error type, never the image or its contents
    console.error("ID scan failed:", lastError instanceof Error ? lastError.message : "unknown error")
    return NextResponse.json({ error: "Couldn't read the ID right now — please type the details in" }, { status: 502 })
  }

  let fields: IdFields
  try {
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)
    fields = JSON.parse(json)
  } catch {
    return NextResponse.json({ error: "Couldn't read the ID — try a sharper, well-lit photo" }, { status: 422 })
  }

  if (!fields.isId) {
    return NextResponse.json({ error: "That doesn't look like an ID card — try again" }, { status: 422 })
  }

  const clean = (s: string | null | undefined) => (typeof s === "string" && s.trim() ? s.trim() : null)
  const name = [clean(fields.firstName), clean(fields.lastName)].filter(Boolean).join(" ") || null
  const cityLine = [clean(fields.city), [clean(fields.state), clean(fields.zip)].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ")
  const address = [clean(fields.street), cityLine].filter(Boolean).join(", ") || null
  const expirationDate = clean(fields.expirationDate)
  const today = new Date().toISOString().slice(0, 10)

  return NextResponse.json({
    name,
    address,
    idNumber: clean(fields.idNumber),
    issuingState: clean(fields.issuingState),
    dateOfBirth: clean(fields.dateOfBirth),
    expirationDate,
    expired: !!expirationDate && /^\d{4}-\d{2}-\d{2}$/.test(expirationDate) && expirationDate < today,
  })
}
