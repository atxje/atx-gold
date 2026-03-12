"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter, useParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { format } from "date-fns"

interface InventoryItem {
  id: string
  name: string
  category: string
  subcategory: string
  weightUnit: string
  totalWeight: number
  availableWeight: number
  totalCost: number
  soldWeight: number
  soldValue: number
  totalProfit: number
  status: "ON_STOCK" | "OUT_ON_MEMO"
  purchases: {
    id: string
    purchaseDate: string
    weight: number
    pricePaid: number
    pricePerUnit: number | null
    description: string
    notes: string | null
    lead: { id: string; name: string; phone: string | null }
  }[]
  invoiceItems: {
    id: string
    weight: number
    totalPrice: number
    pricePerUnit: number
    description: string
    invoice: { id: string; invoiceNumber: string; buyerName: string; date: string }
  }[]
  memoItems: {
    id: string
    weight: number
    totalValue: number
    pricePerUnit: number
    description: string
    memo: { id: string; memoNumber: string; customerName: string; memoDate: string; status: string }
  }[]
  mixTransferItems: {
    id: string
    weight: number
    totalCost: number
    role: string
    mixTransfer: {
      id: string
      createdAt: string
      items: {
        id: string
        role: string
        inventoryItemId: string
        inventoryItem: { id: string; name: string }
      }[]
    }
  }[]
}

type TxType = "Purchase" | "Invoice" | "Memo" | "Transfer"
type Direction = "IN" | "OUT"

interface Transaction {
  id: string
  date: string
  type: TxType
  direction: Direction
  party: string
  partyId: string
  partyRoute: string
  docNumber: string
  docId: string
  docRoute: string
  weight: number
  amount: number
  costPerUnit: number
  status?: string
}

type SortKey = "date" | "type" | "party" | "weight" | "amount"
type SortDir = "asc" | "desc"

const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

const typeColors: Record<TxType, string> = {
  Purchase: "bg-amber-100 text-amber-800",
  Invoice:  "bg-green-100 text-green-800",
  Memo:     "bg-blue-100 text-blue-800",
  Transfer: "bg-purple-100 text-purple-800",
}

const memoStatusColors: Record<string, string> = {
  ACTIVE:    "text-blue-600",
  RETURNED:  "text-gray-400",
  CONVERTED: "text-green-600",
}

export default function InventoryItemPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [item, setItem] = useState<InventoryItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [filterType, setFilterType] = useState<TxType | "All" | "Transfer">("All")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session && id) {
      setLoading(true)
      fetch(`/api/inventory/${id}`)
        .then(r => r.json())
        .then(data => { setItem(data); setLoading(false) })
    }
  }, [session, id])

  async function toggleStatus() {
    if (!item) return
    const newStatus = item.status === "ON_STOCK" ? "OUT_ON_MEMO" : "ON_STOCK"
    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) setItem({ ...item, status: newStatus })
    } finally {
      setUpdatingStatus(false)
    }
  }

  const transactions = useMemo<Transaction[]>(() => {
    if (!item) return []
    const txs: Transaction[] = []

    for (const p of item.purchases) {
      const cpu = p.weight > 0 ? p.pricePaid / p.weight : (p.pricePerUnit || 0)
      txs.push({
        id: p.id, date: p.purchaseDate, type: "Purchase", direction: "IN",
        party: p.lead.name, partyId: p.lead.id, partyRoute: `/leads/${p.lead.id}`,
        docNumber: "Purchase", docId: p.id, docRoute: `/purchases/${p.id}`,
        weight: p.weight, amount: p.pricePaid, costPerUnit: cpu,
      })
    }
    for (const inv of item.invoiceItems) {
      txs.push({
        id: inv.id, date: inv.invoice.date, type: "Invoice", direction: "OUT",
        party: inv.invoice.buyerName, partyId: inv.invoice.id, partyRoute: `/documents/invoices/${inv.invoice.id}`,
        docNumber: inv.invoice.invoiceNumber, docId: inv.invoice.id, docRoute: `/documents/invoices/${inv.invoice.id}`,
        weight: inv.weight, amount: inv.totalPrice, costPerUnit: inv.pricePerUnit,
      })
    }
    for (const memo of item.memoItems) {
      txs.push({
        id: memo.id, date: memo.memo.memoDate, type: "Memo", direction: "OUT",
        party: memo.memo.customerName, partyId: memo.memo.id, partyRoute: `/documents/memos/${memo.memo.id}`,
        docNumber: memo.memo.memoNumber, docId: memo.memo.id, docRoute: `/documents/memos/${memo.memo.id}`,
        weight: memo.weight, amount: memo.totalValue, costPerUnit: memo.pricePerUnit, status: memo.memo.status,
      })
    }
    for (const mx of (item.mixTransferItems || [])) {
      const isOut = mx.role === "SOURCE"
      const otherItems = mx.mixTransfer.items.filter(i => i.role !== mx.role)
      const otherNames = otherItems.map(i => i.inventoryItem.name).join(", ") || "—"
      const otherId = otherItems[0]?.inventoryItemId || ""
      const cpu = mx.weight > 0 ? mx.totalCost / mx.weight : 0
      txs.push({
        id: mx.id, date: mx.mixTransfer.createdAt, type: "Transfer",
        direction: isOut ? "OUT" : "IN",
        party: otherNames, partyId: otherId, partyRoute: otherId ? `/inventory/${otherId}` : "/inventory",
        docNumber: "Transfer", docId: mx.mixTransfer.id, docRoute: `/inventory`,
        weight: mx.weight, amount: mx.totalCost, costPerUnit: cpu,
      })
    }
    return txs
  }, [item])

  const filtered = useMemo(() =>
    filterType === "All" ? transactions : transactions.filter(t => t.type === filterType),
    [transactions, filterType]
  )

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === "date")   cmp = new Date(a.date).getTime() - new Date(b.date).getTime()
    if (sortKey === "type")   cmp = a.type.localeCompare(b.type)
    if (sortKey === "party")  cmp = a.party.localeCompare(b.party)
    if (sortKey === "weight") cmp = a.weight - b.weight
    if (sortKey === "amount") cmp = a.amount - b.amount
    return sortDir === "asc" ? cmp : -cmp
  }), [filtered, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("desc") }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-blue-500 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  if (status === "loading" || !session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="text-center py-12">Loading...</div></div>
  if (!item) return <div className="min-h-screen bg-gray-50"><Navbar /><div className="text-center py-12 text-gray-500">Item not found.</div></div>

  const unit = unitLabels[item.weightUnit] || "g"
  const avgPerUnit = item.totalWeight > 0 ? item.totalCost / item.totalWeight : 0
  const totalIn = transactions.filter(t => t.direction === "IN").reduce((s, t) => s + t.weight, 0)
  const totalOut = transactions.filter(t => t.direction === "OUT").reduce((s, t) => s + t.weight, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/inventory" className="text-gray-500 hover:text-gray-700 text-sm">&larr; Back to Inventory</Link>
        </div>

        {/* Header card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
              <p className="text-sm text-gray-500 mt-1">{item.category.replace(/_/g, " ")} · {item.subcategory}</p>
            </div>
            <button onClick={toggleStatus} disabled={updatingStatus}
              className={`px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50 ${item.status === "ON_STOCK" ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-amber-100 text-amber-800 hover:bg-amber-200"}`}>
              {item.status === "ON_STOCK" ? "On Stock" : "Out on Memo"}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-lg font-bold text-gray-900">{item.totalWeight.toFixed(3)} {unit}</div>
              <div className="text-xs text-gray-500 mt-1">Total Purchased</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-lg font-bold text-blue-700">{item.availableWeight.toFixed(3)} {unit}</div>
              <div className="text-xs text-gray-500 mt-1">Available</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <div className="text-lg font-bold text-amber-700">${item.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
              <div className="text-xs text-gray-500 mt-1">Total Cost · ${avgPerUnit.toFixed(2)}/{unit} avg</div>
            </div>
            <div className={`rounded-lg p-4 ${item.totalProfit >= 0 ? "bg-green-50" : "bg-red-50"}`}>
              <div className={`text-lg font-bold ${item.totalProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                ${item.totalProfit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-gray-500 mt-1">Net Profit · ${item.soldValue.toFixed(2)} sold</div>
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700">Transaction History</h2>
              <span className="text-xs text-gray-400">({sorted.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {(["All", "Purchase", "Invoice", "Memo", "Transfer"] as const).map(t => (
                <button key={t} onClick={() => setFilterType(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterType === t ? "bg-gray-800 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No transactions yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th onClick={() => handleSort("date")} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none whitespace-nowrap">
                      Date <SortIcon col="date" />
                    </th>
                    <th onClick={() => handleSort("type")} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none">
                      Type <SortIcon col="type" />
                    </th>
                    <th onClick={() => handleSort("party")} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none">
                      Party <SortIcon col="party" />
                    </th>
                    <th onClick={() => handleSort("weight")} className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer select-none">
                      Weight <SortIcon col="weight" />
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase select-none">
                      Price/Unit
                    </th>
                    <th onClick={() => handleSort("amount")} className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer select-none">
                      Total <SortIcon col="amount" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map(tx => (
                    <tr key={tx.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(tx.docRoute)}>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {format(new Date(tx.date), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[tx.type]}`}>
                          <span>{tx.direction === "IN" ? "▲" : "▼"}</span>
                          {tx.type}
                        </span>
                        {tx.status && (
                          <span className={`ml-1.5 text-xs ${memoStatusColors[tx.status] || "text-gray-400"}`}>{tx.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          onClick={e => { e.stopPropagation(); router.push(tx.partyRoute) }}
                          className="text-gray-900 hover:text-blue-600 hover:underline cursor-pointer">
                          {tx.party}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 whitespace-nowrap">
                        <span className={tx.direction === "IN" ? "text-amber-600" : "text-blue-600"}>
                          {tx.direction === "IN" ? "+" : "−"}{tx.weight.toFixed(3)} {unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700 whitespace-nowrap">
                        ${tx.costPerUnit.toFixed(2)}/{unit}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800 whitespace-nowrap">
                        ${tx.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Totals (filtered)</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-700">
                      {totalIn > 0 && <div className="text-amber-600">+{totalIn.toFixed(3)} {unit}</div>}
                      {totalOut > 0 && <div className="text-blue-600">−{totalOut.toFixed(3)} {unit}</div>}
                    </td>
                    <td />
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-700">
                      ${filtered.reduce((s, t) => s + t.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
