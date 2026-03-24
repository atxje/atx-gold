"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { format } from "date-fns"

interface Invoice {
  id: string
  invoiceNumber: string
  buyerName: string
  date: string
  totalAmount: number
  items: { id: string }[]
}

interface Memo {
  id: string
  memoNumber: string
  customerName: string
  memoDate: string
  returnDate: string
  status: "ACTIVE" | "RETURNED" | "CONVERTED"
  totalValue: number
  items: { id: string }[]
}

interface Purchase {
  id: string
  purchaseNumber: string | null
  description: string
  metalType: string
  weight: number
  weightUnit: string
  pricePaid: number
  purchaseDate: string
  lead: { id: string; name: string }
}

type Tab = "invoices" | "transfers" | "memos" | "purchases"

const memoStatusColors: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-800",
  RETURNED: "bg-gray-100 text-gray-600",
  CONVERTED: "bg-green-100 text-green-800",
}

export default function DocumentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("invoices")
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [transfers, setTransfers] = useState<Invoice[]>([])
  const [memos, setMemos] = useState<Memo[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (!session) return
    setLoading(true)
    Promise.all([
      fetch("/api/invoices?type=SALE").then(r => r.ok ? r.json() : []),
      fetch("/api/invoices?type=TRANSFER").then(r => r.ok ? r.json() : []),
      fetch("/api/memos").then(r => r.ok ? r.json() : []),
      fetch("/api/purchases").then(r => r.ok ? r.json() : []),
    ]).then(([inv, trn, mem, pur]) => {
      setInvoices(Array.isArray(inv) ? inv : [])
      setTransfers(Array.isArray(trn) ? trn : [])
      setMemos(Array.isArray(mem) ? mem : [])
      setPurchases(Array.isArray(pur) ? pur : [])
      setLoading(false)
    })
  }, [session])

  if (status === "loading" || !session) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Stock Documents</h1>
          <div className="flex gap-3">
            <Link href="/purchases/new"
              className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700">
              + New Purchase
            </Link>
            <Link href="/documents/invoices/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
              + New Invoice
            </Link>
            <Link href="/documents/memos/new"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700">
              + New Memo
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-6">
            {(["invoices", "transfers", "memos", "purchases"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                  tab === t
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </nav>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : (
          <>
            {/* Invoices Tab */}
            {tab === "invoices" && (
              invoices.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                  No invoices yet.{" "}
                  <Link href="/documents/invoices/new" className="text-blue-600 hover:underline">Create your first invoice</Link>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buyer</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {invoices.map(inv => (
                        <tr key={inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/documents/invoices/${inv.id}`)}>
                          <td className="px-6 py-4 text-sm font-semibold text-blue-600">{inv.invoiceNumber}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{format(new Date(inv.date), "MMM d, yyyy")}</td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{inv.buyerName}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 text-right">{inv.items.length}</td>
                          <td className="px-6 py-4 text-sm font-bold text-green-600 text-right">${inv.totalAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Transfers Tab */}
            {tab === "transfers" && (
              transfers.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                  No transfers yet.{" "}
                  <Link href="/documents/invoices/new?type=transfer" className="text-purple-600 hover:underline">Create your first transfer</Link>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transfer #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {transfers.map(trn => (
                        <tr key={trn.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/documents/invoices/${trn.id}`)}>
                          <td className="px-6 py-4 text-sm font-semibold text-purple-600">{trn.invoiceNumber}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{format(new Date(trn.date), "MMM d, yyyy")}</td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{trn.buyerName}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 text-right">{trn.items.length}</td>
                          <td className="px-6 py-4 text-sm font-bold text-purple-600 text-right">${trn.totalAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Memos Tab */}
            {tab === "memos" && (
              memos.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                  No memos yet.{" "}
                  <Link href="/documents/memos/new" className="text-blue-600 hover:underline">Create your first memo</Link>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Memo #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Return By</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {memos.map(memo => (
                        <tr key={memo.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/documents/memos/${memo.id}`)}>
                          <td className="px-6 py-4 text-sm font-semibold text-blue-600">{memo.memoNumber}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{format(new Date(memo.memoDate), "MMM d, yyyy")}</td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{memo.customerName}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{format(new Date(memo.returnDate), "MMM d, yyyy")}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 text-right">{memo.items.length}</td>
                          <td className="px-6 py-4 text-sm font-bold text-blue-600 text-right">${memo.totalValue.toFixed(2)}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${memoStatusColors[memo.status]}`}>
                              {memo.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Purchases Tab */}
            {tab === "purchases" && (
              purchases.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                  No purchases yet.{" "}
                  <Link href="/purchases/new" className="text-blue-600 hover:underline">Record your first purchase</Link>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purchase #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seller</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {(() => {
                        // Group by purchaseNumber; ungrouped (null) get their own row
                        const seen = new Set<string>()
                        const rows: typeof purchases = []
                        for (const p of purchases) {
                          const key = p.purchaseNumber || `${p.lead.id}_${p.purchaseDate.split("T")[0]}`
                          if (!seen.has(key)) {
                            rows.push(p)
                            seen.add(key)
                          }
                        }
                        return rows.map(p => {
                          const key = p.purchaseNumber || `${p.lead.id}_${p.purchaseDate.split("T")[0]}`
                          const group = purchases.filter(x =>
                            (x.purchaseNumber || `${x.lead.id}_${x.purchaseDate.split("T")[0]}`) === key
                          )
                          const total = group.reduce((s, x) => s + x.pricePaid, 0)
                          const desc = group.length > 1
                            ? `${group.length} items`
                            : p.description
                          return (
                            <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/purchases/${p.id}`)}>
                              <td className="px-6 py-4 text-sm font-semibold text-amber-600">{p.purchaseNumber || "—"}</td>
                              <td className="px-6 py-4 text-sm text-gray-500">{format(new Date(p.purchaseDate), "MMM d, yyyy")}</td>
                              <td className="px-6 py-4 text-sm font-medium text-gray-900">{p.lead.name}</td>
                              <td className="px-6 py-4 text-sm text-gray-600">{desc}</td>
                              <td className="px-6 py-4 text-sm font-bold text-amber-600 text-right">${total.toFixed(2)}</td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </main>
    </div>
  )
}
