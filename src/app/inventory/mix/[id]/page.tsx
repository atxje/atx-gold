"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import { Navbar } from "@/components/navbar"
import { PageNav } from "@/components/page-nav"

interface Line {
  id: string
  role: string // "SOURCE" | "DEST"
  weight: number
  quantity: number
  totalCost: number
  inventoryItem: { id: string; name: string; weightUnit: string; itemCode: string | null }
}
interface Transfer {
  id: string
  number: string | null
  createdAt: string
  note: string | null
  reversedAt: string | null
  userName: string | null
  reversedByName: string | null
  items: Line[]
}

const UNIT: Record<string, string> = { GRAM: "g", TROY_OZ: "ozt", CARAT: "ct" }
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })

export default function MixDocumentPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { id } = useParams() as { id: string }
  const [doc, setDoc] = useState<Transfer | null>(null)
  const [error, setError] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [reversing, setReversing] = useState(false)

  useEffect(() => { if (status === "unauthenticated") router.push("/login") }, [status, router])

  const load = useCallback(async () => {
    const r = await fetch(`/api/inventory/mix/${id}`)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setError(d.error || "Transfer not found")
    else setDoc(d)
  }, [id])
  useEffect(() => { if (session) load() }, [session, load])

  async function reverse() {
    setReversing(true); setError("")
    const r = await fetch(`/api/inventory/mix/${id}/reverse`, { method: "POST" })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) setError(d.error || "Couldn't reverse the transfer")
    setConfirming(false); setReversing(false)
    load()
  }

  if (status === "loading" || !session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  if (!doc) return <div className="min-h-screen flex items-center justify-center text-gray-500">{error || "Loading..."}</div>

  const isAdmin = session.user?.role === "ADMIN"
  const sources = doc.items.filter(i => i.role === "SOURCE")
  const dests = doc.items.filter(i => i.role === "DEST")

  const table = (title: string, hint: string, lines: Line[]) => (
    <div className="bg-white rounded-lg shadow overflow-hidden mb-5">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <span className="ml-2 text-xs text-gray-400">{hint}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
              <th className="px-4 py-2 text-left">Item</th>
              <th className="px-4 py-2 text-right">Weight</th>
              <th className="px-4 py-2 text-right">Pieces</th>
              <th className="px-4 py-2 text-right">Cost / unit</th>
              <th className="px-4 py-2 text-right">Cost moved</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map(l => {
              const unit = UNIT[l.inventoryItem.weightUnit] || "g"
              return (
                <tr key={l.id}>
                  <td className="px-4 py-2">
                    <Link href={`/inventory/${l.inventoryItem.id}`} className="font-medium text-blue-600 hover:underline">{l.inventoryItem.name}</Link>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-900">{l.weight.toFixed(3)} {unit}</td>
                  <td className="px-4 py-2 text-right text-gray-900">{l.quantity || "—"}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{l.weight > 0 ? `$${(l.totalCost / l.weight).toFixed(4)}/${unit}` : "—"}</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-900">{money(l.totalCost)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <PageNav back links={[
          { label: "Inventory", href: "/inventory" },
          { label: "Stock Documents", href: "/documents" },
          { label: "+ New Mix / Split", href: "/inventory/mix", primary: true },
        ]} />

        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <div className="text-xs font-semibold uppercase text-gray-400">Mix / Split</div>
            <h1 className="text-2xl font-bold text-gray-900">{doc.number || "Transfer"}</h1>
            <div className="text-sm text-gray-500">
              {format(new Date(doc.createdAt), "MMM d, yyyy h:mm a")}{doc.userName ? ` · by ${doc.userName}` : ""}
            </div>
            {doc.note && <div className="mt-1 text-sm text-gray-700">Note: {doc.note}</div>}
          </div>
          <div className="flex items-center gap-2">
            {doc.reversedAt ? (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-700">
                Reversed {format(new Date(doc.reversedAt), "MMM d, yyyy")}{doc.reversedByName ? ` by ${doc.reversedByName}` : ""}
              </span>
            ) : isAdmin && !confirming ? (
              <button onClick={() => setConfirming(true)}
                className="px-4 py-2 border border-red-300 rounded-md text-sm font-medium text-red-600 hover:bg-red-50">
                Reverse this transfer
              </button>
            ) : null}
          </div>
        </div>

        {error && <div className="mb-4 bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

        {confirming && (
          <div className="mb-5 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-sm text-red-800 font-medium">Undo this transfer?</div>
            <div className="text-sm text-red-700 mt-1">
              The weight, pieces and cost go back to where they came from. The document stays on file, marked as reversed.
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={reverse} disabled={reversing}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {reversing ? "Reversing…" : "Yes, reverse it"}
              </button>
              <button onClick={() => setConfirming(false)}
                className="px-4 py-2 border border-gray-300 bg-white rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className={doc.reversedAt ? "opacity-60" : ""}>
          {table("Moved from", "These went down", sources)}
          {table("Moved into", "This went up", dests)}
        </div>
      </main>
    </div>
  )
}
