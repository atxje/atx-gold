"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { format, isPast, isWithinInterval, addDays } from "date-fns"

async function cancelAppointment(id: string): Promise<boolean> {
  const res = await fetch(`/api/appointments/${id}`, { method: "DELETE" })
  return res.ok
}

interface EmailCheckResult {
  processed: number
  leadsCreated: number
  errors: string[]
}

interface Lead {
  id: string
  name: string
  phone: string | null
  email: string | null
  status: string
  followUpDate: string | null
  createdAt: string
}

interface Appointment {
  id: string
  dateTime: string
  duration: number
  location: string | null
  leadRelation: {
    id: string
    name: string
    phone: string | null
  }
}

interface GoogleEvent {
  id: string
  summary: string
  start: string
  end: string
  location: string | null
  isGoogleEvent: true
}

interface Stats {
  total: number
  new: number
  contacted: number
  appointmentSet: number
  met: number
  bought: number
  noSale: number
}

const statusColors: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  CONTACTED: "bg-yellow-100 text-yellow-800",
  APPOINTMENT_SET: "bg-purple-100 text-purple-800",
  MET: "bg-indigo-100 text-indigo-800",
  BOUGHT: "bg-green-100 text-green-800",
  NO_SALE: "bg-gray-100 text-gray-800",
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([])
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats>({
    total: 0, new: 0, contacted: 0, appointmentSet: 0, met: 0, bought: 0, noSale: 0
  })
  const [checkingEmails, setCheckingEmails] = useState(false)
  const [emailResult, setEmailResult] = useState<EmailCheckResult | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchData()
    }
  }, [session])

  async function fetchData() {
    setLoading(true)

    // Fetch leads
    const leadsRes = await fetch("/api/leads")
    if (leadsRes.ok) {
      const data: Lead[] = await leadsRes.json()
      setLeads(data)

      const newStats: Stats = {
        total: data.length,
        new: data.filter(l => l.status === "NEW").length,
        contacted: data.filter(l => l.status === "CONTACTED").length,
        appointmentSet: data.filter(l => l.status === "APPOINTMENT_SET").length,
        met: data.filter(l => l.status === "MET").length,
        bought: data.filter(l => l.status === "BOUGHT").length,
        noSale: data.filter(l => l.status === "NO_SALE").length,
      }
      setStats(newStats)
    }

    // Fetch today's appointments
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const aptsRes = await fetch(
      `/api/appointments?startDate=${today.toISOString()}&endDate=${tomorrow.toISOString()}`
    )
    if (aptsRes.ok) {
      const aptsData = await aptsRes.json()
      setTodayAppointments(aptsData)
    }

    // Fetch Google Calendar events for today
    const gcalRes = await fetch(
      `/api/calendar/events?startDate=${today.toISOString()}&endDate=${tomorrow.toISOString()}`
    )
    if (gcalRes.ok) {
      const gcalData = await gcalRes.json()
      setGoogleEvents(gcalData.events || [])
    }

    setLoading(false)
  }

  async function checkEmails() {
    setCheckingEmails(true)
    setEmailResult(null)
    try {
      const res = await fetch("/api/email/check-forms", { method: "POST" })
      if (res.ok) {
        const result = await res.json()
        setEmailResult(result)
        if (result.leadsCreated > 0) {
          fetchData() // Refresh dashboard data
        }
      } else {
        const error = await res.json()
        setEmailResult({ processed: 0, leadsCreated: 0, errors: [error.error] })
      }
    } catch (error) {
      setEmailResult({ processed: 0, leadsCreated: 0, errors: ["Failed to check emails"] })
    } finally {
      setCheckingEmails(false)
    }
  }

  const overdueFollowUps = leads.filter(l =>
    l.followUpDate &&
    isPast(new Date(l.followUpDate)) &&
    !["BOUGHT", "NO_SALE"].includes(l.status)
  )

  const upcomingFollowUps = leads.filter(l =>
    l.followUpDate &&
    isWithinInterval(new Date(l.followUpDate), {
      start: new Date(),
      end: addDays(new Date(), 7)
    }) &&
    !["BOUGHT", "NO_SALE"].includes(l.status)
  )

  
  if (status === "loading" || !session) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-gray-500">Total Leads</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.new}</div>
            <div className="text-sm text-blue-600">New</div>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.contacted}</div>
            <div className="text-sm text-yellow-600">Contacted</div>
          </div>
          <div className="bg-purple-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-purple-600">{stats.appointmentSet}</div>
            <div className="text-sm text-purple-600">Appt Set</div>
          </div>
          <div className="bg-indigo-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-indigo-600">{stats.met}</div>
            <div className="text-sm text-indigo-600">Met</div>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-green-600">{stats.bought}</div>
            <div className="text-sm text-green-600">Bought</div>
          </div>
          <div className="bg-gray-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-gray-600">{stats.noSale}</div>
            <div className="text-sm text-gray-600">No Sale</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Follow-up Reminders */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Follow-up Reminders</h2>

            {overdueFollowUps.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-red-600 mb-2">
                  Overdue ({overdueFollowUps.length})
                </h3>
                <div className="space-y-2">
                  {overdueFollowUps.slice(0, 5).map(lead => (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="block p-2 border border-red-200 rounded hover:bg-red-50"
                    >
                      <div className="flex justify-between">
                        <span className="font-medium">{lead.name}</span>
                        <span className="text-sm text-red-600">
                          {format(new Date(lead.followUpDate!), "MMM d")}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[lead.status]}`}>
                        {lead.status.replace("_", " ")}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {upcomingFollowUps.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-yellow-600 mb-2">
                  Upcoming ({upcomingFollowUps.length})
                </h3>
                <div className="space-y-2">
                  {upcomingFollowUps.slice(0, 5).map(lead => (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="block p-2 border border-yellow-200 rounded hover:bg-yellow-50"
                    >
                      <div className="flex justify-between">
                        <span className="font-medium">{lead.name}</span>
                        <span className="text-sm text-yellow-600">
                          {format(new Date(lead.followUpDate!), "MMM d")}
                        </span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[lead.status]}`}>
                        {lead.status.replace("_", " ")}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {overdueFollowUps.length === 0 && upcomingFollowUps.length === 0 && (
              <p className="text-gray-500 text-sm">No follow-ups scheduled</p>
            )}
          </div>

          {/* Today's Appointments */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Today&apos;s Schedule</h2>
              <Link href="/appointments" className="text-blue-600 text-sm hover:underline">
                View all
              </Link>
            </div>
            {loading ? (
              <p className="text-gray-500">Loading...</p>
            ) : todayAppointments.length === 0 && googleEvents.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-gray-500 mb-2">No appointments today</p>
                <Link href="/appointments/new" className="text-blue-600 hover:underline">
                  Schedule one
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Merge and sort all events by time */}
                {[
                  ...todayAppointments.map(apt => ({
                    id: apt.id,
                    time: new Date(apt.dateTime),
                    type: "app" as const,
                    data: apt,
                  })),
                  ...googleEvents.map(evt => ({
                    id: evt.id,
                    time: new Date(evt.start),
                    type: "google" as const,
                    data: evt,
                  })),
                ]
                  .sort((a, b) => a.time.getTime() - b.time.getTime())
                  .map(item => (
                    item.type === "app" ? (
                      <div
                        key={item.id}
                        className="p-3 border border-purple-200 rounded hover:bg-purple-50"
                      >
                        <Link
                          href={`/appointments/${item.id}/edit`}
                          className="block"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium">{item.data.leadRelation.name}</div>
                              <div className="text-sm text-gray-500">
                                {item.data.leadRelation.phone || "No phone"}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium text-purple-600">
                                {format(item.time, "h:mm a")}
                              </div>
                              <div className="text-xs text-gray-500">
                                {item.data.duration} min
                              </div>
                            </div>
                          </div>
                          {item.data.location && (
                            <div className="text-sm text-gray-500 mt-1">{item.data.location}</div>
                          )}
                        </Link>
                        <div className="flex gap-2 mt-2 pt-2 border-t border-purple-100">
                          <Link
                            href={`/appointments/${item.id}/edit`}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              if (confirm("Cancel this appointment?")) {
                                const success = await cancelAppointment(item.id)
                                if (success) {
                                  setTodayAppointments(prev => prev.filter(a => a.id !== item.id))
                                }
                              }
                            }}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Cancel
                          </button>
                          <Link
                            href={`/leads/${item.data.leadRelation.id}`}
                            className="text-sm text-gray-500 hover:underline ml-auto"
                          >
                            View Lead
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={item.id}
                        className="p-3 border border-blue-200 rounded bg-blue-50"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{item.data.summary}</div>
                            <div className="text-xs text-blue-600">Google Calendar</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-blue-600">
                              {format(item.time, "h:mm a")}
                            </div>
                            {item.data.end && (
                              <div className="text-xs text-gray-500">
                                to {format(new Date(item.data.end), "h:mm a")}
                              </div>
                            )}
                          </div>
                        </div>
                        {item.data.location && (
                          <div className="text-sm text-gray-500 mt-1">{item.data.location}</div>
                        )}
                      </div>
                    )
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/leads/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add New Lead
            </Link>
            <Link
              href="/appointments/new"
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              Schedule Appointment
            </Link>
            <Link
              href="/purchases/new"
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Record Purchase
            </Link>
            <button
              onClick={checkEmails}
              disabled={checkingEmails}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {checkingEmails ? "Checking..." : "Check Emails for Leads"}
            </button>
          </div>

          {emailResult && (
            <div className={`mt-4 p-3 rounded-md ${emailResult.errors.length > 0 ? "bg-red-50" : "bg-green-50"}`}>
              {emailResult.errors.length > 0 ? (
                <p className="text-red-700">{emailResult.errors[0]}</p>
              ) : (
                <p className="text-green-700">
                  Processed {emailResult.processed} emails, created {emailResult.leadsCreated} new lead(s)
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
