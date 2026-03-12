"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { format, startOfWeek, startOfMonth, startOfYear, isAfter } from "date-fns"

interface Purchase {
  id: string
  purchaseNumber: string | null
  description: string
  metalType: string
  weight: number
  weightUnit: string
  purity: string | null
  pricePaid: number
  purchaseDate: string
  notes: string | null
  lead: {
    id: string
    name: string
    phone: string | null
    email: string | null
  }
  user: {
    name: string | null
    email: string
  }
}

interface MetalStats {
  count: number
  totalValue: number
  totalWeight: number
  avgPerGram: number
}

const metalColors: Record<string, string> = {
  GOLD: "bg-yellow-100 text-yellow-800",
  SILVER: "bg-gray-100 text-gray-800",
  PLATINUM: "bg-blue-100 text-blue-800",
  PALLADIUM: "bg-purple-100 text-purple-800",
  OTHER: "bg-green-100 text-green-800",
}

const metalLabels: Record<string, string> = {
  GOLD: "Gold",
  SILVER: "Silver",
  PLATINUM: "Platinum",
  PALLADIUM: "Palladium",
  OTHER: "Other",
}

export default function PurchasesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [metalFilter, setMetalFilter] = useState("")
  const [dateRange, setDateRange] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchPurchases()
    }
  }, [session, metalFilter])

  async function fetchPurchases() {
    setLoading(true)
    const params = new URLSearchParams()
    if (metalFilter) params.set("metalType", metalFilter)

    const res = await fetch(`/api/purchases?${params}`)
    if (res.ok) {
      const data = await res.json()
      setPurchases(data)
    }
    setLoading(false)
  }

const filteredPurchases = useMemo(() => {
    if (!dateRange) return purchases

    const now = new Date()
    let startDate: Date

    switch (dateRange) {
      case "week":
        startDate = startOfWeek(now)
        break
      case "month":
        startDate = startOfMonth(now)
        break
      case "year":
        startDate = startOfYear(now)
        break
      default:
        return purchases
    }

    return purchases.filter(p => isAfter(new Date(p.purchaseDate), startDate))
  }, [purchases, dateRange])

  const totalValue = filteredPurchases.reduce((sum, p) => sum + p.pricePaid, 0)
  const totalWeight = filteredPurchases.reduce((sum, p) => sum + p.weight, 0)
  const avgPerGram = totalWeight > 0 ? totalValue / totalWeight : 0

  // Group by purchase document (same purchaseNumber or same lead+date)
  const purchaseDocCount = useMemo(() => {
    const seen = new Set<string>()
    for (const p of filteredPurchases) {
      seen.add(p.purchaseNumber || `${p.lead.id}_${p.purchaseDate.split("T")[0]}`)
    }
    return seen.size
  }, [filteredPurchases])

  const avgPurchase = purchaseDocCount > 0 ? totalValue / purchaseDocCount : 0

  const metalStats = useMemo(() => {
    const stats: Record<string, MetalStats> = {}
    // Count documents per metal (a multi-item purchase counts as 1 per metal type present)
    const docMetalSeen: Record<string, Set<string>> = {}

    for (const p of filteredPurchases) {
      if (!stats[p.metalType]) {
        stats[p.metalType] = { count: 0, totalValue: 0, totalWeight: 0, avgPerGram: 0 }
        docMetalSeen[p.metalType] = new Set()
      }
      const docKey = p.purchaseNumber || `${p.lead.id}_${p.purchaseDate.split("T")[0]}`
      docMetalSeen[p.metalType].add(docKey)
      stats[p.metalType].totalValue += p.pricePaid
      stats[p.metalType].totalWeight += p.weight
    }

    for (const metal of Object.keys(stats)) {
      stats[metal].count = docMetalSeen[metal].size
      stats[metal].avgPerGram = stats[metal].totalWeight > 0
        ? stats[metal].totalValue / stats[metal].totalWeight
        : 0
    }

    return stats
  }, [filteredPurchases])

  if (status === "loading" || !session) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
          <Link
            href="/purchases/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Record Purchase
          </Link>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold">{purchaseDocCount}</div>
            <div className="text-sm text-gray-500">Total Purchases</div>
          </div>
          <div className="bg-green-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-green-600">
              ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-sm text-green-600">Total Spent</div>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-yellow-600">
              {totalWeight.toFixed(1)}g
            </div>
            <div className="text-sm text-yellow-600">Total Weight</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-blue-600">
              ${avgPurchase.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-sm text-blue-600">Avg Purchase</div>
          </div>
        </div>

        {/* Metal Breakdown */}
        {Object.keys(metalStats).length > 0 && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="text-lg font-semibold mb-4">Breakdown by Metal</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="pb-2">Metal</th>
                    <th className="pb-2 text-right">Purchases</th>
                    <th className="pb-2 text-right">Total Value</th>
                    <th className="pb-2 text-right">Total Weight</th>
                    <th className="pb-2 text-right">Avg $/gram</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(metalStats)
                    .sort((a, b) => b[1].totalValue - a[1].totalValue)
                    .map(([metal, stats]) => (
                      <tr key={metal}>
                        <td className="py-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${metalColors[metal]}`}>
                            {metalLabels[metal] || metal}
                          </span>
                        </td>
                        <td className="py-2 text-right">{stats.count}</td>
                        <td className="py-2 text-right font-medium">
                          ${stats.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 text-right">{stats.totalWeight.toFixed(1)}g</td>
                        <td className="py-2 text-right text-green-600 font-medium">
                          ${stats.avgPerGram.toFixed(2)}/g
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex flex-wrap gap-4">
            <select
              value={metalFilter}
              onChange={(e) => setMetalFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Metals</option>
              <option value="GOLD">Gold</option>
              <option value="SILVER">Silver</option>
              <option value="PLATINUM">Platinum</option>
              <option value="PALLADIUM">Palladium</option>
              <option value="OTHER">Other</option>
            </select>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Time</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
          </div>
        </div>

        {/* Purchases List */}
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : filteredPurchases.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            {purchases.length === 0 ? (
              <>No purchases recorded.{" "}<Link href="/purchases/new" className="text-blue-600 hover:underline">Record your first purchase</Link></>
            ) : "No purchases match the selected filters."}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purchase #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seller</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Paid</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {(() => {
                  const seen = new Set<string>()
                  const rows: Purchase[] = []
                  for (const p of filteredPurchases) {
                    const key = p.purchaseNumber || `${p.lead.id}_${p.purchaseDate.split("T")[0]}`
                    if (!seen.has(key)) {
                      rows.push(p)
                      seen.add(key)
                    }
                  }
                  return rows.map(p => {
                    const key = p.purchaseNumber || `${p.lead.id}_${p.purchaseDate.split("T")[0]}`
                    const group = filteredPurchases.filter(x =>
                      (x.purchaseNumber || `${x.lead.id}_${x.purchaseDate.split("T")[0]}`) === key
                    )
                    const total = group.reduce((s, x) => s + x.pricePaid, 0)
                    const itemSummary = group.length === 1
                      ? p.description
                      : group.map(x => x.description).join(", ")
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/purchases/${p.id}`)}>
                        <td className="px-6 py-4 text-sm font-semibold text-amber-600">{p.purchaseNumber || "—"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {format(new Date(p.purchaseDate), "MMM d, yyyy")}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{p.lead.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                          {itemSummary}
                          {group.length > 1 && <span className="ml-2 text-xs text-gray-400">({group.length} items)</span>}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-bold text-amber-600">
                          ${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
