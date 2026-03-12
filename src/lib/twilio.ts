import twilio from "twilio"

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER

let client: ReturnType<typeof twilio> | null = null

function getClient() {
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured")
  }
  if (!client) {
    client = twilio(accountSid, authToken)
  }
  return client
}

export async function sendSms(to: string, body: string) {
  if (!twilioPhoneNumber) {
    throw new Error("Twilio phone number not configured")
  }

  const twilioClient = getClient()

  const message = await twilioClient.messages.create({
    body,
    from: twilioPhoneNumber,
    to,
  })

  return message
}

export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "")

  // If it's 10 digits, assume US and add +1
  if (digits.length === 10) {
    return `+1${digits}`
  }

  // If it already has a country code
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`
  }

  // Otherwise, assume it's already formatted correctly
  return digits.startsWith("+") ? phone : `+${digits}`
}

export function validateWebhookSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  return twilio.validateRequest(authToken, signature, url, params)
}
