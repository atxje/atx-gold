"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { BUSINESS } from "@/lib/business"
import { format } from "date-fns"

interface InvoiceItem {
  id: string
  description: string
  weight: number
  weightUnit: string
  pricePerUnit: number
  totalPrice: number
  costBasis: number
  profit: number
  inventoryItem: { id: string; name: string }
}

interface Invoice {
  id: string
  invoiceNumber: string
  buyerName: string
  buyerEmail: string | null
  buyerPhone: string | null
  buyerAddress: string | null
  date: string
  totalAmount: number
  notes: string | null
  items: InvoiceItem[]
}

const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

export default function InvoicePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editAddress, setEditAddress] = useState("")
  const [editDate, setEditDate] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editItems, setEditItems] = useState<{ id: string; description: string; pricePerUnit: string; totalPrice: string; lastEdited: "pricePerUnit" | "totalPrice" }[]>([])
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([])
  const [hideCost, setHideCost] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session && id) {
      fetch(`/api/invoices/${id}`).then(r => r.json()).then(data => {
        setInvoice(data)
        setLoading(false)
      })
    }
  }, [session, id])

  function startEdit() {
    if (!invoice) return
    setEditName(invoice.buyerName)
    setEditEmail(invoice.buyerEmail || "")
    setEditPhone(invoice.buyerPhone || "")
    setEditAddress(invoice.buyerAddress || "")
    setEditDate(new Date(invoice.date).toISOString().split("T")[0])
    setEditNotes(invoice.notes || "")
    setEditItems(invoice.items.map(i => ({
      id: i.id, description: i.description,
      pricePerUnit: i.pricePerUnit.toString(), totalPrice: i.totalPrice.toString(),
      lastEdited: "totalPrice" as const,
    })))
    setRemovedItemIds([])
    setEditMode(true)
  }

  function removeEditItem(itemId: string) {
    setEditItems(prev => prev.filter(i => i.id !== itemId))
    setRemovedItemIds(prev => [...prev, itemId])
  }

  function updateEditItem(id: string, field: "description" | "pricePerUnit" | "totalPrice", value: string) {
    setEditItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }
      const invoiceItem = invoice?.items.find(i => i.id === id)
      const w = invoiceItem?.weight || 0
      if (field === "pricePerUnit") {
        updated.lastEdited = "pricePerUnit"
        const ppu = parseFloat(value) || 0
        if (w > 0 && ppu > 0) updated.totalPrice = (ppu * w).toFixed(2)
      } else if (field === "totalPrice") {
        updated.lastEdited = "totalPrice"
        const total = parseFloat(value) || 0
        if (w > 0 && total > 0) updated.pricePerUnit = (total / w).toFixed(4)
      }
      return updated
    }))
  }

  async function saveEdit() {
    if (!invoice) return
    setSaving(true)
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: editName, buyerEmail: editEmail, buyerPhone: editPhone,
          buyerAddress: editAddress, date: editDate, notes: editNotes,
          items: editItems.map(i => ({ id: i.id, description: i.description, pricePerUnit: parseFloat(i.pricePerUnit) || 0, totalPrice: parseFloat(i.totalPrice) || 0 })),
          removeItemIds: removedItemIds.length ? removedItemIds : undefined,
        }),
      })
      if (!res.ok) { alert("Failed to save"); return }
      const data = await res.json()
      if (data.deleted) { router.push("/documents"); return }
      setInvoice(data)
      setEditMode(false)
    } finally {
      setSaving(false)
    }
  }

  async function cancelInvoice() {
    if (!confirm(`Cancel invoice ${invoice?.invoiceNumber}? This will reverse all inventory changes.`)) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" })
      if (!res.ok) { alert("Failed to cancel invoice"); return }
      router.push("/documents")
    } finally {
      setCancelling(false)
    }
  }

  if (status === "loading" || !session || loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (!invoice) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Invoice not found.</div>
  }

  const editTotal = editItems.reduce((s, i) => s + (parseFloat(i.totalPrice) || 0), 0)

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
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <>
                <button onClick={cancelInvoice} disabled={cancelling}
                  className="px-4 py-2 border border-red-300 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                  {cancelling ? "Cancelling…" : "Cancel Invoice"}
                </button>
                <button onClick={() => router.push(`/documents/invoices/new?editId=${id}`)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Edit
                </button>
                <button onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
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
            <h2 className="text-3xl font-bold text-gray-800">INVOICE</h2>
            <p className="text-lg font-semibold text-blue-600 mt-1">{invoice.invoiceNumber}</p>
            {editMode ? (
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                className="mt-1 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-blue-500 print:hidden" />
            ) : (
              <p className="text-sm text-gray-500 mt-1">{format(new Date(invoice.date), "MMMM d, yyyy")}</p>
            )}
          </div>
        </div>

        <hr className="border-gray-300 mb-6" />

        {/* Bill To */}
        <div className="mb-8">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Bill To</h3>
          {editMode ? (
            <div className="grid grid-cols-2 gap-3 print:hidden">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} required
                  className="block w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                  className="block w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input value={editEmail} onChange={e => setEditEmail(e.target.value)}
                  className="block w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input value={editAddress} onChange={e => setEditAddress(e.target.value)}
                  className="block w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-blue-500" />
              </div>
            </div>
          ) : (
            <>
              <p className="font-semibold text-gray-900">{invoice.buyerName}</p>
              {invoice.buyerAddress && <p className="text-sm text-gray-600">{invoice.buyerAddress}</p>}
              {invoice.buyerPhone && <p className="text-sm text-gray-600">{invoice.buyerPhone}</p>}
              {invoice.buyerEmail && <p className="text-sm text-gray-600">{invoice.buyerEmail}</p>}
            </>
          )}
        </div>

        {/* Items Table */}
        {editMode && editItems.length === 0 && (
          <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 print:hidden">
            All rows removed — saving will cancel this invoice.
          </div>
        )}
        <table className="w-full mb-8">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="text-left py-2 text-sm font-semibold text-gray-700">Description</th>
              <th className="text-right py-2 text-sm font-semibold text-gray-700">Weight</th>
              <th className="text-right py-2 text-sm font-semibold text-gray-700">Price/Unit</th>
              <th className="text-right py-2 text-sm font-semibold text-gray-700">Amount</th>
              {!hideCost && !editMode && (
                <>
                  <th className="print:hidden text-right py-2 text-sm font-semibold text-gray-700">Cost/Unit</th>
                  <th className="print:hidden text-right py-2 text-sm font-semibold text-gray-700">Total Cost</th>
                </>
              )}
              {editMode && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {(editMode ? invoice.items.filter(item => editItems.find(e => e.id === item.id)) : invoice.items).map(item => {
              const unit = unitLabels[item.weightUnit] || "g"
              const ei = editItems.find(e => e.id === item.id)
              return (
                <tr key={item.id} className="border-b border-gray-100 group">
                  <td className="py-3 text-sm text-gray-800">
                    {editMode && ei ? (
                      <input value={ei.description} onChange={e => updateEditItem(item.id, "description", e.target.value)}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-blue-500" />
                    ) : item.description}
                  </td>
                  <td className="py-3 text-sm text-gray-600 text-right">{item.weight.toFixed(3)} {unit}</td>
                  <td className="py-3 text-sm text-gray-600 text-right">
                    {editMode && ei ? (
                      <div className="flex items-center justify-end gap-0.5">
                        <span className="text-gray-400">$</span>
                        <input type="number" step="0.0001" value={ei.pricePerUnit}
                          onChange={e => updateEditItem(item.id, "pricePerUnit", e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-blue-500" />
                        <span className="text-gray-400 text-xs">/{unit}</span>
                      </div>
                    ) : `$${item.pricePerUnit.toFixed(2)}/${unit}`}
                  </td>
                  <td className="py-3 text-sm font-semibold text-gray-800 text-right">
                    {editMode && ei ? (
                      <div className="flex items-center justify-end gap-0.5">
                        <span className="text-gray-400">$</span>
                        <input type="number" step="0.01" value={ei.totalPrice}
                          onChange={e => updateEditItem(item.id, "totalPrice", e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right font-semibold focus:outline-none focus:ring-blue-500" />
                      </div>
                    ) : `$${item.totalPrice.toFixed(2)}`}
                  </td>
                  {!hideCost && !editMode && (
                    <>
                      <td className="print:hidden py-3 text-sm text-gray-500 text-right">
                        ${(item.weight > 0 ? item.costBasis / item.weight : 0).toFixed(2)}/{unit}
                      </td>
                      <td className="print:hidden py-3 text-sm text-gray-500 text-right">
                        ${item.costBasis.toFixed(2)}
                      </td>
                    </>
                  )}
                  {editMode && (
                    <td className="py-3 text-center">
                      <button type="button" onClick={() => removeEditItem(item.id)}
                        className="text-gray-300 hover:text-red-500 text-lg leading-none print:hidden">
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={editMode ? 4 : (!hideCost ? 5 : 3)} className="pt-4 text-right font-bold text-gray-900">Total</td>
              <td className="pt-4 text-right font-bold text-xl text-green-600">
                ${(editMode ? editTotal : invoice.totalAmount).toFixed(2)}
              </td>
              {editMode && <td />}
            </tr>
            {!hideCost && !editMode && (
              <>
                <tr className="print:hidden">
                  <td colSpan={5} className="pt-1 text-right text-sm text-gray-500">Total Cost</td>
                  <td className="pt-1 text-right text-sm text-gray-500">
                    ${invoice.items.reduce((s, i) => s + i.costBasis, 0).toFixed(2)}
                  </td>
                </tr>
                <tr className="print:hidden">
                  <td colSpan={5} className="pt-1 text-right text-sm font-semibold text-gray-700">Total Profit</td>
                  <td className="pt-1 text-right text-sm font-semibold text-gray-700">
                    ${invoice.items.reduce((s, i) => s + i.profit, 0).toFixed(2)}
                  </td>
                </tr>
              </>
            )}
          </tfoot>
        </table>

        {!editMode && (
          <div className="print:hidden mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
              <input type="checkbox" checked={hideCost} onChange={e => setHideCost(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              Hide cost and profit
            </label>
          </div>
        )}

        {(invoice.notes || editMode) && (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</h3>
            {editMode ? (
              <textarea rows={2} value={editNotes} onChange={e => setEditNotes(e.target.value)}
                className="block w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-blue-500 print:hidden" />
            ) : (
              <p className="text-sm text-gray-600">{invoice.notes}</p>
            )}
          </div>
        )}

        <div className="mt-12 pt-8 border-t border-gray-200 text-center text-xs text-gray-400">
          {BUSINESS.name} · {BUSINESS.address}, {BUSINESS.city} · {BUSINESS.phone}
        </div>
      </div>

      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </>
  )
}
