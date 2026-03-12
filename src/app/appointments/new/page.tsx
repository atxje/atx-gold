"use client"

import { Suspense, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { TextModal } from "@/components/text-modal"
import { format } from "date-fns"

interface Lead {
  id: string
  name: string
  phone: string | null
  email: string | null
}

const channels = ["ONLINE_FORM", "PHONE", "TEXT", "WALK_IN"]
const sources = ["ORGANIC", "PAID"]

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number)
  const period = hours >= 12 ? "PM" : "AM"
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`
}

interface BusySlot {
  start: string
  end: string
  summary: string
}

function NewAppointmentForm() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedLeadId = searchParams.get("leadId")

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [selectedLeadId, setSelectedLeadId] = useState(preselectedLeadId || "")
  const [isNewLead, setIsNewLead] = useState(false)
  const [selectedDate, setSelectedDate] = useState("")
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [busySlots, setBusySlots] = useState<BusySlot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedTime, setSelectedTime] = useState("")
  const [calendarError, setCalendarError] = useState("")
  const [showAllSlots, setShowAllSlots] = useState(false)
  const [allSlots, setAllSlots] = useState<string[]>([])
  const [allDayEvents, setAllDayEvents] = useState<{ summary: string }[]>([])
  const [createdAppointment, setCreatedAppointment] = useState<{
    leadId: string
    leadName: string
    leadPhone: string | null
    date: string
    time: string
  } | null>(null)
  const [showTextModal, setShowTextModal] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchLeads()
    }
  }, [session])

  async function fetchLeads() {
    const res = await fetch("/api/leads")
    if (res.ok) {
      const data = await res.json()
      setLeads(data)
    }
  }

  function generateAllSlots(): string[] {
    const slots: string[] = []
    for (let hour = 9; hour < 18; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        slots.push(`${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`)
      }
    }
    return slots
  }

  async function fetchAvailability(date: string) {
    setLoadingSlots(true)
    setAvailableSlots([])
    setBusySlots([])
    setAllDayEvents([])
    setSelectedTime("")
    setCalendarError("")
    setShowAllSlots(false)
    setAllSlots(generateAllSlots())

    try {
      const res = await fetch(`/api/calendar/availability?date=${date}`)
      const data = await res.json()

      if (res.status === 403) {
        setCalendarError(data.error || "No Google Calendar access")
        return
      }

      if (res.ok) {
        setAvailableSlots(data.availableSlots)
        setBusySlots(data.busySlots)
        setAllDayEvents(data.allDayEvents || [])
      }
    } catch (err) {
      console.error("Failed to fetch availability:", err)
    } finally {
      setLoadingSlots(false)
    }
  }

  function handleDateChange(date: string) {
    setSelectedDate(date)
    if (date) {
      fetchAvailability(date)
    } else {
      setAvailableSlots([])
      setBusySlots([])
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")

    if (!selectedTime) {
      setError("Please select a time slot")
      return
    }

    setLoading(true)

    const formData = new FormData(e.currentTarget)

    try {
      let leadId = selectedLeadId

      // If creating a new lead, create it first
      if (isNewLead) {
        const leadData = {
          name: formData.get("newLeadName"),
          phone: formData.get("newLeadPhone") || null,
          email: formData.get("newLeadEmail") || null,
          source: formData.get("newLeadSource"),
          channel: formData.get("newLeadChannel"),
          status: "APPOINTMENT_SET",
        }

        const leadRes = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(leadData),
        })

        if (!leadRes.ok) {
          const errorData = await leadRes.json()
          throw new Error(errorData.error || "Failed to create lead")
        }

        const newLead = await leadRes.json()
        leadId = newLead.id
      }

      const appointmentData = {
        leadId,
        dateTime: `${formData.get("date")}T${formData.get("time")}`,
        duration: parseInt(formData.get("duration") as string) || 30,
        location: formData.get("location") || null,
        notes: formData.get("notes") || null,
      }

      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appointmentData),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Failed to create appointment")
      }

      // Get lead info for the success screen
      const lead = isNewLead
        ? { id: leadId, name: formData.get("newLeadName") as string, phone: formData.get("newLeadPhone") as string }
        : leads.find(l => l.id === leadId)

      const appointmentDateTime = new Date(`${formData.get("date")}T${formData.get("time")}`)

      setCreatedAppointment({
        leadId: leadId,
        leadName: lead?.name || "Unknown",
        leadPhone: lead?.phone || null,
        date: format(appointmentDateTime, "MMMM d, yyyy"),
        time: format(appointmentDateTime, "h:mm a"),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (status === "loading" || !session) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  // Show success screen after appointment is created
  if (createdAppointment) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Appointment Created!</h2>
            <p className="text-gray-600 mb-6">
              Scheduled with <strong>{createdAppointment.leadName}</strong><br />
              {createdAppointment.date} at {createdAppointment.time}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              {createdAppointment.leadPhone && (
                <button
                  onClick={() => setShowTextModal(true)}
                  className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Send Text
                </button>
              )}
              <button
                onClick={() => router.push("/appointments")}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                View Appointments
              </button>
              <button
                onClick={() => {
                  setCreatedAppointment(null)
                  setSelectedDate("")
                  setSelectedTime("")
                  setSelectedLeadId(preselectedLeadId || "")
                  setIsNewLead(false)
                }}
                className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Schedule Another
              </button>
            </div>
          </div>
        </main>

        {createdAppointment.leadPhone && (
          <TextModal
            isOpen={showTextModal}
            onClose={() => setShowTextModal(false)}
            leadId={createdAppointment.leadId}
            leadName={createdAppointment.leadName}
            leadPhone={createdAppointment.leadPhone}
            appointmentDate={createdAppointment.date}
            appointmentTime={createdAppointment.time}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700 mb-2"
          >
            &larr; Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">New Appointment</h1>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-500 p-3 rounded text-sm">{error}</div>
            )}

            {/* Toggle between existing lead and new lead */}
            <div className="flex gap-4 mb-4">
              <button
                type="button"
                onClick={() => setIsNewLead(false)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium ${
                  !isNewLead
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Existing Lead
              </button>
              <button
                type="button"
                onClick={() => { setIsNewLead(true); setSelectedLeadId(""); }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium ${
                  isNewLead
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                New Lead
              </button>
            </div>

            {!isNewLead ? (
              <div>
                <label htmlFor="leadId" className="block text-sm font-medium text-gray-700">
                  Lead *
                </label>
                <select
                  id="leadId"
                  name="leadId"
                  required={!isNewLead}
                  value={selectedLeadId}
                  onChange={(e) => setSelectedLeadId(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a lead</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.name} {lead.phone ? `(${lead.phone})` : lead.email ? `(${lead.email})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-4 p-4 bg-gray-50 rounded-md">
                <h3 className="font-medium text-gray-900">New Lead Details</h3>

                <div>
                  <label htmlFor="newLeadName" className="block text-sm font-medium text-gray-700">
                    Name *
                  </label>
                  <input
                    id="newLeadName"
                    name="newLeadName"
                    type="text"
                    required={isNewLead}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="newLeadPhone" className="block text-sm font-medium text-gray-700">
                      Phone
                    </label>
                    <input
                      id="newLeadPhone"
                      name="newLeadPhone"
                      type="tel"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="newLeadEmail" className="block text-sm font-medium text-gray-700">
                      Email
                    </label>
                    <input
                      id="newLeadEmail"
                      name="newLeadEmail"
                      type="email"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="newLeadSource" className="block text-sm font-medium text-gray-700">
                      Source
                    </label>
                    <select
                      id="newLeadSource"
                      name="newLeadSource"
                      defaultValue="ORGANIC"
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
                    <label htmlFor="newLeadChannel" className="block text-sm font-medium text-gray-700">
                      Channel
                    </label>
                    <select
                      id="newLeadChannel"
                      name="newLeadChannel"
                      defaultValue="PHONE"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      {channels.map((c) => (
                        <option key={c} value={c}>
                          {c === "ONLINE_FORM" ? "Online Form" : c.replace("_", " ").charAt(0) + c.replace("_", " ").slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="date" className="block text-sm font-medium text-gray-700">
                Date *
              </label>
              <input
                id="date"
                name="date"
                type="date"
                required
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {selectedDate && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time *
                </label>

                {calendarError ? (
                  <div className="space-y-3">
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded text-sm">
                      {calendarError}. Sign out and sign in with Google to see calendar availability.
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Enter time manually:</label>
                      <input
                        type="time"
                        value={selectedTime}
                        onChange={(e) => setSelectedTime(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                ) : loadingSlots ? (
                  <div className="text-sm text-gray-500">Loading calendar availability...</div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-gray-600">
                        {showAllSlots ? "All time slots:" : "Available slots from your Google Calendar:"}
                      </p>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={showAllSlots}
                          onChange={(e) => setShowAllSlots(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-600">Show busy times too</span>
                      </label>
                    </div>

                    {(showAllSlots ? allSlots : availableSlots).length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {(showAllSlots ? allSlots : availableSlots).map((slot) => {
                          const isBusy = showAllSlots && !availableSlots.includes(slot)
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => setSelectedTime(slot)}
                              className={`px-3 py-2 text-sm rounded-md border ${
                                selectedTime === slot
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : isBusy
                                  ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              {formatTime(slot)}
                              {isBusy && " *"}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">No available slots for this date</div>
                    )}

                    {showAllSlots && (
                      <p className="mt-2 text-xs text-gray-500">* Times marked with asterisk have existing events</p>
                    )}
                  </div>
                )}

                <input type="hidden" name="time" value={selectedTime} />

                {(busySlots.length > 0 || allDayEvents.length > 0) && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Calendar events on this day:</p>
                    <div className="space-y-1">
                      {allDayEvents.map((event, idx) => (
                        <div key={`allday-${idx}`} className="text-sm text-blue-700 bg-blue-50 px-3 py-1 rounded">
                          All day: {event.summary || "Untitled event"}
                        </div>
                      ))}
                      {busySlots.map((slot, idx) => {
                        const startDate = new Date(slot.start)
                        const endDate = new Date(slot.end)
                        return (
                          <div key={idx} className="text-sm text-orange-700 bg-orange-50 px-3 py-1 rounded">
                            {startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - {endDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            {slot.summary && `: ${slot.summary}`}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
                Duration (minutes)
              </label>
              <select
                id="duration"
                name="duration"
                defaultValue="30"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
              </select>
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Appointment"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

export default function NewAppointmentPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <NewAppointmentForm />
    </Suspense>
  )
}
