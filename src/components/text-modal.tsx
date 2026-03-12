"use client"

import { useState } from "react"

interface TextModalProps {
  isOpen: boolean
  onClose: () => void
  leadId: string
  leadName: string
  leadPhone: string
  appointmentDate?: string
  appointmentTime?: string
}

const templates = [
  {
    id: "custom",
    label: "Custom message",
    template: "",
  },
  {
    id: "appointment_confirm",
    label: "Confirm appointment",
    template: "Hi {name}, this is a confirmation for your appointment on {date} at {time}. Please reply to confirm or let us know if you need to reschedule.",
  },
  {
    id: "appointment_reminder",
    label: "Appointment reminder",
    template: "Hi {name}, just a friendly reminder about your appointment on {date} at {time}. See you soon!",
  },
  {
    id: "follow_up",
    label: "Follow up",
    template: "Hi {name}, I wanted to follow up with you. Do you have any questions or would you like to schedule an appointment?",
  },
  {
    id: "thank_you",
    label: "Thank you",
    template: "Hi {name}, thank you for visiting us today! We appreciate your business. Please don't hesitate to reach out if you have any questions.",
  },
]

export function TextModal({
  isOpen,
  onClose,
  leadId,
  leadName,
  leadPhone,
  appointmentDate,
  appointmentTime,
}: TextModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState("custom")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  function applyTemplate(templateId: string) {
    setSelectedTemplate(templateId)
    const template = templates.find((t) => t.id === templateId)
    if (template && template.template) {
      let text = template.template
        .replace("{name}", leadName.split(" ")[0])
        .replace("{date}", appointmentDate || "[date]")
        .replace("{time}", appointmentTime || "[time]")
      setMessage(text)
    } else {
      setMessage("")
    }
  }

  async function handleSend() {
    if (!message.trim()) {
      setError("Please enter a message")
      return
    }

    setSending(true)
    setError("")

    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, message }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to send message")
      }

      setSuccess(true)
      setTimeout(() => {
        onClose()
        setSuccess(false)
        setMessage("")
        setSelectedTemplate("custom")
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message")
    } finally {
      setSending(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Send Text Message</h2>
          <p className="text-sm text-gray-500">To: {leadName} ({leadPhone})</p>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded text-sm">{error}</div>
          )}

          {success && (
            <div className="bg-green-50 text-green-600 p-3 rounded text-sm">
              Message sent successfully!
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => applyTemplate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Type your message..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">{message.length} characters</p>
          </div>
        </div>

        <div className="p-4 border-t flex justify-end gap-3">
          <button
            onClick={() => {
              onClose()
              setMessage("")
              setSelectedTemplate("custom")
              setError("")
            }}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}
