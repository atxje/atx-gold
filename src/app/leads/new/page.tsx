"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Navbar } from "@/components/navbar"
import { LeadForm } from "@/components/lead-form"

export default function NewLeadPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  if (status === "loading" || !session) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
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
          <h1 className="text-2xl font-bold text-gray-900">Add New Lead</h1>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <LeadForm />
        </div>
      </main>
    </div>
  )
}
