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

// Schedule a text for later through the Messaging Service (Twilio holds it and
// sends it at sendAt — no cron needed). sendAt must be 15 minutes to 35 days ahead.
export async function scheduleSms(to: string, body: string, sendAt: Date, statusCallback?: string) {
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  if (!messagingServiceSid) {
    throw new Error("Twilio messaging service not configured (TWILIO_MESSAGING_SERVICE_SID)")
  }
  return getClient().messages.create({
    body,
    to,
    messagingServiceSid,
    scheduleType: "fixed",
    sendAt,
    ...(statusCallback && { statusCallback }),
  })
}

// Cancel a text that was scheduled but hasn't gone out yet
export async function cancelScheduledSms(sid: string) {
  return getClient().messages(sid).update({ status: "canceled" })
}

export function smsConfigStatus() {
  return {
    credentials: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    phoneNumber: !!process.env.TWILIO_PHONE_NUMBER,
    messagingService: !!process.env.TWILIO_MESSAGING_SERVICE_SID,
  }
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
