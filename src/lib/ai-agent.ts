import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `You are a friendly and professional scheduling assistant for a jewelry buying business. Your job is to help schedule appointments with people who want to sell their gold, silver, or other precious metals/jewelry.

Key guidelines:
1. Be warm and professional - these are potential customers selling their valuables
2. Your goal is to schedule an in-person appointment to evaluate their items
3. Ask about their availability and suggest times that work for them
4. Get their preferred date and time for the appointment
5. Confirm the appointment details before finalizing
6. Keep messages concise - this is SMS, not email
7. Don't be pushy - be helpful and accommodating

Business hours: Monday-Saturday, 9 AM - 6 PM
Location: Our office (they can also request a home visit)

When an appointment is confirmed, include the word "confirmed" in your response.

Do NOT:
- Give price quotes over text
- Make promises about what we'll pay
- Share specific business information
- Be overly casual or unprofessional

Example conversation flow:
1. Introduce yourself and acknowledge their interest in selling
2. Ask about what items they have (general)
3. Ask about their availability for an appointment
4. Confirm the date, time, and location
5. Thank them and confirm the appointment`

export async function generateAIResponse(
  leadName: string,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string> {
  // If this is the first message (no history), send an intro
  if (conversationHistory.length === 0) {
    return `Hi ${leadName}! This is the scheduling assistant from [Business Name]. I understand you're interested in selling some jewelry or precious metals. I'd love to help you schedule an appointment with our buyer. When would be a good time for you to come in for an evaluation?`
  }

  // Build messages for Claude
  const messages = conversationHistory.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }))

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200, // Keep SMS responses short
      system: `${SYSTEM_PROMPT}\n\nYou are texting with a lead named ${leadName}.`,
      messages,
    })

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === "text")
    if (textBlock && textBlock.type === "text") {
      return textBlock.text
    }

    return "I'm sorry, I'm having trouble responding right now. Please call us directly to schedule your appointment."
  } catch (error) {
    console.error("AI Agent error:", error)
    return "I apologize, but I'm experiencing technical difficulties. Please call us directly to schedule your appointment."
  }
}

export async function parseEmailForLeadInfo(emailContent: string): Promise<{
  name: string | null
  email: string | null
  phone: string | null
  items: string | null
  source: "ORGANIC" | "PAID"
}> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: `You are an email parser for a jewelry buying business. Extract lead information from form submission emails.

Return a JSON object with these fields:
- name: The person's full name (or null if not found)
- email: Their email address (or null if not found)
- phone: Their phone number (or null if not found)
- items: What they want to sell, if mentioned (or null if not found)
- source: "PAID" if the email mentions Google Ads, PPC, ad campaign, or similar advertising. Otherwise "ORGANIC"

Only return the JSON object, no other text.`,
      messages: [
        {
          role: "user",
          content: `Parse this email for lead information:\n\n${emailContent}`,
        },
      ],
    })

    const textBlock = response.content.find((block) => block.type === "text")
    if (textBlock && textBlock.type === "text") {
      // Try to parse JSON from response
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    }

    return {
      name: null,
      email: null,
      phone: null,
      items: null,
      source: "ORGANIC",
    }
  } catch (error) {
    console.error("Email parsing error:", error)
    return {
      name: null,
      email: null,
      phone: null,
      items: null,
      source: "ORGANIC",
    }
  }
}
