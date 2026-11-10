"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/components/navbar"

interface Recent {
  id: string
  purchaseNumber: string | null
  phone: string
  sendAt: string
  status: "SCHEDULED" | "SENT" | "CANCELED" | "FAILED"
  error: string | null
  lead: { id: string; name: string }
}
interface Data {
  reviewEnabled: boolean
  reviewLink: string
  reviewMessage: string
  reviewDelayMinutes: number
  reviewCooldownDays: number
  twilio: { credentials: boolean; phoneNumber: boolean; messagingService: boolean }
  recent: Recent[]
}

const STATUS_STYLE: Record<Recent["status"], string> = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  SENT: "bg-green-100 text-green-800",
  CANCELED: "bg-gray-100 text-gray-600",
  FAILED: "bg-red-100 text-red-700",
}
const STATUS_LABEL: Record<Recent["status"], string> = {
  SCHEDULED: "Scheduled", SENT: "Sent", CANCELED: "Canceled", FAILED: "Failed",
}

const field = "block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-amber-400 focus:border-amber-400"

export default function MessagingSettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const isAdmin = session?.user?.role === "ADMIN"

  const [data, setData] = useState<Data | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [link, setLink] = useState("")
  const [message, setMessage] = useState("")
  const [delay, setDelay] = useState("60")
  const [cooldown, setCooldown] = useState("90")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
    else if (status === "authenticated" && !isAdmin) router.push("/")
  }, [status, isAdmin, router])

  useEffect(() => {
    if (!isAdmin) return
    fetch("/api/settings/messaging")
      .then(r => (r.ok ? r.json() : null))
      .then((d: Data | null) => {
        if (!d) return
        setData(d)
        setEnabled(d.reviewEnabled)
        setLink(d.reviewLink)
        setMessage(d.reviewMessage)
        setDelay(String(d.reviewDelayMinutes))
        setCooldown(String(d.reviewCooldownDays))
      })
  }, [isAdmin])

  if (status === "loading" || !isAdmin || !data) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  const twilioReady = data.twilio.credentials && data.twilio.messagingService
  const preview = message.replace(/\{first_name\}/gi, "Sarah").replace(/\{link\}/gi, link || "[link]")

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(""); setSuccess(""); setSaving(true)
    try {
      const res = await fetch("/api/settings/messaging", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewEnabled: enabled, reviewLink: link, reviewMessage: message,
          reviewDelayMinutes: parseInt(delay), reviewCooldownDays: parseInt(cooldown),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) setError(d.error || "Failed to save")
      else setSuccess("Saved")
    } catch {
      setError("Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Review Requests</h1>
        <p className="text-sm text-gray-500 mb-6">
          After a sale is saved (Quick Ticket or Record Purchase), the seller gets a thank-you text with your
          Google review link. One text per sale, never during the evening or night, and never to anyone who replied STOP.
        </p>

        {!twilioReady && (
          <div className="mb-5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-4 text-sm">
            <b>Texting isn&apos;t connected yet.</b>{" "}
            {!data.twilio.credentials && "The Twilio account keys are missing. "}
            {!data.twilio.messagingService && "The Twilio Messaging Service ID (TWILIO_MESSAGING_SERVICE_SID) is missing. "}
            Texts will show as Failed below until this is set up.
          </div>
        )}

        <form onSubmit={save} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          {success && <div className="bg-green-50 text-green-700 p-3 rounded text-sm">{success}</div>}

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Send review requests automatically</span>
              <span className="block text-xs text-gray-500">
                Turn this on only after the carriers approve your texting registration — before that, messages are blocked.
              </span>
            </span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Google review link</label>
            <input value={link} onChange={e => setLink(e.target.value)} className={field} placeholder="https://g.page/r/.../review" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} className={field} />
            <p className="mt-1 text-xs text-gray-500">
              <code>{"{first_name}"}</code> becomes the seller&apos;s first name and <code>{"{link}"}</code> becomes the review link.
              Keep &quot;Reply STOP to opt out.&quot; and don&apos;t offer anything in exchange for a review (Google doesn&apos;t allow it).
            </p>
            <div className="mt-3 max-w-sm bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap break-words">
              {preview}
            </div>
            <p className="mt-1 text-xs text-gray-400">{preview.length} characters</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Send how long after the sale?</label>
              <div className="flex items-center gap-2">
                <input type="number" min={15} step={5} value={delay} onChange={e => setDelay(e.target.value)} className={field + " w-28"} />
                <span className="text-sm text-gray-500">minutes</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">Texts due before 9 AM or after 7 PM wait until 10 AM.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ask the same seller again after</label>
              <div className="flex items-center gap-2">
                <input type="number" min={0} value={cooldown} onChange={e => setCooldown(e.target.value)} className={field + " w-28"} />
                <span className="text-sm text-gray-500">days</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-amber-600 text-white rounded-md text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>

        <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-2">Recent requests</h2>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {data.recent.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">None yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Seller</th>
                  <th className="px-4 py-2">Sale</th>
                  <th className="px-4 py-2">Send time</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.recent.map((r: Recent) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">
                      <Link href={`/leads/${r.lead.id}`} className="text-blue-600 hover:underline">{r.lead.name}</Link>
                      <div className="text-xs text-gray-400">{r.phone}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-700">{r.purchaseNumber || "—"}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {new Date(r.sendAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      {r.error && <div className="text-xs text-red-600 mt-0.5">{r.error}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
