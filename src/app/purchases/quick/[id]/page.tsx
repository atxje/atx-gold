"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { BillOfSale } from "@/components/bill-of-sale"
import { PrintOnArrival } from "@/components/print-on-arrival"
import { formatPurchaseDate } from "@/lib/purchase-date"

interface TicketLine {
  categoryId: string | null; category: string; type: string | null
  quantity?: number | null; weight: number | null; weightUnit: string; description: string | null
}
interface Ticket {
  id: string
  purchaseNumber: string
  purchaseDate: string
  createdAt: string
  status: "OPEN" | "COMPLETED"
  lines: TicketLine[]
  categoryTotals: { category: string; amount: number }[]
  total: number
  paymentMethod: string | null
  notes: string | null
  lead: { id: string; name: string; phone: string | null; email: string | null; address: string | null; idNumber: string | null }
  user: { name: string | null } | null
  purchaseId: string | null
}

const UNIT: Record<string, string> = { GRAM: "g", TROY_OZ: "ozt", CARAT: "ct" }
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })

export default function QuickTicketViewPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { id } = useParams() as { id: string }
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { if (status === "unauthenticated") router.push("/login") }, [status, router])
  useEffect(() => {
    if (!session) return
    fetch(`/api/quick-tickets/${id}`).then(async r => {
      const d = await r.json()
      if (!r.ok) setError(d.error || "Ticket not found")
      else setTicket(d)
    })
  }, [session, id])


  async function remove() {
    if (!ticket || !confirm(`Delete ticket ${ticket.purchaseNumber}? Use this only if the purchase didn't happen.`)) return
    setDeleting(true)
    const r = await fetch(`/api/quick-tickets/${id}`, { method: "DELETE" })
    if (r.ok) router.push("/purchases")
    else { setError((await r.json()).error || "Couldn't delete"); setDeleting(false) }
  }

  if (status === "loading" || !session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  if (error && !ticket) return <div className="min-h-screen flex items-center justify-center text-gray-500">{error}</div>
  if (!ticket) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  let payments: { method: string; amount: number }[] = []
  try { if (ticket.paymentMethod) payments = JSON.parse(ticket.paymentMethod) } catch { /* ignore */ }
  const isAdmin = session.user?.role === "ADMIN"

  return (
    <>
      <PrintOnArrival ready={!!ticket} label="Ticket ready for signature" />
      <BillOfSale
        purchaseNumber={ticket.purchaseNumber}
        purchaseDate={ticket.purchaseDate}
        recordedAt={ticket.createdAt}
        seller={ticket.lead}
        buyerName={ticket.user?.name ?? null}
        lines={ticket.lines.map((l, i) => ({ key: String(i), ...l }))}
        categoryTotals={ticket.categoryTotals}
        payments={payments}
      />

      <div className="print:hidden min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Link href="/purchases" className="text-sm text-gray-500 hover:text-gray-700">&larr; Purchases</Link>
            <div className="flex gap-2">
              {ticket.status === "OPEN" && isAdmin && (
                <button onClick={remove} disabled={deleting}
                  className="px-4 py-2 border border-red-300 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
              <button onClick={() => window.print()}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Print</button>
              {ticket.status === "OPEN" ? (
                <Link href={`/purchases/new?ticketId=${ticket.id}`}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-semibold hover:bg-amber-700">Complete Purchase →</Link>
              ) : ticket.purchaseId ? (
                <Link href={`/purchases/${ticket.purchaseId}`}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-semibold hover:bg-amber-700">View Full Purchase</Link>
              ) : null}
            </div>
          </div>
          {error && <div className="mb-4 bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-xs font-semibold uppercase text-gray-400">Quick Ticket</div>
                <div className="text-2xl font-bold text-amber-600">{ticket.purchaseNumber}</div>
                <div className="text-sm text-gray-500">{formatPurchaseDate(ticket.purchaseDate, "MMMM d, yyyy")}</div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${ticket.status === "OPEN" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                {ticket.status === "OPEN" ? "To finish" : "Completed"}
              </span>
            </div>

            <div className="mb-4 text-sm">
              <div className="font-semibold text-gray-900">{ticket.lead.name}</div>
              <div className="text-gray-600">{[ticket.lead.phone, ticket.lead.email].filter(Boolean).join(" · ")}</div>
              <div className="text-gray-600">{ticket.lead.address}</div>
              {ticket.lead.idNumber && <div className="text-gray-600">DL / ID # {ticket.lead.idNumber}</div>}
            </div>

            {ticket.categoryTotals.map(t => (
              <div key={t.category} className="mb-3">
                <div className="flex justify-between font-semibold text-gray-900 border-b border-gray-200 pb-1">
                  <span>{t.category}</span><span>{money(t.amount)}</span>
                </div>
                {ticket.lines.filter(l => l.category === t.category).map((l, i) => (
                  <div key={i} className="flex justify-between text-sm text-gray-600 py-0.5">
                    <span>{[l.type, l.description].filter(Boolean).join(" — ") || "—"}{l.quantity ? ` ×${l.quantity}` : ""}</span>
                    <span>{l.weight ? `${l.weight} ${UNIT[l.weightUnit] || "g"}` : ""}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="flex justify-between pt-3 border-t-2 border-gray-300 text-lg font-bold">
              <span>Total paid</span><span className="text-amber-600">{money(ticket.total)}</span>
            </div>
            {payments.length > 0 && (
              <div className="mt-2 text-sm text-gray-600">{payments.map(p => `${p.method} ${money(p.amount)}`).join(" · ")}</div>
            )}
            {ticket.notes && <div className="mt-3 text-sm text-gray-600">Notes: {ticket.notes}</div>}
          </div>
        </main>
      </div>

      <style>{`
        @page { size: letter; margin: 0.5in; }
        @media print { body { -webkit-print-color-adjust: exact; background: white; } }
      `}</style>
    </>
  )
}
