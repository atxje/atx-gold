import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendSms, formatPhoneNumber } from "@/lib/twilio"
import { format } from "date-fns"

const CRON_SECRET = process.env.CRON_SECRET

const OFFICE_ADDRESS = "7951 Shoal Creek Blvd, suite 250 Austin, TX 78757"
const OFFICE_INSTRUCTIONS = "We are located in an office inside the PNC Bank building - Second floor suite 250"

export async function POST(request: Request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization")
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get today's date range
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Find all appointments for today
    const appointments = await prisma.appointment.findMany({
      where: {
        dateTime: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        leadRelation: {
          select: { name: true, phone: true },
        },
      },
    })

    const results = {
      total: appointments.length,
      sent: 0,
      failed: 0,
      skipped: 0,
    }

    for (const appointment of appointments) {
      const phone = appointment.leadRelation.phone

      if (!phone) {
        results.skipped++
        continue
      }

      try {
        const formattedTime = format(new Date(appointment.dateTime), "h:mm a")
        const smsBody = `Reminder: You have an appointment today at ${formattedTime}.\n\nAddress: ${OFFICE_ADDRESS}\n\n${OFFICE_INSTRUCTIONS}`

        await sendSms(formatPhoneNumber(phone), smsBody)
        results.sent++
      } catch (error) {
        console.error(`Failed to send reminder to ${phone}:`, error)
        results.failed++
      }
    }

    return NextResponse.json({
      success: true,
      date: today.toISOString().split("T")[0],
      results,
    })
  } catch (error) {
    console.error("Error sending daily reminders:", error)
    return NextResponse.json(
      { error: "Failed to send reminders" },
      { status: 500 }
    )
  }
}
