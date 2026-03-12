"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { TextModal } from "@/components/text-modal"
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns"

interface Appointment {
  id: string
  dateTime: string
  duration: number
  location: string | null
  notes: string | null
  leadRelation: {
    id: string
    name: string
    phone: string | null
    email: string | null
  }
}

export default function AppointmentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [deleting, setDeleting] = useState<string | null>(null)
  const [textModal, setTextModal] = useState<{
    isOpen: boolean
    leadId: string
    leadName: string
    leadPhone: string
    date: string
    time: string
  } | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchAppointments()
    }
  }, [session, weekStart])

  async function fetchAppointments() {
    setLoading(true)
    const startDate = weekStart.toISOString()
    const endDate = endOfWeek(weekStart, { weekStartsOn: 0 }).toISOString()

    const res = await fetch(`/api/appointments?startDate=${startDate}&endDate=${endDate}`)
    if (res.ok) {
      const data = await res.json()
      setAppointments(data)
    }
    setLoading(false)
  }

  function previousWeek() {
    setWeekStart(subWeeks(weekStart, 1))
  }

  function nextWeek() {
    setWeekStart(addWeeks(weekStart, 1))
  }

  function thisWeek() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))
  }

  async function handleDelete(aptId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm("Delete this appointment? This will also remove it from Google Calendar.")) {
      return
    }

    setDeleting(aptId)
    try {
      const res = await fetch(`/api/appointments/${aptId}`, { method: "DELETE" })
      if (res.ok) {
        setAppointments(appointments.filter(a => a.id !== aptId))
      }
    } catch (error) {
      console.error("Failed to delete appointment:", error)
    } finally {
      setDeleting(null)
    }
  }

  if (status === "loading" || !session) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  // Group appointments by day
  const appointmentsByDay: Record<string, Appointment[]> = {}
  appointments.forEach(apt => {
    const dayKey = format(new Date(apt.dateTime), "yyyy-MM-dd")
    if (!appointmentsByDay[dayKey]) {
      appointmentsByDay[dayKey] = []
    }
    appointmentsByDay[dayKey].push(apt)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <Link
            href="/appointments/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            New Appointment
          </Link>
        </div>

        {/* Week Navigation */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={previousWeek}
              className="px-3 py-1 border rounded hover:bg-gray-50"
            >
              &larr; Previous
            </button>
            <div className="flex items-center gap-4">
              <span className="font-medium">
                {format(weekStart, "MMM d")} - {format(endOfWeek(weekStart, { weekStartsOn: 0 }), "MMM d, yyyy")}
              </span>
              <button
                onClick={thisWeek}
                className="px-3 py-1 text-sm text-blue-600 hover:underline"
              >
                Today
              </button>
            </div>
            <button
              onClick={nextWeek}
              className="px-3 py-1 border rounded hover:bg-gray-50"
            >
              Next &rarr;
            </button>
          </div>
        </div>

        {/* Appointments List */}
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : appointments.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No appointments this week.{" "}
            <Link href="/appointments/new" className="text-blue-600 hover:underline">
              Schedule one
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(appointmentsByDay)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, dayAppointments]) => (
                <div key={day} className="bg-white rounded-lg shadow">
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <h3 className="font-medium">
                      {format(new Date(day), "EEEE, MMMM d")}
                    </h3>
                  </div>
                  <div className="divide-y">
                    {dayAppointments.map(apt => (
                      <div
                        key={apt.id}
                        className="p-4 hover:bg-gray-50"
                      >
                        <div className="flex justify-between items-start">
                          <div
                            className="flex-1 cursor-pointer"
                            onClick={() => router.push(`/leads/${apt.leadRelation.id}`)}
                          >
                            <div className="font-medium">{apt.leadRelation.name}</div>
                            <div className="text-sm text-gray-500">
                              {format(new Date(apt.dateTime), "h:mm a")} ({apt.duration} min)
                            </div>
                            {apt.location && (
                              <div className="text-sm text-gray-500">{apt.location}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-sm text-gray-500">
                              {apt.leadRelation.phone || apt.leadRelation.email}
                            </div>
                            {apt.leadRelation.phone && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setTextModal({
                                    isOpen: true,
                                    leadId: apt.leadRelation.id,
                                    leadName: apt.leadRelation.name,
                                    leadPhone: apt.leadRelation.phone!,
                                    date: format(new Date(apt.dateTime), "MMMM d, yyyy"),
                                    time: format(new Date(apt.dateTime), "h:mm a"),
                                  })
                                }}
                                className="text-purple-600 hover:text-purple-800 text-sm"
                              >
                                Text
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/appointments/${apt.id}/edit`)
                              }}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Edit
                            </button>
                            <button
                              onClick={(e) => handleDelete(apt.id, e)}
                              disabled={deleting === apt.id}
                              className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                            >
                              {deleting === apt.id ? "..." : "Delete"}
                            </button>
                          </div>
                        </div>
                        {apt.notes && (
                          <div className="mt-2 text-sm text-gray-600">{apt.notes}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </main>

      {textModal && (
        <TextModal
          isOpen={textModal.isOpen}
          onClose={() => setTextModal(null)}
          leadId={textModal.leadId}
          leadName={textModal.leadName}
          leadPhone={textModal.leadPhone}
          appointmentDate={textModal.date}
          appointmentTime={textModal.time}
        />
      )}
    </div>
  )
}
