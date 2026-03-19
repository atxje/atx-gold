"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"

type Tab = "cashflow" | "purchases" | "sales" | "valuation"

interface Purchase {
  id: string
  purchaseNumber: string | null
  purchaseDate: string
  description: string
  metalType: string
  weight: number
  weightUnit: string
  pricePaid: number
  category: string | null
  subcategory: string | null
  paymentMethod: string | null
  lead: { name: string }
}

interface ValuationItem {
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
  askingPrice: number
}

interface InvoiceItem {
  id: string
  description: string
  weight: number
  weightUnit: string
  pricePerUnit: number
  totalPrice: number
  costBasis: number
  profit: number
  inventoryItem: { name: string; category: string; subcategory: string; weightUnit: string }
}

interface Invoice {
  id: string
  invoiceNumber: string
  buyerName: string
  date: string
  totalAmount: number
  items: InvoiceItem[]
}

const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function groupByMonth(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(key: string) {
  const [y, m] = key.split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[parseInt(m) - 1]} ${y}`
}

export default function ReportsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("cashflow")
  const [loading, setLoading] = useState(true)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [activeShortcut, setActiveShortcut] = useState("")
  const [valuationDate, setValuationDate] = useState("")
  const [valuationItems, setValuationItems] = useState<ValuationItem[]>([])
  const [valuationLoading, setValuationLoading] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session) { fetchData(); fetchValuation() }
  }, [session])

  async function fetchValuation(date?: string) {
    setValuationLoading(true)
    const params = new URLSearchParams()
    if (date) params.set("asOf", date)
    const res = await fetch(`/api/reports/valuation?${params}`)
    if (res.ok) setValuationItems(await res.json())
    setValuationLoading(false)
  }

  async function fetchData(fromOverride?: string, toOverride?: string) {
    setLoading(true)
    const f = fromOverride ?? from
    const t = toOverride ?? to
    const params = new URLSearchParams()
    if (f) params.set("from", f)
    if (t) params.set("to", t)
    const res = await fetch(`/api/reports?${params}`)
    if (res.ok) {
      const data = await res.json()
      setPurchases(data.purchases)
      setInvoices(data.invoices)
}
    setLoading(false)
  }

  if (status === "loading" || !session) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "cashflow", label: "Cash Flow" },
    { key: "purchases", label: "Purchases" },
    { key: "sales", label: "Sales" },
    { key: "valuation", label: "Stock Valuation" },
  ]

  // Group purchases by purchaseNumber for document-level counting
  const purchaseDocMap = new Map<string, Purchase[]>()
  purchases.forEach(p => {
    const key = p.purchaseNumber || p.id
    if (!purchaseDocMap.has(key)) purchaseDocMap.set(key, [])
    purchaseDocMap.get(key)!.push(p)
  })

  // === CASH FLOW ===
  const cfMonths = new Map<string, { bought: number; sold: number }>()
  purchases.forEach(p => {
    const m = groupByMonth(p.purchaseDate)
    const entry = cfMonths.get(m) || { bought: 0, sold: 0 }
    entry.bought += p.pricePaid
    cfMonths.set(m, entry)
  })
  invoices.forEach(inv => {
    const m = groupByMonth(inv.date)
    const entry = cfMonths.get(m) || { bought: 0, sold: 0 }
    entry.sold += inv.totalAmount
    cfMonths.set(m, entry)
  })
  const cfSorted = Array.from(cfMonths.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const cfTotalBought = purchases.reduce((s, p) => s + p.pricePaid, 0)
  const cfTotalSold = invoices.reduce((s, i) => s + i.totalAmount, 0)

  // === PURCHASES by category ===
  const purchByCat = new Map<string, { count: number; weight: number; cost: number; unit: string }>()
  purchases.forEach(p => {
    const cat = p.category && p.subcategory ? `${p.category} / ${p.subcategory}` : (p.category || "Uncategorized")
    const entry = purchByCat.get(cat) || { count: 0, weight: 0, cost: 0, unit: p.weightUnit }
    entry.count++
    entry.weight += p.weight
    entry.cost += p.pricePaid
    purchByCat.set(cat, entry)
  })

  // === PURCHASES payment breakdown (count once per document, not per line item) ===
  const paymentBreakdown = new Map<string, number>()
  let noPaymentInfo = 0
  const seenPurchaseNumbers = new Set<string>()
  purchases.forEach(p => {
    // Skip duplicate payment counting for same purchase document
    const key = p.purchaseNumber || p.id
    if (seenPurchaseNumbers.has(key)) return
    seenPurchaseNumbers.add(key)
    if (!p.paymentMethod) {
      // Sum the full document total, not just this row
      const docItems = purchaseDocMap.get(key) || [p]
      noPaymentInfo += docItems.reduce((s, item) => s + item.pricePaid, 0)
      return
    }
    try {
      const methods: { method: string; amount: number }[] = JSON.parse(p.paymentMethod)
      methods.forEach(m => {
        paymentBreakdown.set(m.method, (paymentBreakdown.get(m.method) || 0) + m.amount)
      })
    } catch {
      const docItems = purchaseDocMap.get(key) || [p]
      noPaymentInfo += docItems.reduce((s, item) => s + item.pricePaid, 0)
    }
  })
  const totalCash = paymentBreakdown.get("Cash") || 0
  const totalNonCash = Array.from(paymentBreakdown.entries())
    .filter(([k]) => k !== "Cash")
    .reduce((s, [, v]) => s + v, 0)

  // === SALES by category ===
  const salesByCat = new Map<string, { count: number; weight: number; revenue: number; cost: number; profit: number; unit: string }>()
  invoices.forEach(inv => {
    inv.items.forEach(item => {
      const cat = `${item.inventoryItem.category} / ${item.inventoryItem.subcategory}`
      const entry = salesByCat.get(cat) || { count: 0, weight: 0, revenue: 0, cost: 0, profit: 0, unit: item.inventoryItem.weightUnit }
      entry.count++
      entry.weight += item.weight
      entry.revenue += item.totalPrice
      entry.cost += item.costBasis
      entry.profit += item.profit
      salesByCat.set(cat, entry)
    })
  })
  const totalRevenue = invoices.reduce((s, i) => s + i.totalAmount, 0)
  const totalCostSold = invoices.reduce((s, i) => s + i.items.reduce((ss, it) => ss + it.costBasis, 0), 0)
  const totalProfit = totalRevenue - totalCostSold

  // === STOCK VALUATION (from valuation API) ===
  const totalStockCost = valuationItems.reduce((s, i) => s + i.totalCost, 0)
  const totalAskingValue = valuationItems.reduce((s, i) => {
    const currentWeight = i.totalWeight - i.soldWeight
    return s + (i.askingPrice > 0 ? i.askingPrice * currentWeight : 0)
  }, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-500">From</label>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setActiveShortcut("") }}
                className="border rounded px-2 py-1 text-sm" />
              <label className="text-sm text-gray-500">To</label>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setActiveShortcut("") }}
                className="border rounded px-2 py-1 text-sm" />
              <button onClick={() => fetchData()}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                Apply
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[
              { label: "Today", getRange: () => { const d = fmtDate(new Date()); return [d, d] } },
              { label: "This Week", getRange: () => {
                const now = new Date()
                const day = now.getDay()
                const mon = new Date(now)
                mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
                return [fmtDate(mon), fmtDate(now)]
              }},
              { label: "Month to Date", getRange: () => {
                const now = new Date()
                return [fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)), fmtDate(now)]
              }},
              { label: "Year to Date", getRange: () => {
                const now = new Date()
                return [fmtDate(new Date(now.getFullYear(), 0, 1)), fmtDate(now)]
              }},
              { label: "All Time", getRange: () => ["", ""] as [string, string] },
            ].map(shortcut => (
              <button
                key={shortcut.label}
                onClick={() => {
                  const [f, t] = shortcut.getRange()
                  setFrom(f); setTo(t)
                  setActiveShortcut(shortcut.label)
                  fetchData(f, t)
                }}
                className={`px-3 py-1 rounded text-sm border ${
                  activeShortcut === shortcut.label
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {shortcut.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-6">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`pb-3 text-sm font-medium border-b-2 ${
                  tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : (
          <>
            {/* CASH FLOW */}
            {tab === "cashflow" && (
              <div>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-red-50 rounded-lg shadow p-4">
                    <div className="text-2xl font-bold text-red-600">${fmt(cfTotalBought)}</div>
                    <div className="text-sm text-red-600">Total Purchased</div>
                  </div>
                  <div className="bg-green-50 rounded-lg shadow p-4">
                    <div className="text-2xl font-bold text-green-600">${fmt(cfTotalSold)}</div>
                    <div className="text-sm text-green-600">Total Sold</div>
                  </div>
                  <div className={`rounded-lg shadow p-4 ${cfTotalSold - cfTotalBought >= 0 ? "bg-blue-50" : "bg-orange-50"}`}>
                    <div className={`text-2xl font-bold ${cfTotalSold - cfTotalBought >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                      ${fmt(cfTotalSold - cfTotalBought)}
                    </div>
                    <div className={`text-sm ${cfTotalSold - cfTotalBought >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                      Net Cash Flow
                    </div>
                  </div>
                </div>

                {cfSorted.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No data for this period</div>
                ) : (
                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Purchased</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sold</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Running Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(() => {
                          let running = 0
                          return cfSorted.map(([month, data]) => {
                            const net = data.sold - data.bought
                            running += net
                            return (
                              <tr key={month} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium">{monthLabel(month)}</td>
                                <td className="px-4 py-3 text-right text-sm text-red-600">${fmt(data.bought)}</td>
                                <td className="px-4 py-3 text-right text-sm text-green-600">${fmt(data.sold)}</td>
                                <td className={`px-4 py-3 text-right text-sm font-medium ${net >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {net >= 0 ? "+" : ""}${fmt(net)}
                                </td>
                                <td className={`px-4 py-3 text-right text-sm font-semibold ${running >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                                  ${fmt(running)}
                                </td>
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* PURCHASES */}
            {tab === "purchases" && (
              <div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-2xl font-bold">{purchaseDocMap.size}</div>
                    <div className="text-sm text-gray-500">Purchase Documents</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-2xl font-bold">{purchases.length}</div>
                    <div className="text-sm text-gray-500">Line Items</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg shadow p-4">
                    <div className="text-2xl font-bold text-orange-600">
                      ${fmt(purchases.reduce((s, p) => s + p.pricePaid, 0))}
                    </div>
                    <div className="text-sm text-orange-600">Total Spent</div>
                  </div>
                </div>

                {/* Payment Method Breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-green-50 rounded-lg shadow p-4">
                    <div className="text-2xl font-bold text-green-700">${fmt(totalCash)}</div>
                    <div className="text-sm text-green-700">Cash</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg shadow p-4">
                    <div className="text-2xl font-bold text-blue-700">${fmt(totalNonCash)}</div>
                    <div className="text-sm text-blue-700">Non-Cash</div>
                  </div>
                  {Array.from(paymentBreakdown.entries())
                    .filter(([k]) => k !== "Cash")
                    .sort((a, b) => b[1] - a[1])
                    .map(([method, amount]) => (
                      <div key={method} className="bg-white rounded-lg shadow p-4">
                        <div className="text-2xl font-bold text-gray-700">${fmt(amount)}</div>
                        <div className="text-sm text-gray-500">{method}</div>
                      </div>
                    ))}
                  {noPaymentInfo > 0 && (
                    <div className="bg-gray-50 rounded-lg shadow p-4">
                      <div className="text-2xl font-bold text-gray-400">${fmt(noPaymentInfo)}</div>
                      <div className="text-sm text-gray-400">No Info</div>
                    </div>
                  )}
                </div>

                {/* By Category */}
                <h3 className="text-lg font-semibold mb-3">By Category</h3>
                {purchByCat.size === 0 ? (
                  <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No purchases in this period</div>
                ) : (
                  <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg/Unit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {Array.from(purchByCat.entries())
                          .sort((a, b) => b[1].cost - a[1].cost)
                          .map(([cat, data]) => {
                            const unit = unitLabels[data.unit] || "g"
                            return (
                              <tr key={cat} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium">{cat}</td>
                                <td className="px-4 py-3 text-right text-sm">{data.count}</td>
                                <td className="px-4 py-3 text-right text-sm">{data.weight.toFixed(3)}{unit}</td>
                                <td className="px-4 py-3 text-right text-sm text-orange-600 font-medium">${fmt(data.cost)}</td>
                                <td className="px-4 py-3 text-right text-sm text-gray-500">
                                  ${data.weight > 0 ? fmt(data.cost / data.weight) : "0.00"}/{unit}
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Purchases by document */}
                <h3 className="text-lg font-semibold mb-3">All Purchases</h3>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Doc#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seller</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {Array.from(purchaseDocMap.entries()).map(([docNum, items]) => {
                        const first = items[0]
                        const total = items.reduce((s, p) => s + p.pricePaid, 0)
                        return (
                          <tr key={docNum} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{new Date(first.purchaseDate).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-sm text-blue-600">
                              <a href={`/purchases/${first.id}`}>{first.purchaseNumber || "—"}</a>
                            </td>
                            <td className="px-4 py-3 text-sm">{first.lead.name}</td>
                            <td className="px-4 py-3 text-right text-sm">{items.length}</td>
                            <td className="px-4 py-3 text-right text-sm text-orange-600 font-medium">${fmt(total)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SALES */}
            {tab === "sales" && (
              <div>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-2xl font-bold">{invoices.length}</div>
                    <div className="text-sm text-gray-500">Invoices</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg shadow p-4">
                    <div className="text-2xl font-bold text-blue-600">${fmt(totalRevenue)}</div>
                    <div className="text-sm text-blue-600">Revenue</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg shadow p-4">
                    <div className="text-2xl font-bold text-orange-600">${fmt(totalCostSold)}</div>
                    <div className="text-sm text-orange-600">Cost of Goods</div>
                  </div>
                  <div className={`rounded-lg shadow p-4 ${totalProfit >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                    <div className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      ${fmt(totalProfit)}
                    </div>
                    <div className={`text-sm ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      Profit ({totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : "0"}%)
                    </div>
                  </div>
                </div>

                {/* By Category */}
                <h3 className="text-lg font-semibold mb-3">By Category</h3>
                {salesByCat.size === 0 ? (
                  <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No sales in this period</div>
                ) : (
                  <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {Array.from(salesByCat.entries())
                          .sort((a, b) => b[1].revenue - a[1].revenue)
                          .map(([cat, data]) => {
                            const unit = unitLabels[data.unit] || "g"
                            const margin = data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0
                            return (
                              <tr key={cat} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium">{cat}</td>
                                <td className="px-4 py-3 text-right text-sm">{data.count}</td>
                                <td className="px-4 py-3 text-right text-sm">{data.weight.toFixed(3)}{unit}</td>
                                <td className="px-4 py-3 text-right text-sm text-blue-600 font-medium">${fmt(data.revenue)}</td>
                                <td className="px-4 py-3 text-right text-sm text-orange-600">${fmt(data.cost)}</td>
                                <td className={`px-4 py-3 text-right text-sm font-medium ${data.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  ${fmt(data.profit)}
                                </td>
                                <td className={`px-4 py-3 text-right text-sm ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {margin.toFixed(1)}%
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Individual invoices */}
                <h3 className="text-lg font-semibold mb-3">All Invoices</h3>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buyer</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {invoices.map(inv => {
                        const cost = inv.items.reduce((s, i) => s + i.costBasis, 0)
                        const profit = inv.totalAmount - cost
                        return (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{new Date(inv.date).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-sm text-blue-600">
                              <a href={`/documents/invoices/${inv.id}`}>{inv.invoiceNumber}</a>
                            </td>
                            <td className="px-4 py-3 text-sm">{inv.buyerName}</td>
                            <td className="px-4 py-3 text-right text-sm">{inv.items.length}</td>
                            <td className="px-4 py-3 text-right text-sm text-blue-600 font-medium">${fmt(inv.totalAmount)}</td>
                            <td className="px-4 py-3 text-right text-sm text-orange-600">${fmt(cost)}</td>
                            <td className={`px-4 py-3 text-right text-sm font-medium ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                              ${fmt(profit)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* STOCK VALUATION */}
            {tab === "valuation" && (
              <div>
                {/* Date picker */}
                <div className="flex items-center gap-3 mb-6">
                  <label className="text-sm font-medium text-gray-700">Valuation as of</label>
                  <input type="date" value={valuationDate} onChange={e => setValuationDate(e.target.value)}
                    className="border rounded px-2 py-1 text-sm" />
                  <button onClick={() => fetchValuation(valuationDate || undefined)}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                    Apply
                  </button>
                  {valuationDate && (
                    <button onClick={() => { setValuationDate(""); fetchValuation() }}
                      className="px-3 py-1 border border-gray-300 text-gray-600 rounded text-sm hover:bg-gray-50">
                      Today
                    </button>
                  )}
                  {valuationDate && (
                    <span className="text-sm text-gray-500">
                      Showing inventory snapshot as of {new Date(valuationDate + "T00:00:00").toLocaleDateString()}
                    </span>
                  )}
                </div>

                {valuationLoading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-white rounded-lg shadow p-4">
                        <div className="text-2xl font-bold">{valuationItems.length}</div>
                        <div className="text-sm text-gray-500">Items in Stock</div>
                      </div>
                      <div className="bg-orange-50 rounded-lg shadow p-4">
                        <div className="text-2xl font-bold text-orange-600">${fmt(totalStockCost)}</div>
                        <div className="text-sm text-orange-600">Cost Basis</div>
                      </div>
                      <div className="bg-green-50 rounded-lg shadow p-4">
                        <div className="text-2xl font-bold text-green-600">
                          {totalAskingValue > 0 ? `$${fmt(totalAskingValue)}` : "N/A"}
                        </div>
                        <div className="text-sm text-green-600">Asking Value</div>
                      </div>
                    </div>

                    {valuationItems.length === 0 ? (
                      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No items in stock{valuationDate ? " at this date" : ""}</div>
                    ) : (
                      <div className="bg-white rounded-lg shadow overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">In Stock</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Office</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">On Memo</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg/Unit</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ask/Unit</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Asking Value</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Potential Profit</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {valuationItems.map(item => {
                              const unit = unitLabels[item.weightUnit] || "g"
                              const currentWeight = item.totalWeight - item.soldWeight
                              const avgPerUnit = currentWeight > 0 ? item.totalCost / currentWeight : 0
                              const onMemo = item.totalWeight - item.availableWeight - item.soldWeight
                              const askingValue = item.askingPrice > 0 ? item.askingPrice * currentWeight : 0
                              const potentialProfit = askingValue > 0 ? askingValue - item.totalCost : 0
                              return (
                                <tr key={item.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium">
                                    <a href={`/inventory/${item.id}`} className="text-blue-600 hover:text-blue-800">{item.name}</a>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-500">{item.category} / {item.subcategory}</td>
                                  <td className="px-4 py-3 text-right text-sm">{currentWeight.toFixed(3)}{unit}</td>
                                  <td className="px-4 py-3 text-right text-sm font-medium">{item.availableWeight.toFixed(3)}{unit}</td>
                                  <td className="px-4 py-3 text-right text-sm text-amber-600">
                                    {onMemo > 0.0005 ? `${onMemo.toFixed(3)}${unit}` : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-right text-sm text-orange-600 font-medium">${fmt(item.totalCost)}</td>
                                  <td className="px-4 py-3 text-right text-sm text-gray-500">${fmt(avgPerUnit)}/{unit}</td>
                                  <td className="px-4 py-3 text-right text-sm text-gray-500">
                                    {item.askingPrice > 0 ? `$${fmt(item.askingPrice)}/${unit}` : "—"}
                                  </td>
                                  <td className="px-4 py-3 text-right text-sm text-blue-600 font-medium">
                                    {askingValue > 0 ? `$${fmt(askingValue)}` : "—"}
                                  </td>
                                  <td className={`px-4 py-3 text-right text-sm font-medium ${potentialProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                    {askingValue > 0 ? `$${fmt(potentialProfit)}` : "—"}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot className="bg-gray-50 font-semibold">
                            <tr>
                              <td className="px-4 py-3 text-sm" colSpan={5}>Totals</td>
                              <td className="px-4 py-3 text-right text-sm text-orange-600">${fmt(totalStockCost)}</td>
                              <td className="px-4 py-3" colSpan={2}></td>
                              <td className="px-4 py-3 text-right text-sm text-blue-600">
                                {totalAskingValue > 0 ? `$${fmt(totalAskingValue)}` : "—"}
                              </td>
                              <td className={`px-4 py-3 text-right text-sm ${totalAskingValue - totalStockCost >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {totalAskingValue > 0 ? `$${fmt(totalAskingValue - totalStockCost)}` : "—"}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
