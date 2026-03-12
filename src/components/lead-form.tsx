"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface LeadFormProps {
  lead?: {
    id: string
    name: string
    phone: string | null
    email: string | null
    notes: string | null
    source: string
    channel: string
    status: string
    followUpDate: string | null
  }
  onClose?: () => void
}

const sources = ["ORGANIC", "PAID"]
const channels = ["ONLINE_FORM", "PHONE", "TEXT", "WALK_IN"]
const statuses = ["NEW", "CONTACTED", "APPOINTMENT_SET", "MET", "BOUGHT", "NO_SALE"]

export function LeadForm({ lead, onClose }: LeadFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [createdLeadId, setCreatedLeadId] = useState<string | null>(null)

  const isEdit = !!lead

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get("name"),
      phone: formData.get("phone") || null,
      email: formData.get("email") || null,
      notes: formData.get("notes") || null,
      source: formData.get("source"),
      channel: formData.get("channel"),
      status: formData.get("status"),
      followUpDate: isEdit ? (formData.get("followUpDate") || null) : null,
    }

    try {
      const url = isEdit ? `/api/leads/${lead.id}` : "/api/leads"
      const method = isEdit ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to save lead")
      }

      const result = await res.json()

      router.refresh()
      if (onClose) onClose()
      if (!isEdit) {
        setCreatedLeadId(result.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (createdLeadId) {
    return (
      <div className="text-center py-6">
        <div className="text-green-600 text-lg font-medium mb-4">Lead created successfully!</div>
        <div className="flex justify-center gap-4">
          <button
            onClick={() => router.push(`/appointments/new?leadId=${createdLeadId}`)}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            Schedule Appointment
          </button>
          <button
            onClick={() => router.push("/leads")}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Back to Leads
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-500 p-3 rounded text-sm">{error}</div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Name *
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={lead?.name}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={lead?.phone || ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={lead?.email || ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="source" className="block text-sm font-medium text-gray-700">
            Source
          </label>
          <select
            id="source"
            name="source"
            defaultValue={lead?.source || "ORGANIC"}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {sources.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="channel" className="block text-sm font-medium text-gray-700">
            Channel
          </label>
          <select
            id="channel"
            name="channel"
            defaultValue={lead?.channel || "PHONE"}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {channels.map((c) => (
              <option key={c} value={c}>
                {c === "ONLINE_FORM" ? "Online Form" : c.replace("_", " ").charAt(0) + c.replace("_", " ").slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={lead?.status || "NEW"}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ").charAt(0) + s.replace("_", " ").slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isEdit && (
        <div>
          <label htmlFor="followUpDate" className="block text-sm font-medium text-gray-700">
            Follow-up Date
          </label>
          <input
            id="followUpDate"
            name="followUpDate"
            type="date"
            defaultValue={lead?.followUpDate ? lead.followUpDate.split("T")[0] : ""}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={lead?.notes || ""}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="flex justify-end space-x-3">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Saving..." : isEdit ? "Update Lead" : "Create Lead"}
        </button>
      </div>
    </form>
  )
}
