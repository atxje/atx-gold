"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { BUSINESS } from "@/lib/business"
import { format } from "date-fns"

interface MemoItem {
  id: string
  description: string
  weight: number
  weightUnit: string
  pricePerUnit: number
  totalValue: number
  status: "ACTIVE" | "RETURNED" | "CONVERTED"
  inventoryItem: { id: string; name: string; totalCost: number; totalWeight: number }
}

interface Memo {
  id: string
  memoNumber: string
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  memoDate: string
  returnDate: string
  status: "ACTIVE" | "RETURNED" | "CONVERTED"
  totalValue: number
  notes: string | null
  items: MemoItem[]
}

const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

const statusColors: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-800",
  RETURNED: "bg-gray-100 text-gray-600",
  CONVERTED: "bg-green-100 text-green-800",
}

export default function MemoPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [memo, setMemo] = useState<Memo | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [itemUpdating, setItemUpdating] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editReturnDate, setEditReturnDate] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editItems, setEditItems] = useState<{ id: string; description: string; pricePerUnit: string; totalValue: string; lastEdited: "pricePerUnit" | "totalValue" }[]>([])
  const [hideCost, setHideCost] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session && id) {
      fetch(`/api/memos/${id}`).then(r => r.json()).then(data => {
        setMemo(data)
        setLoading(false)
      })
    }
  }, [session, id])

  async function markReturned() {
    if (!memo || !confirm("Mark this memo as returned? This will restore inventory availability.")) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/memos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "RETURNED" }),
      })
      if (res.ok) setMemo({ ...memo, status: "RETURNED" })
    } finally {
      setUpdating(false)
    }
  }

  async function handleAction(action: "return" | "convert") {
    if (!memo || selected.size === 0) return
    const ids = Array.from(selected)

    if (action === "return") {
      if (!confirm(`Return ${selected.size} item(s) to inventory?`)) return
      setItemUpdating(true)
      try {
        for (const itemId of ids) {
          const res = await fetch(`/api/memo-items/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "return" }),
          })
          if (!res.ok) { alert("Failed to update one or more items"); return }
        }
        setMemo(prev => {
          if (!prev) return prev
          const updatedItems = prev.items.map(i => ids.includes(i.id) ? { ...i, status: "RETURNED" as MemoItem["status"] } : i)
          const allDone = updatedItems.every(i => i.status !== "ACTIVE")
          const anyConverted = updatedItems.some(i => i.status === "CONVERTED")
          return { ...prev, items: updatedItems, status: allDone ? (anyConverted ? "CONVERTED" : "RETURNED") : prev.status }
        })
        setSelected(new Set())
      } finally {
        setItemUpdating(false)
      }
    } else {
      // Navigate to invoice — conversion happens only when invoice is saved
      const selectedMemoItems = ids.map(id => memo.items.find(i => i.id === id)).filter(Boolean) as MemoItem[]
      const itemsParam = selectedMemoItems.map(i => `${i.inventoryItem.id}:${i.weight}:${i.pricePerUnit}:${i.totalValue}`).join(",")
      const params = new URLSearchParams({ items: itemsParam, memoItems: ids.join(","), buyerName: memo.customerName })
      if (memo.customerPhone) params.set("buyerPhone", memo.customerPhone)
      if (memo.customerEmail) params.set("buyerEmail", memo.customerEmail)
      router.push(`/documents/invoices/new?${params}`)
    }
  }

  function invoiceAll() {
    if (!memo) return
    const activeItems = memo.items.filter(i => i.status === "ACTIVE")
    if (activeItems.length === 0) return
    const itemsParam = activeItems.map(i => `${i.inventoryItem.id}:${i.weight}:${i.pricePerUnit}:${i.totalValue}`).join(",")
    const memoItemIds = activeItems.map(i => i.id).join(",")
    const params = new URLSearchParams({ items: itemsParam, memoItems: memoItemIds, buyerName: memo.customerName })
    if (memo.customerPhone) params.set("buyerPhone", memo.customerPhone)
    if (memo.customerEmail) params.set("buyerEmail", memo.customerEmail)
    router.push(`/documents/invoices/new?${params}`)
  }

  function startEdit() {
    if (!memo) return
    setEditName(memo.customerName)
    setEditPhone(memo.customerPhone || "")
    setEditEmail(memo.customerEmail || "")
    setEditReturnDate(new Date(memo.returnDate).toISOString().split("T")[0])
    setEditNotes(memo.notes || "")
    setEditItems(memo.items.map(i => ({
      id: i.id, description: i.description,
      pricePerUnit: i.pricePerUnit.toString(), totalValue: i.totalValue.toString(),
      lastEdited: "totalValue" as const,
    })))
    setEditMode(true)
  }

  function updateEditItem(id: string, field: "description" | "pricePerUnit" | "totalValue", value: string) {
    setEditItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }
      const memoItem = memo?.items.find(i => i.id === id)
      const w = memoItem?.weight || 0
      if (field === "pricePerUnit") {
        updated.lastEdited = "pricePerUnit"
        const ppu = parseFloat(value) || 0
        if (w > 0 && ppu > 0) updated.totalValue = (ppu * w).toFixed(2)
      } else if (field === "totalValue") {
        updated.lastEdited = "totalValue"
        const total = parseFloat(value) || 0
        if (w > 0 && total > 0) updated.pricePerUnit = (total / w).toFixed(4)
      }
      return updated
    }))
  }

  async function saveEdit() {
    if (!memo) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/memos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: editName, customerEmail: editEmail, customerPhone: editPhone,
          returnDate: editReturnDate, notes: editNotes,
          items: editItems.map(i => ({ id: i.id, description: i.description, pricePerUnit: parseFloat(i.pricePerUnit) || 0, totalValue: parseFloat(i.totalValue) || 0 })),
        }),
      })
      if (!res.ok) { alert("Failed to save"); return }
      const updated = await res.json()
      setMemo(updated)
      setEditMode(false)
    } finally {
      setUpdating(false)
    }
  }

  if (status === "loading" || !session || loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (!memo) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Memo not found.</div>
  }

  return (
    <>
      {/* Print-hidden nav and actions */}
      <div className="print:hidden">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/documents" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back to Documents</Link>
          <div className="flex gap-3">
            {editMode ? (
              <>
                <button onClick={() => setEditMode(false)} disabled={updating}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={updating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {updating ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <>
                {memo.status === "ACTIVE" && selected.size > 0 && (
                  <>
                    <button onClick={() => handleAction("return")} disabled={itemUpdating}
                      className="px-4 py-2 bg-amber-500 text-white rounded-md text-sm font-medium hover:bg-amber-600 disabled:opacity-50">
                      {itemUpdating ? "…" : `Return (${selected.size})`}
                    </button>
                    <button onClick={() => handleAction("convert")} disabled={itemUpdating}
                      className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                      {itemUpdating ? "…" : `Invoice (${selected.size})`}
                    </button>
                  </>
                )}
                {memo.status === "ACTIVE" && selected.size === 0 && (
                  <>
                    <button onClick={markReturned} disabled={updating}
                      className="px-4 py-2 bg-amber-500 text-white rounded-md text-sm font-medium hover:bg-amber-600 disabled:opacity-50">
                      {updating ? "…" : "Return All"}
                    </button>
                    <button onClick={invoiceAll}
                      className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700">
                      Invoice All
                    </button>
                  </>
                )}
                <button onClick={() => router.push(`/documents/memos/new?editId=${id}`)}
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

      {/* Printable Document */}
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
            <h2 className="text-3xl font-bold text-gray-800">MEMO</h2>
            <p className="text-lg font-semibold text-blue-600 mt-1">{memo.memoNumber}</p>
            <p className="text-sm text-gray-500 mt-1">Date: {format(new Date(memo.memoDate), "MMMM d, yyyy")}</p>
            <p className="text-sm text-gray-500">Return by: {format(new Date(memo.returnDate), "MMMM d, yyyy")}</p>
            <span className={`inline-block mt-2 px-2 py-1 rounded-full text-xs font-medium print:hidden ${statusColors[memo.status]}`}>
              {memo.status}
            </span>
          </div>
        </div>

        <hr className="border-gray-300 mb-6" />

        {/* Customer */}
        <div className="mb-8">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Memo To</h3>
          {editMode ? (
            <div className="grid grid-cols-2 gap-3 print:hidden">
              <div>
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
              <div>
                <label className="block text-xs text-gray-500 mb-1">Return Date</label>
                <input type="date" value={editReturnDate} onChange={e => setEditReturnDate(e.target.value)}
                  className="block w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-blue-500" />
              </div>
            </div>
          ) : (
            <>
              <p className="font-semibold text-gray-900">{memo.customerName}</p>
              {memo.customerPhone && <p className="text-sm text-gray-600">{memo.customerPhone}</p>}
              {memo.customerEmail && <p className="text-sm text-gray-600">{memo.customerEmail}</p>}
            </>
          )}
        </div>

        {/* Items Table */}
        <table className="w-full mb-8">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="print:hidden w-8 py-2" />
              <th className="text-left py-2 text-sm font-semibold text-gray-700">Description</th>
              <th className="text-right py-2 text-sm font-semibold text-gray-700">Weight</th>
              <th className="text-right py-2 text-sm font-semibold text-gray-700">Price/Unit</th>
              <th className="text-right py-2 text-sm font-semibold text-gray-700">Memo Value</th>
              {!hideCost && !editMode && (
                <>
                  <th className="print:hidden text-right py-2 text-sm font-semibold text-gray-700">Cost/Unit</th>
                  <th className="print:hidden text-right py-2 text-sm font-semibold text-gray-700">Total Cost</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {memo.items.map(item => {
              const unit = unitLabels[item.weightUnit] || "g"
              const isActive = item.status === "ACTIVE" && memo.status === "ACTIVE"
              const ei = editItems.find(e => e.id === item.id)
              return (
                <tr key={item.id} className={`border-b border-gray-100 ${item.status !== "ACTIVE" && !editMode ? "opacity-50" : ""}`}>
                  <td className="print:hidden py-3 pr-2 w-8">
                    {isActive && !editMode && (
                      <input type="checkbox" checked={selected.has(item.id)}
                        onChange={e => setSelected(prev => {
                          const next = new Set(prev)
                          e.target.checked ? next.add(item.id) : next.delete(item.id)
                          return next
                        })}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" />
                    )}
                    {item.status === "CONVERTED" && !editMode && (
                      <button onClick={async () => {
                        if (!confirm("Revert this item back to active on memo?")) return
                        const res = await fetch(`/api/memo-items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revert" }) })
                        if (res.ok) setMemo(prev => prev ? { ...prev, status: "ACTIVE", items: prev.items.map(i => i.id === item.id ? { ...i, status: "ACTIVE" as MemoItem["status"] } : i) } : prev)
                      }} className="text-xs text-gray-400 hover:text-amber-600 underline">undo</button>
                    )}
                  </td>
                  <td className="py-3 text-sm text-gray-800">
                    {editMode && ei ? (
                      <input value={ei.description} onChange={e => updateEditItem(item.id, "description", e.target.value)}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-blue-500" />
                    ) : (
                      <>
                        {item.description}
                        {item.status === "RETURNED" && <span className="ml-2 text-xs text-gray-400 font-medium">RETURNED</span>}
                        {item.status === "CONVERTED" && <span className="ml-2 text-xs text-green-600 font-medium">INVOICED</span>}
                      </>
                    )}
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
                        <input type="number" step="0.01" value={ei.totalValue}
                          onChange={e => updateEditItem(item.id, "totalValue", e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right font-semibold focus:outline-none focus:ring-blue-500" />
                      </div>
                    ) : `$${item.totalValue.toFixed(2)}`}
                  </td>
                  {!hideCost && !editMode && (() => {
                    const costPerUnit = item.inventoryItem.totalWeight > 0 ? item.inventoryItem.totalCost / item.inventoryItem.totalWeight : 0
                    const lineCost = costPerUnit * item.weight
                    const unit = unitLabels[item.weightUnit] || "g"
                    return (
                      <>
                        <td className="print:hidden py-3 text-sm text-gray-500 text-right">${costPerUnit.toFixed(2)}/{unit}</td>
                        <td className="print:hidden py-3 text-sm text-gray-500 text-right">${lineCost.toFixed(2)}</td>
                      </>
                    )
                  })()}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="print:hidden" />
              <td colSpan={!hideCost && !editMode ? 5 : 3} className="pt-4 text-right font-bold text-gray-900">Total Memo Value</td>
              <td className="pt-4 text-right font-bold text-xl text-blue-600">${memo.totalValue.toFixed(2)}</td>
            </tr>
            {!hideCost && !editMode && (() => {
              const totalCost = memo.items.reduce((s, i) => {
                const avgCost = i.inventoryItem.totalWeight > 0 ? i.inventoryItem.totalCost / i.inventoryItem.totalWeight : 0
                return s + avgCost * i.weight
              }, 0)
              const totalProfit = memo.totalValue - totalCost
              return (
                <>
                  <tr className="print:hidden">
                    <td className="print:hidden" />
                    <td colSpan={5} className="pt-1 text-right text-sm text-gray-500">Total Cost</td>
                    <td className="pt-1 text-right text-sm text-gray-500">${totalCost.toFixed(2)}</td>
                  </tr>
                  <tr className="print:hidden">
                    <td className="print:hidden" />
                    <td colSpan={5} className="pt-1 text-right text-sm font-semibold text-gray-700">Total Profit</td>
                    <td className="pt-1 text-right text-sm font-semibold text-gray-700">${totalProfit.toFixed(2)}</td>
                  </tr>
                </>
              )
            })()}
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

        {(memo.notes || editMode) && (
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-1">Notes</h3>
            {editMode ? (
              <textarea rows={2} value={editNotes} onChange={e => setEditNotes(e.target.value)}
                className="block w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-blue-500 print:hidden" />
            ) : (
              <p className="text-sm text-gray-600">{memo.notes}</p>
            )}
          </div>
        )}

        {/* Signature lines */}
        <div className="mt-12 grid grid-cols-2 gap-12">
          <div>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-xs text-gray-500">Authorized Signature — {BUSINESS.name}</p>
            </div>
          </div>
          <div>
            <div className="border-t border-gray-400 pt-2">
              <p className="text-xs text-gray-500">Customer Signature — {memo.customerName}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
          Items on memo remain the property of {BUSINESS.name} until purchased.<br />
          {BUSINESS.address}, {BUSINESS.city} · {BUSINESS.phone}
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
