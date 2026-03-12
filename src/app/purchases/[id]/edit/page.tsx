"use client"

import { useEffect, useState, use } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { format } from "date-fns"

interface Purchase {
  id: string
  description: string
  metalType: string
  weight: number
  purity: string | null
  pricePaid: number
  purchaseDate: string
  notes: string | null
  lead: {
    id: string
    name: string
  }
}

const metalTypes = ["GOLD", "SILVER", "PLATINUM", "PALLADIUM", "OTHER"]

export default function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session, status } = useSession()
  const router = useRouter()
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (session && id) {
      fetchPurchase()
    }
  }, [session, id])

  async function fetchPurchase() {
    try {
      const res = await fetch(`/api/purchases/${id}`)
      if (res.ok) {
        const data = await res.json()
        setPurchase(data)
      } else {
        setError("Purchase not found")
      }
    } catch {
      setError("Failed to load purchase")
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setSaving(true)

    const formData = new FormData(e.currentTarget)

    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: formData.get("description"),
          metalType: formData.get("metalType"),
          weight: formData.get("weight"),
          purity: formData.get("purity") || null,
          pricePaid: formData.get("pricePaid"),
          purchaseDate: formData.get("purchaseDate"),
          notes: formData.get("notes") || null,
        }),
      })

      if (!res.ok) {
        throw new Error("Failed to update purchase")
      }

      router.push("/purchases")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  if (status === "loading" || loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (!purchase) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            {error || "Purchase not found"}
          </div>
        </main>
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
          <h1 className="text-2xl font-bold text-gray-900">Edit Purchase</h1>
          <p className="text-gray-600">from {purchase.lead.name}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-500 p-3 rounded text-sm">{error}</div>
            )}

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description *
              </label>
              <input
                id="description"
                name="description"
                type="text"
                required
                defaultValue={purchase.description}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="metalType" className="block text-sm font-medium text-gray-700">
                  Metal Type *
                </label>
                <select
                  id="metalType"
                  name="metalType"
                  required
                  defaultValue={purchase.metalType}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {metalTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0) + type.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="purity" className="block text-sm font-medium text-gray-700">
                  Purity
                </label>
                <input
                  id="purity"
                  name="purity"
                  type="text"
                  defaultValue={purchase.purity || ""}
                  placeholder="e.g., 14K, Sterling"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="weight" className="block text-sm font-medium text-gray-700">
                  Weight (grams) *
                </label>
                <input
                  id="weight"
                  name="weight"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={purchase.weight}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="pricePaid" className="block text-sm font-medium text-gray-700">
                  Price Paid ($) *
                </label>
                <input
                  id="pricePaid"
                  name="pricePaid"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={purchase.pricePaid}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="purchaseDate" className="block text-sm font-medium text-gray-700">
                Purchase Date *
              </label>
              <input
                id="purchaseDate"
                name="purchaseDate"
                type="date"
                required
                defaultValue={format(new Date(purchase.purchaseDate), "yyyy-MM-dd")}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={purchase.notes || ""}
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
                disabled={saving}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
