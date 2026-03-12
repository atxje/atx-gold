"use client"

import { useEffect, useState, use } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { LeadForm } from "@/components/lead-form"
import { TextModal } from "@/components/text-modal"
import { format } from "date-fns"

interface Lead {
  id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  source: string
  channel: string
  status: string
  followUpDate: string | null
  createdAt: string
  createdBy: { name: string | null; email: string }
  appointments: Array<{
    id: string
    dateTime: string
    duration: number
    location: string | null
    notes: string | null
  }>
  purchases: Array<{
    id: string
    description: string
    metalType: string
    weight: number
    purity: string | null
    pricePaid: number
    purchaseDate: string
  }>
  smsConversations: Array<{
    id: string
    status: string
    startedAt: string
    messages: Array<{
      id: string
      direction: string
      content: string
      sentAt: string
    }>
  }>
}

const statusColors: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  CONTACTED: "bg-yellow-100 text-yellow-800",
  APPOINTMENT_SET: "bg-purple-100 text-purple-800",
  MET: "bg-indigo-100 text-indigo-800",
  BOUGHT: "bg-green-100 text-green-800",
  NO_SALE: "bg-gray-100 text-gray-800",
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session, status } = useSession()
  const router = useRouter()
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [startingAI, setStartingAI] = useState(false)
  const [deletingAppointment, setDeletingAppointment] = useState<string | null>(null)
  const [deletingPurchase, setDeletingPurchase] = useState<string | null>(null)
  const [showTextModal, setShowTextModal] = useState(false)
  const [textModalAppointment, setTextModalAppointment] = useState<{date: string, time: string} | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchLead()
    }
  }, [session, id])

  async function fetchLead() {
    setLoading(true)
    const res = await fetch(`/api/leads/${id}`)
    if (res.ok) {
      const data = await res.json()
      setLead(data)
    } else {
      router.push("/leads")
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this lead?")) return

    const res = await fetch(`/api/leads/${id}`, { method: "DELETE" })
    if (res.ok) {
      router.push("/leads")
    }
  }

  async function handleDeleteAppointment(aptId: string) {
    if (!confirm("Delete this appointment? This will also remove it from Google Calendar.")) {
      return
    }

    setDeletingAppointment(aptId)
    try {
      const res = await fetch(`/api/appointments/${aptId}`, { method: "DELETE" })
      if (res.ok) {
        fetchLead()
      }
    } catch (error) {
      console.error("Failed to delete appointment:", error)
    } finally {
      setDeletingAppointment(null)
    }
  }

  async function handleDeletePurchase(purchaseId: string) {
    if (!confirm("Delete this purchase?")) return

    setDeletingPurchase(purchaseId)
    try {
      const res = await fetch(`/api/purchases/${purchaseId}`, { method: "DELETE" })
      if (res.ok) {
        fetchLead()
      }
    } catch (error) {
      console.error("Failed to delete purchase:", error)
    } finally {
      setDeletingPurchase(null)
    }
  }

  async function startAIChat() {
    if (!lead?.phone) {
      alert("Lead must have a phone number to start AI chat")
      return
    }

    setStartingAI(true)
    try {
      const res = await fetch("/api/sms/start-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: id }),
      })

      if (res.ok) {
        fetchLead()
      } else {
        const error = await res.json()
        alert(error.error || "Failed to start AI chat")
      }
    } catch {
      alert("Failed to start AI chat")
    } finally {
      setStartingAI(false)
    }
  }

  if (status === "loading" || loading || !lead) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.push("/leads")}
            className="text-gray-500 hover:text-gray-700 mb-2"
          >
            &larr; Back to Leads
          </button>
        </div>

        {editing ? (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Edit Lead</h2>
            <LeadForm
              lead={{
                ...lead,
                followUpDate: lead.followUpDate
              }}
              onClose={() => {
                setEditing(false)
                fetchLead()
              }}
            />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{lead.name}</h1>
                <span className={`px-2 py-1 text-xs rounded-full ${statusColors[lead.status]}`}>
                  {lead.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {lead.phone && (
                  <>
                    <button
                      onClick={() => {
                        setTextModalAppointment(null)
                        setShowTextModal(true)
                      }}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                    >
                      Text
                    </button>
                    <button
                      onClick={startAIChat}
                      disabled={startingAI}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {startingAI ? "Starting..." : "Start AI Chat"}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Phone:</span>{" "}
                <span className="text-gray-900">{lead.phone || "-"}</span>
              </div>
              <div>
                <span className="text-gray-500">Email:</span>{" "}
                <span className="text-gray-900">{lead.email || "-"}</span>
              </div>
              <div>
                <span className="text-gray-500">Source:</span>{" "}
                <span className="text-gray-900">{lead.source}</span>
              </div>
              <div>
                <span className="text-gray-500">Channel:</span>{" "}
                <span className="text-gray-900">{lead.channel.replace("_", " ")}</span>
              </div>
              <div>
                <span className="text-gray-500">Follow-up:</span>{" "}
                <span className="text-gray-900">
                  {lead.followUpDate ? format(new Date(lead.followUpDate), "MMM d, yyyy") : "-"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Created:</span>{" "}
                <span className="text-gray-900">{format(new Date(lead.createdAt), "MMM d, yyyy")}</span>
              </div>
            </div>

            {lead.notes && (
              <div className="mt-4">
                <span className="text-gray-500 text-sm">Notes:</span>
                <p className="text-gray-900 mt-1">{lead.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Appointments Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Appointments</h2>
            <button
              onClick={() => router.push(`/appointments/new?leadId=${id}`)}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              Add Appointment
            </button>
          </div>
          {lead.appointments.length === 0 ? (
            <p className="text-gray-500 text-sm">No appointments scheduled</p>
          ) : (
            <div className="space-y-2">
              {lead.appointments.map((apt) => (
                <div key={apt.id} className="border rounded p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">
                        {format(new Date(apt.dateTime), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                      <div className="text-sm text-gray-500">
                        {apt.duration} minutes{apt.location ? ` - ${apt.location}` : ""}
                      </div>
                      {apt.notes && <div className="text-sm mt-1">{apt.notes}</div>}
                    </div>
                    <div className="flex gap-2">
                      {lead.phone && (
                        <button
                          onClick={() => {
                            setTextModalAppointment({
                              date: format(new Date(apt.dateTime), "MMMM d, yyyy"),
                              time: format(new Date(apt.dateTime), "h:mm a"),
                            })
                            setShowTextModal(true)
                          }}
                          className="text-purple-600 hover:text-purple-800 text-sm"
                        >
                          Text
                        </button>
                      )}
                      <button
                        onClick={() => router.push(`/appointments/${apt.id}/edit`)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAppointment(apt.id)}
                        disabled={deletingAppointment === apt.id}
                        className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                      >
                        {deletingAppointment === apt.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Purchases Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Purchases</h2>
            <button
              onClick={() => router.push(`/purchases/new?leadId=${id}`)}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
            >
              Add Purchase
            </button>
          </div>
          {lead.purchases.length === 0 ? (
            <p className="text-gray-500 text-sm">No purchases recorded</p>
          ) : (
            <div className="space-y-2">
              {lead.purchases.map((purchase) => (
                <div key={purchase.id} className="border rounded p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="font-medium">{purchase.description}</span>
                        <span className="font-semibold text-green-600">
                          ${purchase.pricePaid.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {purchase.metalType} - {purchase.weight}g
                        {purchase.purity ? ` (${purchase.purity})` : ""}
                      </div>
                      <div className="text-xs text-gray-400">
                        {format(new Date(purchase.purchaseDate), "MMM d, yyyy")}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => router.push(`/purchases/${purchase.id}/edit`)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeletePurchase(purchase.id)}
                        disabled={deletingPurchase === purchase.id}
                        className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                      >
                        {deletingPurchase === purchase.id ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SMS Conversations Section */}
        {lead.smsConversations.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">SMS Conversations</h2>
            {lead.smsConversations.map((conv) => (
              <div key={conv.id} className="border rounded p-3 mb-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-500">
                    Started {format(new Date(conv.startedAt), "MMM d, yyyy")}
                  </span>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    conv.status === "ACTIVE" ? "bg-green-100 text-green-800" :
                    conv.status === "COMPLETED" ? "bg-gray-100 text-gray-800" :
                    "bg-yellow-100 text-yellow-800"
                  }`}>
                    {conv.status}
                  </span>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {conv.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`text-sm p-2 rounded ${
                        msg.direction === "OUTBOUND"
                          ? "bg-blue-50 text-blue-900 ml-8"
                          : "bg-gray-50 text-gray-900 mr-8"
                      }`}
                    >
                      {msg.content}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {lead.phone && (
        <TextModal
          isOpen={showTextModal}
          onClose={() => setShowTextModal(false)}
          leadId={lead.id}
          leadName={lead.name}
          leadPhone={lead.phone}
          appointmentDate={textModalAppointment?.date}
          appointmentTime={textModalAppointment?.time}
        />
      )}
    </div>
  )
}
