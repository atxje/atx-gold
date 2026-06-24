"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter, useParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { BUSINESS } from "@/lib/business"
import { arrowNav } from "@/lib/table-nav"
import { format } from "date-fns"

interface PurchaseItem {
  id: string
  description: string
  quantity: number
  weight: number
  weightUnit: string
  pricePaid: number
  pricePerUnit: number | null
  grossProfit: number | null
  comp: number | null
  inventoryItem: { id: string; name: string; itemCode: string | null } | null
}

interface Purchase {
  id: string
  purchaseNumber: string | null
  purchaseDate: string
  notes: string | null
  paymentMethod: string | null
  lead: { id: string; name: string; phone: string | null; email: string | null }
  items: PurchaseItem[]
}

interface EditItem {
  id: string
  description: string
  quantity: string
  weight: string
  pricePerUnit: string
  pricePaid: string
  weightUnit: string
  lastEdited: "pricePerUnit" | "pricePaid"
}

const PAYMENT_METHODS = ["Cash", "Check", "Zelle / Venmo", "Bank Transfer"]
const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

const paymentColors: Record<string, string> = {
  "Cash": "bg-green-100 text-green-800",
  "Check": "bg-blue-100 text-blue-800",
  "Zelle / Venmo": "bg-purple-100 text-purple-800",
  "Bank Transfer": "bg-gray-100 text-gray-700",
}

export default function PurchaseDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [purchase, setPurchase] = useState<Purchase | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Edit state
  const [editDate, setEditDate] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editPayments, setEditPayments] = useState<{ method: string; amount: string }[]>([])
  const [editItems, setEditItems] = useState<EditItem[]>([])

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session && id) {
      fetch(`/api/purchases/${id}`)
        .then(r => r.json())
        .then(data => { setPurchase(data); setLoading(false) })
    }
  }, [session, id])

  function startEdit() {
    if (!purchase) return
    setEditDate(new Date(purchase.purchaseDate).toISOString().split("T")[0])
    setEditNotes(purchase.notes || "")
    let payments: { method: string; amount: number }[] = []
    try { if (purchase.paymentMethod) payments = JSON.parse(purchase.paymentMethod) } catch {}
    setEditPayments(payments.map(p => ({ method: p.method, amount: p.amount.toString() })))
    setEditItems(purchase.items.map(i => ({
      id: i.id,
      description: i.description,
      quantity: (i.quantity ?? 0).toString(),
      weight: i.weight.toString(),
      pricePerUnit: (i.pricePerUnit ?? (i.weight > 0 ? i.pricePaid / i.weight : 0)).toFixed(4),
      pricePaid: i.pricePaid.toString(),
      weightUnit: i.weightUnit,
      lastEdited: "pricePaid",
    })))
    setEditMode(true)
  }

  function updateEditItem(itemId: string, field: "description" | "quantity" | "weight" | "pricePerUnit" | "pricePaid", value: string) {
    setEditItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      const updated = { ...item, [field]: value }
      const w = parseFloat(field === "weight" ? value : item.weight) || 0
      if (field === "pricePerUnit") {
        updated.lastEdited = "pricePerUnit"
        const ppu = parseFloat(value) || 0
        if (w > 0 && ppu > 0) updated.pricePaid = (ppu * w).toFixed(2)
      } else if (field === "pricePaid") {
        updated.lastEdited = "pricePaid"
        const total = parseFloat(value) || 0
        if (w > 0 && total > 0) updated.pricePerUnit = (total / w).toFixed(4)
      } else if (field === "weight") {
        const wNew = parseFloat(value) || 0
        if (item.lastEdited === "pricePerUnit") {
          const ppu = parseFloat(item.pricePerUnit) || 0
          if (wNew > 0 && ppu > 0) updated.pricePaid = (ppu * wNew).toFixed(2)
        } else {
          const total = parseFloat(item.pricePaid) || 0
          if (wNew > 0 && total > 0) updated.pricePerUnit = (total / wNew).toFixed(4)
        }
      }
      return updated
    }))
  }

  function togglePayment(method: string) {
    setEditPayments(prev => {
      if (prev.find(p => p.method === method)) return prev.filter(p => p.method !== method)
      return [...prev, { method, amount: "" }]
    })
  }

  function updatePaymentAmount(method: string, amount: string) {
    setEditPayments(prev => prev.map(p => p.method === method ? { ...p, amount } : p))
  }

  async function saveEdit() {
    if (!purchase) return
    setSaving(true)
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseDate: editDate,
          notes: editNotes || null,
          paymentMethod: editPayments
            .filter(p => p.method)
            .map(p => ({ method: p.method, amount: parseFloat(p.amount) || 0 })),
          items: editItems.map(i => ({
            id: i.id,
            description: i.description,
            quantity: parseInt(i.quantity) || 0,
            weight: parseFloat(i.weight) || 0,
            pricePerUnit: parseFloat(i.pricePerUnit) || null,
            pricePaid: parseFloat(i.pricePaid) || 0,
          })),
        }),
      })
      if (!res.ok) { alert("Failed to save"); return }
      setPurchase(await res.json())
      setEditMode(false)
    } finally {
      setSaving(false)
    }
  }

  if (status === "loading" || !session || loading)
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  if (!purchase)
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Purchase not found.</div>

  const grandTotal = editMode
    ? editItems.reduce((s, i) => s + (parseFloat(i.pricePaid) || 0), 0)
    : purchase.items.reduce((s, i) => s + i.pricePaid, 0)

  let payments: { method: string; amount: number }[] = []
  try { if (purchase.paymentMethod) payments = JSON.parse(purchase.paymentMethod) } catch {}

  const inputCls = "w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
  const numCls = inputCls + " text-right"

  return (
    <>
      <div className="print:hidden">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/documents" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to Documents</Link>
          <div className="flex gap-3">
            {editMode ? (
              <>
                <button onClick={() => setEditMode(false)} disabled={saving}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={saving}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <>
                {session?.user?.role === "ADMIN" || !session?.user?.role ? (
                  <button onClick={() => router.push(`/purchases/new?editId=${id}`)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Edit
                  </button>
                ) : null}
                <button onClick={() => window.print()}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700">
                  Print / Save PDF
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-8 bg-white print:shadow-none print:max-w-none print:px-12 print:py-10">

        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{BUSINESS.name}</h1>
            <p className="text-sm text-gray-500 mt-1">{BUSINESS.address}</p>
            <p className="text-sm text-gray-500">{BUSINESS.city}</p>
            <p className="text-sm text-gray-500">{BUSINESS.phone}</p>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-bold text-gray-800">PURCHASE</h2>
            <p className="text-lg font-semibold text-amber-600 mt-1">{purchase.purchaseNumber || "—"}</p>
            {editMode ? (
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                className="mt-1 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-amber-400 print:hidden" />
            ) : (
              <p className="text-sm text-gray-500 mt-1">{format(new Date(purchase.purchaseDate), "MMMM d, yyyy")}</p>
            )}
          </div>
        </div>

        <hr className="border-gray-300 mb-6" />

        {/* Purchased From */}
        <div className="mb-8">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Purchased From</h3>
          <p className="font-semibold text-gray-900">{purchase.lead.name}</p>
          {purchase.lead.phone && <p className="text-sm text-gray-600">{purchase.lead.phone}</p>}
          {purchase.lead.email && <p className="text-sm text-gray-600">{purchase.lead.email}</p>}
        </div>

        {/* Items Table */}
        <table className="w-full mb-8">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="text-left py-2 text-sm font-semibold text-gray-700">Code</th>
              <th className="text-left py-2 text-sm font-semibold text-gray-700">Description</th>
              <th className="text-right py-2 text-sm font-semibold text-gray-700">Qty</th>
              <th className="text-right py-2 text-sm font-semibold text-gray-700">Weight</th>
              <th className="text-right py-2 text-sm font-semibold text-gray-700">Price / Unit</th>
              <th className="text-right py-2 text-sm font-semibold text-gray-700">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(editMode ? editItems : purchase.items).map((row) => {
              if (editMode) {
                const item = row as EditItem
                const unit = unitLabels[item.weightUnit] || "g"
                return (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2 text-xs font-mono text-amber-600 font-semibold">
                      {(() => { const pi = purchase?.items.find(p => p.id === item.id); return pi?.inventoryItem?.itemCode || "—" })()}
                    </td>
                    <td className="py-2">
                      <input value={item.description} onChange={e => updateEditItem(item.id, "description", e.target.value)}
                        onKeyDown={arrowNav} className={inputCls} />
                    </td>
                    <td className="py-2 pl-2">
                      <input type="number" step="1" min="0" value={item.quantity}
                        onChange={e => updateEditItem(item.id, "quantity", e.target.value)}
                        onKeyDown={arrowNav} className={numCls + " w-16"} />
                    </td>
                    <td className="py-2 pl-2">
                      <div className="flex items-center justify-end gap-1">
                        <input type="number" step="0.0001" value={item.weight}
                          onChange={e => updateEditItem(item.id, "weight", e.target.value)}
                          onKeyDown={arrowNav} className={numCls + " w-24"} />
                        <span className="text-xs text-gray-400 whitespace-nowrap">{unit}</span>
                      </div>
                    </td>
                    <td className="py-2 pl-2">
                      <div className="flex items-center justify-end gap-0.5">
                        <span className="text-gray-400 text-sm">$</span>
                        <input type="number" step="0.0001" value={item.pricePerUnit}
                          onChange={e => updateEditItem(item.id, "pricePerUnit", e.target.value)}
                          onKeyDown={arrowNav} className={numCls + " w-24"} />
                        <span className="text-xs text-gray-400">/{unit}</span>
                      </div>
                    </td>
                    <td className="py-2 pl-2">
                      <div className="flex items-center justify-end gap-0.5">
                        <span className="text-gray-400 text-sm">$</span>
                        <input type="number" step="0.01" value={item.pricePaid}
                          onChange={e => updateEditItem(item.id, "pricePaid", e.target.value)}
                          onKeyDown={arrowNav} className={numCls + " w-24 font-semibold"} />
                      </div>
                    </td>
                  </tr>
                )
              } else {
                const item = row as PurchaseItem
                const unit = unitLabels[item.weightUnit] || "g"
                const ppu = item.pricePerUnit ?? (item.weight > 0 ? item.pricePaid / item.weight : null)
                return (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-3 text-sm font-mono font-semibold text-amber-600">
                      {item.inventoryItem?.itemCode || "—"}
                    </td>
                    <td className="py-3 text-sm text-gray-800">{item.description}</td>
                    <td className="py-3 text-sm text-gray-600 text-right">{item.quantity > 0 ? item.quantity : "—"}</td>
                    <td className="py-3 text-sm text-gray-600 text-right">{item.weight.toFixed(3)} {unit}</td>
                    <td className="py-3 text-sm text-gray-600 text-right">
                      {ppu != null ? `$${ppu.toFixed(4)}/${unit}` : "—"}
                    </td>
                    <td className="py-3 text-sm font-semibold text-gray-800 text-right">
                      ${item.pricePaid.toFixed(2)}
                    </td>
                  </tr>
                )
              }
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="pt-4 text-right font-bold text-gray-900">Total Paid</td>
              <td className="pt-4 text-right font-bold text-xl text-amber-600">
                ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Compensation earned on this transaction — on-screen only, never printed */}
        {!editMode && (() => {
          const totalComp = purchase.items.reduce((s, i) => s + (i.comp || 0), 0)
          const multi = purchase.items.length > 1
          return (
            <div className="mb-8 print:hidden rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-400 uppercase">Compensation earned (internal — not printed)</h3>
                <div className={`text-2xl font-bold ${totalComp > 0 ? "text-green-700" : "text-gray-400"}`}>
                  ${totalComp.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
              </div>
              {multi && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                  {purchase.items.map(i => (
                    <div key={i.id} className="flex justify-between text-xs text-gray-500">
                      <span>{i.inventoryItem?.itemCode ? `${i.inventoryItem.itemCode} · ` : ""}{i.description}</span>
                      <span className={(i.comp || 0) > 0 ? "text-green-700" : "text-gray-400"}>
                        ${(i.comp || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-gray-400">
                10% of monthly gross profit above $50,000 — $0 until that month&apos;s threshold is reached.
              </p>
            </div>
          )
        })()}

        {/* Payment Method */}
        {editMode ? (
          <div className="mb-8 print:hidden">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Payment Method</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {PAYMENT_METHODS.map(method => {
                const active = editPayments.find(p => p.method === method)
                return (
                  <button key={method} type="button" onClick={() => togglePayment(method)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"}`}>
                    {method}
                  </button>
                )
              })}
            </div>
            {editPayments.length > 0 && (
              <div className="space-y-1.5">
                {editPayments.map(p => (
                  <div key={p.method} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-36">{p.method}</span>
                    <div className="flex items-center gap-0.5">
                      <span className="text-gray-400 text-sm">$</span>
                      <input type="number" step="0.01" placeholder="0.00" value={p.amount}
                        onChange={e => updatePaymentAmount(p.method, e.target.value)}
                        className="w-28 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-amber-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : payments.length > 0 ? (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Payment Method</h3>
            <div className="space-y-1.5">
              {payments.map(p => (
                <div key={p.method} className="flex items-center justify-between">
                  <span className={`print:hidden px-2.5 py-0.5 rounded-full text-xs font-medium ${paymentColors[p.method] || "bg-gray-100 text-gray-700"}`}>
                    {p.method}
                  </span>
                  <span className="hidden print:inline text-sm text-gray-700">{p.method}</span>
                  <span className="text-sm font-medium text-gray-900">
                    ${p.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Notes */}
        {editMode ? (
          <div className="mb-8 print:hidden">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</h3>
            <textarea rows={2} value={editNotes} onChange={e => setEditNotes(e.target.value)}
              className="block w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-400" />
          </div>
        ) : purchase.notes ? (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</h3>
            <p className="text-sm text-gray-600">{purchase.notes}</p>
          </div>
        ) : null}

        {/* Signature Lines */}
        <div className="mt-12 grid grid-cols-2 gap-12">
          <div>
            <div className="border-b border-gray-400 mb-2 h-8" />
            <p className="text-xs text-gray-500">Seller Signature</p>
          </div>
          <div>
            <div className="border-b border-gray-400 mb-2 h-8" />
            <p className="text-xs text-gray-500">ID Verified by</p>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
          {BUSINESS.name} · {BUSINESS.address}, {BUSINESS.city} · {BUSINESS.phone}
        </div>
      </div>

      <style>{`
        @media print { body { -webkit-print-color-adjust: exact; } }
      `}</style>
    </>
  )
}
