"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"

type Tab = "cashflow" | "purchases" | "sales" | "transfers" | "valuation"

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
  metalType: string
  jewelryMetal: string | null
  isWatch: boolean
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
  invoiceType?: string
  buyerName: string
  date: string
  totalAmount: number
  items: InvoiceItem[]
}

const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

// Melt value constants (same as inventory page)
const GRAMS_PER_TROY_OZ = 31.1035
const GOLD_SCRAP_PURITY: Record<string, number> = {
  "10K": 0.395, "14K": 0.565, "18K": 0.73, "21K+": 0.875, "22K": 0.9, "24K": 0.99, "Mixed W/D": 0.565,
}
const GOLD_SCRAP_PAY_RATE = 0.98
const SILVER_SCRAP_PURITY: Record<string, number> = {
  "Sterling Jewelry": 0.925, "Silverware": 0.925,
}
const SILVER_SCRAP_PAY_RATE = 0.915
const GOLD_BULLION_PURITY: Record<string, number> = {
  "Gold American Eagle": 1, "Gold Maple": 1, "Krugerrand": 1,
  "PAMP Bar": 1, "VALCAMBI Bar": 1, "Credit Suisse Bar": 1, "Centenario": 0.9,
  "1 gram bar": 1, "2.5 gram bar": 1, "5 gram bar": 1, "10 gram bar": 1, "20 gram bar": 1, "100 gram bar": 1,
}
const SILVER_BULLION_PURITY: Record<string, number> = {
  "Silver Eagle": 1, "Silver Buffalo": 1, "Silver Generics": 0.999, "Silver Dollar (Peace/Morgan)": 1,
}
const JEWELRY_METAL_INFO: Record<string, { metal: "gold" | "silver"; purity: number; payRate: number }> = {
  "10K": { metal: "gold", purity: 0.395, payRate: GOLD_SCRAP_PAY_RATE },
  "14K": { metal: "gold", purity: 0.565, payRate: GOLD_SCRAP_PAY_RATE },
  "18K": { metal: "gold", purity: 0.73, payRate: GOLD_SCRAP_PAY_RATE },
  "Plat": { metal: "gold", purity: 0, payRate: 0 },
  "Sterling": { metal: "silver", purity: 0.925, payRate: SILVER_SCRAP_PAY_RATE },
}

// Resolve scrap-gold purity by exact subcategory, falling back to the karat token
// in the name (e.g. "Mixed W/D 14K" → 14K) so karat variants work automatically.
function karatPurity(subcategory: string, map: Record<string, number>): number | undefined {
  if (map[subcategory] !== undefined) return map[subcategory]
  const m = subcategory.match(/(\d{1,2})\s*K/i)
  if (!m) return undefined
  const karat = `${m[1]}K`
  return map[karat] ?? map[`${karat}+`]
}

function itemMeltValue(item: ValuationItem, spotPrices: { gold: number; silver: number }): number | null {
  const weight = item.availableWeight
  if (weight <= 0) return null

  const mt = item.metalType
  if (mt === "GOLD" || mt === "PLATINUM" || mt === "PALLADIUM") {
    const scrapPurity = karatPurity(item.subcategory, GOLD_SCRAP_PURITY)
    if (scrapPurity !== undefined && scrapPurity > 0 && item.weightUnit === "GRAM") {
      return weight * scrapPurity * GOLD_SCRAP_PAY_RATE * (spotPrices.gold / GRAMS_PER_TROY_OZ)
    }
    const bullionPurity = GOLD_BULLION_PURITY[item.subcategory]
    if (bullionPurity !== undefined && item.weightUnit === "TROY_OZ") {
      return weight * bullionPurity * spotPrices.gold
    }
  }

  if (mt === "SILVER") {
    const scrapPurity = SILVER_SCRAP_PURITY[item.subcategory]
    if (scrapPurity !== undefined && item.weightUnit === "GRAM") {
      return weight * scrapPurity * SILVER_SCRAP_PAY_RATE * (spotPrices.silver / GRAMS_PER_TROY_OZ)
    }
    const bullionPurity = SILVER_BULLION_PURITY[item.subcategory]
    if (bullionPurity !== undefined && item.weightUnit === "TROY_OZ") {
      return weight * bullionPurity * spotPrices.silver
    }
  }

  // Jewelry — melt based on metal type
  if (mt === "JEWELRY" && item.jewelryMetal) {
    const jm = JEWELRY_METAL_INFO[item.jewelryMetal]
    if (jm && jm.purity > 0) {
      const spot = jm.metal === "gold" ? spotPrices.gold : spotPrices.silver
      return weight * jm.purity * jm.payRate * (spot / GRAMS_PER_TROY_OZ)
    }
  }

  return null
}

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
  const [spotPrices, setSpotPrices] = useState<{ gold: number; silver: number; timestamp: string } | null>(null)
  const [spotLoading, setSpotLoading] = useState(false)
  const [editingAsk, setEditingAsk] = useState<string | null>(null) // itemId or itemId:total
  const [askValue, setAskValue] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
    // Employees may only see their own compensation report
    if (session?.user?.role && session.user.role !== "ADMIN") router.replace("/compensation")
  }, [status, session, router])

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

  function meltPerUnit(item: ValuationItem, spot: { gold: number; silver: number }): number | null {
    const mt = item.metalType
    if (mt === "GOLD" || mt === "PLATINUM" || mt === "PALLADIUM") {
      const scrapPurity = GOLD_SCRAP_PURITY[item.subcategory]
      if (scrapPurity !== undefined && scrapPurity > 0 && item.weightUnit === "GRAM")
        return scrapPurity * GOLD_SCRAP_PAY_RATE * (spot.gold / GRAMS_PER_TROY_OZ)
      const bullionPurity = GOLD_BULLION_PURITY[item.subcategory]
      if (bullionPurity !== undefined && item.weightUnit === "TROY_OZ")
        return bullionPurity * spot.gold
    }
    if (mt === "SILVER") {
      const scrapPurity = SILVER_SCRAP_PURITY[item.subcategory]
      if (scrapPurity !== undefined && item.weightUnit === "GRAM")
        return scrapPurity * SILVER_SCRAP_PAY_RATE * (spot.silver / GRAMS_PER_TROY_OZ)
      const bullionPurity = SILVER_BULLION_PURITY[item.subcategory]
      if (bullionPurity !== undefined && item.weightUnit === "TROY_OZ")
        return bullionPurity * spot.silver
    }
    return null
  }

  async function applyMeltToAsking(spot: { gold: number; silver: number }) {
    const updates: { id: string; askingPrice: number }[] = []
    for (const item of valuationItems) {
      const rate = meltPerUnit(item, spot)
      if (rate !== null && rate > 0) updates.push({ id: item.id, askingPrice: rate })
    }
    // Batch save
    await Promise.all(updates.map(u =>
      fetch(`/api/inventory/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ askingPrice: u.askingPrice }),
      })
    ))
    // Update local state
    setValuationItems(prev => {
      const map = new Map(updates.map(u => [u.id, u.askingPrice]))
      return prev.map(i => map.has(i.id) ? { ...i, askingPrice: map.get(i.id)! } : i)
    })
  }

  async function fetchSpotPrices() {
    setSpotLoading(true)
    try {
      const res = await fetch("/api/spot-prices")
      if (res.ok) {
        const data = await res.json()
        setSpotPrices(data)
        await applyMeltToAsking(data)
      }
    } catch { /* ignore */ }
    finally { setSpotLoading(false) }
  }

  async function saveAskingPrice(item: ValuationItem, mode: "unit" | "total") {
    const val = parseFloat(askValue)
    if (isNaN(val) || val < 0) { setEditingAsk(null); return }
    const currentWeight = item.totalWeight - item.soldWeight
    const newAskPerUnit = mode === "total" && currentWeight > 0 ? val / currentWeight : val
    await fetch(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ askingPrice: newAskPerUnit }),
    })
    setValuationItems(prev => prev.map(i => i.id === item.id ? { ...i, askingPrice: newAskPerUnit } : i))
    setEditingAsk(null)
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
    { key: "transfers", label: "Transfers" },
    { key: "valuation", label: "Stock Valuation" },
  ]

  // Split invoices by type
  const saleInvoices = invoices.filter(i => i.invoiceType !== "TRANSFER")
  const transferInvoices = invoices.filter(i => i.invoiceType === "TRANSFER")

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
  saleInvoices.forEach(inv => {
    const m = groupByMonth(inv.date)
    const entry = cfMonths.get(m) || { bought: 0, sold: 0 }
    entry.sold += inv.totalAmount
    cfMonths.set(m, entry)
  })
  const cfSorted = Array.from(cfMonths.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const cfTotalBought = purchases.reduce((s, p) => s + p.pricePaid, 0)
  const cfTotalSold = saleInvoices.reduce((s, i) => s + i.totalAmount, 0)

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

  // === SALES by category (excludes transfers) ===
  const salesByCat = new Map<string, { count: number; weight: number; revenue: number; cost: number; profit: number; unit: string }>()
  saleInvoices.forEach(inv => {
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
  const totalRevenue = saleInvoices.reduce((s, i) => s + i.totalAmount, 0)
  const totalCostSold = saleInvoices.reduce((s, i) => s + i.items.reduce((ss, it) => ss + it.costBasis, 0), 0)
  const totalProfit = totalRevenue - totalCostSold

  // === TRANSFERS by category ===
  const transfersByCat = new Map<string, { count: number; weight: number; revenue: number; cost: number; profit: number; unit: string }>()
  transferInvoices.forEach(inv => {
    inv.items.forEach(item => {
      const cat = `${item.inventoryItem.category} / ${item.inventoryItem.subcategory}`
      const entry = transfersByCat.get(cat) || { count: 0, weight: 0, revenue: 0, cost: 0, profit: 0, unit: item.inventoryItem.weightUnit }
      entry.count++
      entry.weight += item.weight
      entry.revenue += item.totalPrice
      entry.cost += item.costBasis
      entry.profit += item.profit
      transfersByCat.set(cat, entry)
    })
  })
  const transferTotalRevenue = transferInvoices.reduce((s, i) => s + i.totalAmount, 0)
  const transferTotalCost = transferInvoices.reduce((s, i) => s + i.items.reduce((ss, it) => ss + it.costBasis, 0), 0)
  const transferTotalProfit = transferTotalRevenue - transferTotalCost

  // === STOCK VALUATION (from valuation API) ===
  const totalStockCost = valuationItems.reduce((s, i) => s + i.totalCost, 0)
  const totalAskingValue = valuationItems.reduce((s, i) => {
    const currentWeight = i.totalWeight - i.soldWeight
    return s + (i.askingPrice > 0 ? i.askingPrice * currentWeight : 0)
  }, 0)

  // === FAIR VALUE BASIS ===
  const goldItems = valuationItems.filter(i => i.metalType === "GOLD" || i.metalType === "PLATINUM" || i.metalType === "PALLADIUM")
  const silverItems = valuationItems.filter(i => i.metalType === "SILVER")
  const jewelryItems = valuationItems.filter(i => i.metalType === "JEWELRY")
  const diamondItems = valuationItems.filter(i => i.metalType === "DIAMOND")
  const watchItems = valuationItems.filter(i => i.metalType === "WATCH")

  // Gold fair value = melt value (includes jewelry with gold metal)
  const goldJewelryWithGold = jewelryItems.filter(i => {
    const jm = i.jewelryMetal ? JEWELRY_METAL_INFO[i.jewelryMetal] : null
    return jm?.metal === "gold"
  })
  const silverJewelryWithSilver = jewelryItems.filter(i => {
    const jm = i.jewelryMetal ? JEWELRY_METAL_INFO[i.jewelryMetal] : null
    return jm?.metal === "silver"
  })
  const jewelryNoMelt = jewelryItems.filter(i => {
    if (!i.jewelryMetal) return true
    const jm = JEWELRY_METAL_INFO[i.jewelryMetal]
    return !jm || jm.purity <= 0
  })

  function groupMeltValue(items: ValuationItem[]): { total: number; count: number; noMeltCount: number } {
    let total = 0, count = 0, noMeltCount = 0
    for (const item of items) {
      if (spotPrices) {
        const mv = itemMeltValue(item, spotPrices)
        if (mv !== null) { total += mv; count++ }
        else noMeltCount++
      } else {
        noMeltCount++
      }
    }
    return { total, count, noMeltCount }
  }

  const goldMelt = groupMeltValue([...goldItems, ...goldJewelryWithGold])
  const silverMelt = groupMeltValue([...silverItems, ...silverJewelryWithSilver])

  // Diamonds & watches: asking value
  function groupAskingValue(items: ValuationItem[]): { total: number; count: number; noAskCount: number } {
    let total = 0, count = 0, noAskCount = 0
    for (const item of items) {
      const currentWeight = item.totalWeight - item.soldWeight
      if (item.askingPrice > 0 && currentWeight > 0) {
        total += item.askingPrice * currentWeight
        count++
      } else {
        noAskCount++
      }
    }
    return { total, count, noAskCount }
  }

  const diamondAsking = groupAskingValue(diamondItems)
  const watchAsking = groupAskingValue(watchItems)
  const jewelryNoMeltAsking = groupAskingValue(jewelryNoMelt)

  const totalFairValue = goldMelt.total + silverMelt.total + diamondAsking.total + watchAsking.total + jewelryNoMeltAsking.total

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
                    <div className="text-2xl font-bold">{saleInvoices.length}</div>
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
                      {saleInvoices.map(inv => {
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

            {/* TRANSFERS */}
            {tab === "transfers" && (
              <div>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-2xl font-bold">{transferInvoices.length}</div>
                    <div className="text-sm text-gray-500">Transfers</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg shadow p-4">
                    <div className="text-2xl font-bold text-purple-600">${fmt(transferTotalRevenue)}</div>
                    <div className="text-sm text-purple-600">Value</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg shadow p-4">
                    <div className="text-2xl font-bold text-orange-600">${fmt(transferTotalCost)}</div>
                    <div className="text-sm text-orange-600">Cost Basis</div>
                  </div>
                  <div className={`rounded-lg shadow p-4 ${transferTotalProfit >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                    <div className={`text-2xl font-bold ${transferTotalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      ${fmt(transferTotalProfit)}
                    </div>
                    <div className={`text-sm ${transferTotalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      Difference
                    </div>
                  </div>
                </div>

                {/* By Category */}
                <h3 className="text-lg font-semibold mb-3">By Category</h3>
                {transfersByCat.size === 0 ? (
                  <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No transfers in this period</div>
                ) : (
                  <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {Array.from(transfersByCat.entries())
                          .sort((a, b) => b[1].revenue - a[1].revenue)
                          .map(([cat, data]) => {
                            const unit = unitLabels[data.unit] || "g"
                            return (
                              <tr key={cat} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium">{cat}</td>
                                <td className="px-4 py-3 text-right text-sm">{data.count}</td>
                                <td className="px-4 py-3 text-right text-sm">{data.weight.toFixed(3)}{unit}</td>
                                <td className="px-4 py-3 text-right text-sm text-purple-600 font-medium">${fmt(data.revenue)}</td>
                                <td className="px-4 py-3 text-right text-sm text-orange-600">${fmt(data.cost)}</td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* All Transfers */}
                <h3 className="text-lg font-semibold mb-3">All Transfers</h3>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transfer#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {transferInvoices.map(inv => {
                        const cost = inv.items.reduce((s, i) => s + i.costBasis, 0)
                        return (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{new Date(inv.date).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-sm text-purple-600">
                              <a href={`/documents/invoices/${inv.id}`}>{inv.invoiceNumber}</a>
                            </td>
                            <td className="px-4 py-3 text-sm">{inv.buyerName}</td>
                            <td className="px-4 py-3 text-right text-sm">{inv.items.length}</td>
                            <td className="px-4 py-3 text-right text-sm text-purple-600 font-medium">${fmt(inv.totalAmount)}</td>
                            <td className="px-4 py-3 text-right text-sm text-orange-600">${fmt(cost)}</td>
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

                    {/* Fair Value Basis — only for today's valuation */}
                    {valuationItems.length > 0 && !valuationDate && (
                      <div className="bg-white rounded-lg shadow p-5 mb-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900">Fair Value Basis</h3>
                          {!spotPrices && (
                            <button onClick={fetchSpotPrices} disabled={spotLoading}
                              className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 disabled:opacity-50">
                              {spotLoading ? "Fetching..." : "Fetch Spot Prices"}
                            </button>
                          )}
                          {spotPrices && (
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span>Gold: ${fmt(spotPrices.gold)}/oz</span>
                              <span>Silver: ${fmt(spotPrices.silver)}/oz</span>
                              <button onClick={fetchSpotPrices} disabled={spotLoading}
                                className="text-blue-600 hover:underline">
                                {spotLoading ? "..." : "Refresh"}
                              </button>
                            </div>
                          )}
                        </div>

                        {!spotPrices ? (
                          <p className="text-sm text-gray-500">Fetch spot prices to calculate melt values for gold and silver items.</p>
                        ) : (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {/* Gold */}
                              <div className="bg-yellow-50 rounded-lg p-3">
                                <div className="text-xs font-medium text-yellow-700 uppercase mb-1">Gold Items</div>
                                <div className="text-xl font-bold text-yellow-700">
                                  {goldMelt.count > 0 ? `$${fmt(goldMelt.total)}` : "—"}
                                </div>
                                <div className="text-xs text-yellow-600">
                                  {goldMelt.count} item{goldMelt.count !== 1 ? "s" : ""} (melt value)
                                  {goldMelt.noMeltCount > 0 && (
                                    <span className="block text-yellow-500">{goldMelt.noMeltCount} not calculable</span>
                                  )}
                                </div>
                              </div>
                              {/* Silver */}
                              <div className="bg-gray-100 rounded-lg p-3">
                                <div className="text-xs font-medium text-gray-600 uppercase mb-1">Silver Items</div>
                                <div className="text-xl font-bold text-gray-700">
                                  {silverMelt.count > 0 ? `$${fmt(silverMelt.total)}` : "—"}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {silverMelt.count} item{silverMelt.count !== 1 ? "s" : ""} (melt value)
                                  {silverMelt.noMeltCount > 0 && (
                                    <span className="block text-gray-400">{silverMelt.noMeltCount} not calculable</span>
                                  )}
                                </div>
                              </div>
                              {/* Diamonds */}
                              <div className="bg-blue-50 rounded-lg p-3">
                                <div className="text-xs font-medium text-blue-700 uppercase mb-1">Diamonds</div>
                                <div className="text-xl font-bold text-blue-700">
                                  {diamondAsking.count > 0 ? `$${fmt(diamondAsking.total)}` : "—"}
                                </div>
                                <div className="text-xs text-blue-600">
                                  {diamondAsking.count} item{diamondAsking.count !== 1 ? "s" : ""} (asking value)
                                  {diamondAsking.noAskCount > 0 && (
                                    <span className="block text-red-500">{diamondAsking.noAskCount} without asking price</span>
                                  )}
                                </div>
                              </div>
                              {/* Watches */}
                              <div className="bg-purple-50 rounded-lg p-3">
                                <div className="text-xs font-medium text-purple-700 uppercase mb-1">Watches</div>
                                <div className="text-xl font-bold text-purple-700">
                                  {watchAsking.count > 0 ? `$${fmt(watchAsking.total)}` : "—"}
                                </div>
                                <div className="text-xs text-purple-600">
                                  {watchAsking.count} item{watchAsking.count !== 1 ? "s" : ""} (asking value)
                                  {watchAsking.noAskCount > 0 && (
                                    <span className="block text-red-500">{watchAsking.noAskCount} without asking price</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* Jewelry without melt (no gold/silver metal) */}
                            {jewelryNoMelt.length > 0 && (
                              <div className="bg-pink-50 rounded-lg p-3">
                                <div className="text-xs font-medium text-pink-700 uppercase mb-1">Jewelry (no melt — asking value)</div>
                                <div className="text-xl font-bold text-pink-700">
                                  {jewelryNoMeltAsking.count > 0 ? `$${fmt(jewelryNoMeltAsking.total)}` : "—"}
                                </div>
                                <div className="text-xs text-pink-600">
                                  {jewelryNoMeltAsking.count} item{jewelryNoMeltAsking.count !== 1 ? "s" : ""}
                                  {jewelryNoMeltAsking.noAskCount > 0 && (
                                    <span> · {jewelryNoMeltAsking.noAskCount} without asking price</span>
                                  )}
                                </div>
                              </div>
                            )}
                            {/* Total */}
                            <div className="border-t pt-3 flex justify-between items-center">
                              <span className="text-sm font-semibold text-gray-700">Total Fair Value</span>
                              <span className="text-xl font-bold text-green-700">
                                {totalFairValue > 0 ? `$${fmt(totalFairValue)}` : "—"}
                              </span>
                            </div>
                            {totalFairValue > 0 && totalStockCost > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">Fair Value vs Cost Basis</span>
                                <span className={totalFairValue >= totalStockCost ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                                  {totalFairValue >= totalStockCost ? "+" : ""}{fmt(((totalFairValue - totalStockCost) / totalStockCost) * 100)}%
                                  ({totalFairValue >= totalStockCost ? "+" : ""}${fmt(totalFairValue - totalStockCost)})
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {valuationItems.length === 0 ? (
                      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">No items in stock{valuationDate ? " at this date" : ""}</div>
                    ) : (() => {
                      // Group items by category
                      const grouped = new Map<string, ValuationItem[]>()
                      for (const item of valuationItems) {
                        const key = item.category
                        if (!grouped.has(key)) grouped.set(key, [])
                        grouped.get(key)!.push(item)
                      }
                      const groups = Array.from(grouped.entries())
                      return (
                        <div className="space-y-4">
                          {groups.map(([category, items]) => {
                            const groupCost = items.reduce((s, i) => s + i.totalCost, 0)
                            const groupAskVal = items.reduce((s, i) => {
                              const cw = i.totalWeight - i.soldWeight
                              return s + (i.askingPrice > 0 ? i.askingPrice * cw : 0)
                            }, 0)
                            const groupProfit = groupAskVal > 0 ? groupAskVal - groupCost : 0
                            return (
                              <div key={category} className="bg-white rounded-lg shadow overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700" colSpan={10}>
                                        {category} <span className="text-xs font-normal text-gray-500">({items.length} item{items.length !== 1 ? "s" : ""})</span>
                                      </th>
                                    </tr>
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Subcategory</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">In Stock</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Office</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">On Memo</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Avg/Unit</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ask/Unit</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Asking Value</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Potential Profit</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {items.map(item => {
                                      const unit = unitLabels[item.weightUnit] || "g"
                                      const currentWeight = item.totalWeight - item.soldWeight
                                      const avgPerUnit = currentWeight > 0 ? item.totalCost / currentWeight : 0
                                      const onMemo = item.totalWeight - item.availableWeight - item.soldWeight
                                      const askingValue = item.askingPrice > 0 ? item.askingPrice * currentWeight : 0
                                      const potentialProfit = askingValue > 0 ? askingValue - item.totalCost : 0
                                      return (
                                        <tr key={item.id} className="hover:bg-gray-50">
                                          <td className="px-4 py-2 text-sm font-medium">
                                            <a href={`/inventory/${item.id}`} className="text-blue-600 hover:text-blue-800">{item.name}</a>
                                          </td>
                                          <td className="px-4 py-2 text-sm text-gray-500">{item.subcategory}</td>
                                          <td className="px-4 py-2 text-right text-sm">{currentWeight.toFixed(3)}{unit}</td>
                                          <td className="px-4 py-2 text-right text-sm font-medium">{item.availableWeight.toFixed(3)}{unit}</td>
                                          <td className="px-4 py-2 text-right text-sm text-amber-600">
                                            {onMemo > 0.0005 ? `${onMemo.toFixed(3)}${unit}` : "—"}
                                          </td>
                                          <td className="px-4 py-2 text-right text-sm text-orange-600 font-medium">${fmt(item.totalCost)}</td>
                                          <td className="px-4 py-2 text-right text-sm text-gray-500">${fmt(avgPerUnit)}/{unit}</td>
                                          <td className="px-4 py-2 text-right text-sm text-gray-500">
                                            {editingAsk === item.id ? (
                                              <input type="number" step="0.01" className="w-20 text-right border rounded px-1 py-0.5 text-sm"
                                                value={askValue} onChange={e => setAskValue(e.target.value)} autoFocus
                                                onBlur={() => saveAskingPrice(item, "unit")}
                                                onKeyDown={e => { if (e.key === "Enter") saveAskingPrice(item, "unit"); if (e.key === "Escape") setEditingAsk(null) }}
                                              />
                                            ) : (
                                              <span className="cursor-pointer hover:text-blue-600"
                                                onClick={() => { setEditingAsk(item.id); setAskValue(item.askingPrice > 0 ? item.askingPrice.toString() : "") }}>
                                                {item.askingPrice > 0 ? `$${fmt(item.askingPrice)}/${unit}` : "—"}
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-4 py-2 text-right text-sm text-blue-600 font-medium">
                                            {editingAsk === `${item.id}:total` ? (
                                              <input type="number" step="0.01" className="w-24 text-right border rounded px-1 py-0.5 text-sm"
                                                value={askValue} onChange={e => setAskValue(e.target.value)} autoFocus
                                                onBlur={() => saveAskingPrice(item, "total")}
                                                onKeyDown={e => { if (e.key === "Enter") saveAskingPrice(item, "total"); if (e.key === "Escape") setEditingAsk(null) }}
                                              />
                                            ) : (
                                              <span className="cursor-pointer hover:text-blue-800"
                                                onClick={() => { setEditingAsk(`${item.id}:total`); setAskValue(askingValue > 0 ? askingValue.toFixed(2) : "") }}>
                                                {askingValue > 0 ? `$${fmt(askingValue)}` : "—"}
                                              </span>
                                            )}
                                          </td>
                                          <td className={`px-4 py-2 text-right text-sm font-medium ${potentialProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                            {askingValue > 0 ? `$${fmt(potentialProfit)}` : "—"}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                  <tfoot className="bg-gray-50 font-semibold text-sm">
                                    <tr>
                                      <td className="px-4 py-2" colSpan={5}>Subtotal</td>
                                      <td className="px-4 py-2 text-right text-orange-600">${fmt(groupCost)}</td>
                                      <td className="px-4 py-2" colSpan={2}></td>
                                      <td className="px-4 py-2 text-right text-blue-600">
                                        {groupAskVal > 0 ? `$${fmt(groupAskVal)}` : "—"}
                                      </td>
                                      <td className={`px-4 py-2 text-right ${groupProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                        {groupAskVal > 0 ? `$${fmt(groupProfit)}` : "—"}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )
                          })}
                          {/* Grand total */}
                          <div className="bg-gray-800 text-white rounded-lg shadow p-4 flex justify-between items-center">
                            <span className="font-semibold">Grand Total ({valuationItems.length} items)</span>
                            <div className="flex gap-8 text-sm">
                              <span>Cost: <span className="font-bold">${fmt(totalStockCost)}</span></span>
                              <span>Asking: <span className="font-bold">{totalAskingValue > 0 ? `$${fmt(totalAskingValue)}` : "—"}</span></span>
                              {totalAskingValue > 0 && (
                                <span className={totalAskingValue - totalStockCost >= 0 ? "text-green-400" : "text-red-400"}>
                                  Profit: <span className="font-bold">${fmt(totalAskingValue - totalStockCost)}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })()}
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
