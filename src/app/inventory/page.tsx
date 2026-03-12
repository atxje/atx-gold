"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"

interface DiamondDetails {
  id: string
  shape: string | null
  caratWeight: number | null
  color: string | null
  clarity: string | null
  lab: string | null
  certNumber: string | null
  cutGrade: string | null
  polish: string | null
  symmetry: string | null
  fluorescence: string | null
  measurements: string | null
  costPerCarat: number | null
  rapPrice: number | null
  rapDiscount: number | null
  notes: string | null
}

interface JewelryDetails {
  id: string
  metal: string | null
  brand: string | null
  mainStone: string | null
  costPerGram: number | null
}

interface InventoryItem {
  id: string
  itemCode: string | null
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
  status: "ON_STOCK" | "OUT_ON_MEMO"
  purchases: { id: string }[]
  diamondDetails: DiamondDetails | null
  jewelryDetails: JewelryDetails | null
}

const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

export default function InventoryPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingAsk, setEditingAsk] = useState<string | null>(null)
  const [askValue, setAskValue] = useState("")
  const [filterCats, setFilterCats] = useState<Set<string>>(new Set())
  const [allFilterChips, setAllFilterChips] = useState<{ label: string; key: string }[]>([])
  const [diamondCategoryNames, setDiamondCategoryNames] = useState<Set<string>>(new Set())
  const [jewelryCategoryNames, setJewelryCategoryNames] = useState<Set<string>>(new Set())
  const [goldCategoryNames, setGoldCategoryNames] = useState<Set<string>>(new Set())
  const [silverCategoryNames, setSilverCategoryNames] = useState<Set<string>>(new Set())
  const [diamondSubcatKeys, setDiamondSubcatKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchItems()
      fetch("/api/categories").then(r => r.ok ? r.json() : []).then((cats: { name: string; metalType: string; subcategories: { name: string }[] }[]) => {
        const dCats = cats.filter(c => c.metalType === "DIAMOND")
        setDiamondCategoryNames(new Set(dCats.map(c => c.name)))
        const jCats = cats.filter(c => c.metalType === "JEWELRY")
        setJewelryCategoryNames(new Set(jCats.map(c => c.name)))
        setGoldCategoryNames(new Set(cats.filter(c => c.metalType === "GOLD" || c.metalType === "PLATINUM" || c.metalType === "PALLADIUM").map(c => c.name)))
        setSilverCategoryNames(new Set(cats.filter(c => c.metalType === "SILVER").map(c => c.name)))
        // Build filter chips: non-diamond as-is, diamonds split into "Single Diamond" and "Mixed/Parcels"
        const chips: { label: string; key: string }[] = []
        const dSubKeys = new Set<string>()
        for (const cat of cats) {
          if (cat.metalType === "DIAMOND") {
            const singleSub = cat.subcategories.find(s => s.name.toLowerCase().includes("single"))
            if (singleSub) {
              const key = `${cat.name}::single`
              chips.push({ label: singleSub.name, key })
              dSubKeys.add(key)
            }
            const hasOthers = cat.subcategories.some(s => !s.name.toLowerCase().includes("single"))
            if (hasOthers) {
              const key = `${cat.name}::other`
              chips.push({ label: "Mixed/Parcels", key })
              dSubKeys.add(key)
            }
          } else {
            chips.push({ label: cat.name, key: cat.name })
          }
        }
        setAllFilterChips(chips)
        setDiamondSubcatKeys(dSubKeys)
      })
    }
  }, [session])

  async function fetchItems() {
    setLoading(true)
    const res = await fetch("/api/inventory")
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }

  async function toggleStatus(item: InventoryItem) {
    const newStatus = item.status === "ON_STOCK" ? "OUT_ON_MEMO" : "ON_STOCK"
    setUpdatingStatus(item.id)
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) setItems(items.map(i => i.id === item.id ? { ...i, status: newStatus } : i))
    } finally {
      setUpdatingStatus(null)
    }
  }

  async function saveAskingPrice(item: InventoryItem) {
    const val = parseFloat(askValue)
    if (isNaN(val) || val < 0) { setEditingAsk(null); return }
    await fetch(`/api/inventory/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ askingPrice: val }),
    })
    setItems(items.map(i => i.id === item.id ? { ...i, askingPrice: val } : i))
    setEditingAsk(null)
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    const visible = items.filter(i => (i.totalWeight - i.soldWeight) > 0.0005)
    setSelected(prev => prev.size === visible.length ? new Set() : new Set(visible.map(i => i.id)))
  }

  function navigate(path: string) {
    const ids = Array.from(selected).join(",")
    router.push(`${path}?items=${ids}`)
  }

  const allActive = items.filter(i => (i.totalWeight - i.soldWeight) > 0.0005)

  // Build chip list: DB chips + any inventory categories not in DB
  const chipKeys = new Set(allFilterChips.map(c => c.key))
  const extraChips = Array.from(new Set(items.map(i => i.category))).filter(cat => !chipKeys.has(cat) && !diamondCategoryNames.has(cat)).map(cat => ({ label: cat, key: cat }))
  const uniqueChips = [...allFilterChips, ...extraChips]

  function toggleCatFilter(key: string) {
    setFilterCats(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function itemMatchesFilter(i: InventoryItem): boolean {
    for (const key of filterCats) {
      if (diamondSubcatKeys.has(key)) {
        const [cat, type] = key.split("::")
        if (i.category !== cat) continue
        const isSingle = i.subcategory.toLowerCase().includes("single")
        if (type === "single" && isSingle) return true
        if (type === "other" && !isSingle) return true
      } else {
        if (i.category === key) return true
      }
    }
    return false
  }

  const isFiltered = filterCats.size > 0
  const activeItems = isFiltered ? allActive.filter(itemMatchesFilter) : allActive
  const filteredAll = isFiltered ? items.filter(itemMatchesFilter) : items
  const goldItems = activeItems.filter(i => goldCategoryNames.has(i.category))
  const silverItems = activeItems.filter(i => silverCategoryNames.has(i.category))
  const diamondItems = activeItems.filter(i => diamondCategoryNames.has(i.category))
  const jewelryItems = activeItems.filter(i => jewelryCategoryNames.has(i.category))
  const otherItems = activeItems.filter(i => !goldCategoryNames.has(i.category) && !silverCategoryNames.has(i.category) && !diamondCategoryNames.has(i.category) && !jewelryCategoryNames.has(i.category))
  const totalCost = activeItems.reduce((s, i) => s + i.totalCost, 0)
  const totalSoldValue = filteredAll.reduce((s, i) => s + i.soldValue, 0)
  const totalProfit = filteredAll.reduce((s, i) => s + i.totalProfit, 0)

  if (status === "loading" || !session) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  const askCell = (item: InventoryItem, unit: string) => (
    editingAsk === item.id ? (
      <input
        type="number"
        step="0.01"
        className="w-20 text-right border rounded px-1 py-0.5 text-sm"
        value={askValue}
        onChange={e => setAskValue(e.target.value)}
        onBlur={() => saveAskingPrice(item)}
        onKeyDown={e => { if (e.key === "Enter") saveAskingPrice(item); if (e.key === "Escape") setEditingAsk(null) }}
        autoFocus
      />
    ) : (
      <span
        className="cursor-pointer hover:text-blue-600"
        onClick={() => { setEditingAsk(item.id); setAskValue(item.askingPrice > 0 ? item.askingPrice.toString() : "") }}
      >
        {item.askingPrice > 0 ? `$${item.askingPrice.toFixed(2)}/${unit}` : "—"}
      </span>
    )
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <div className="flex items-center gap-3">
            {selected.size > 0 ? (
              <>
                <span className="text-sm text-gray-500">{selected.size} selected</span>
                <button onClick={() => navigate("/documents/invoices/new")}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
                  + Invoice
                </button>
                <button onClick={() => navigate("/documents/memos/new")}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700">
                  + Memo
                </button>
                <button onClick={() => navigate("/inventory/mix")}
                  className="px-3 py-2 bg-gray-600 text-white rounded-md text-sm font-medium hover:bg-gray-700">
                  Mix / Transfer
                </button>
                <button onClick={() => setSelected(new Set())}
                  className="px-3 py-2 border border-gray-300 text-gray-600 rounded-md text-sm hover:bg-gray-50">
                  Clear
                </button>
              </>
            ) : (
              <>
                <Link href="/inventory/mix" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm">
                  Mix / Transfer
                </Link>
                <Link href="/purchases/new" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
                  + Record Purchase
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl font-bold">{activeItems.length}</div>
            <div className="text-sm text-gray-500">Item Types</div>
          </div>
          <div className="bg-orange-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-orange-600">
              ${totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-sm text-orange-600">Total Cost</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4">
            <div className="text-2xl font-bold text-blue-600">
              ${totalSoldValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-sm text-blue-600">Total Sold</div>
          </div>
          <div className={`rounded-lg shadow p-4 ${totalProfit >= 0 ? "bg-green-50" : "bg-red-50"}`}>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              ${totalProfit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div className={`text-sm ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>Total Profit</div>
          </div>
        </div>

        {/* Category Filters */}
        {!loading && uniqueChips.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Filter:</span>
            <button
              onClick={() => setFilterCats(new Set())}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                !isFiltered
                  ? "bg-gray-800 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {uniqueChips.map(chip => (
              <button
                key={chip.key}
                onClick={() => toggleCatFilter(chip.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filterCats.has(chip.key)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No inventory yet.{" "}
            <Link href="/purchases/new" className="text-blue-600 hover:underline">Record your first purchase</Link>
          </div>
        ) : (
          <div className="space-y-8">
            {[
              { title: "Gold & Platinum", items: goldItems },
              { title: "Silver", items: silverItems },
            ].map(({ title, items: sectionItems }) => sectionItems.length > 0 && (
              <div key={title}>
                <h2 className="text-lg font-semibold text-gray-800 mb-3">{title}</h2>
                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 w-8">
                          <input type="checkbox"
                            checked={sectionItems.length > 0 && sectionItems.every(i => selected.has(i.id))}
                            onChange={() => {
                              const allSelected = sectionItems.every(i => selected.has(i.id))
                              setSelected(prev => {
                                const next = new Set(prev)
                                sectionItems.forEach(i => allSelected ? next.delete(i.id) : next.add(i.id))
                                return next
                              })
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Office</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Memo</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg/Unit</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ask/Unit</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sold</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sectionItems.map((item) => {
                        const unit = unitLabels[item.weightUnit] || "g"
                        const currentWeight = item.totalWeight - item.soldWeight
                        const avgPerUnit = currentWeight > 0 ? item.totalCost / currentWeight : 0
                        const profitPositive = item.totalProfit >= 0
                        return (
                          <tr key={item.id} className={`hover:bg-gray-50 ${selected.has(item.id) ? "bg-blue-50" : ""}`}>
                            <td className="px-4 py-4 w-8">
                              <input type="checkbox" checked={selected.has(item.id)}
                                onChange={() => toggleSelect(item.id)}
                                onClick={e => e.stopPropagation()}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                            </td>
                            <td className="px-4 py-4">
                              <Link href={`/inventory/${item.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                                {item.itemCode ? item.name : (item.subcategory || item.name)}
                              </Link>
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-gray-700">
                              {currentWeight.toFixed(3)}{unit}
                            </td>
                            <td className="px-4 py-4 text-right text-sm font-medium text-gray-900">
                              {item.availableWeight.toFixed(3)}{unit}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-amber-600">
                              {(() => {
                                const onMemo = item.totalWeight - item.availableWeight - item.soldWeight
                                return onMemo > 0.0005 ? `${onMemo.toFixed(3)}${unit}` : "—"
                              })()}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-orange-600 font-medium">
                              ${item.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-gray-500">
                              ${avgPerUnit.toFixed(2)}/{unit}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-gray-500">
                              {askCell(item, unit)}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-gray-500">
                              {item.soldWeight > 0 ? `${item.soldWeight.toFixed(3)}${unit}` : "—"}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-blue-600 font-medium">
                              {item.soldValue > 0 ? `$${item.soldValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                            </td>
                            <td className="px-4 py-4 text-right text-sm font-semibold">
                              {item.soldValue > 0 ? (
                                <span className={profitPositive ? "text-green-600" : "text-red-600"}>
                                  {profitPositive ? "+" : ""}${item.totalProfit.toFixed(2)}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <button
                                onClick={() => toggleStatus(item)}
                                disabled={updatingStatus === item.id}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                                  item.status === "ON_STOCK"
                                    ? "bg-green-100 text-green-800 hover:bg-green-200"
                                    : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                }`}
                              >
                                {item.status === "ON_STOCK" ? "On Stock" : "Out on Memo"}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Total Cost</td>
                        <td className="px-4 py-3 text-left text-sm font-bold text-orange-600">
                          ${sectionItems.reduce((s, i) => s + i.totalCost, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={10} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}

            {/* Other items (categories not matching gold/silver/diamond/jewelry) */}
            {otherItems.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Other</h2>
                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 w-8">
                          <input type="checkbox"
                            checked={otherItems.every(i => selected.has(i.id))}
                            onChange={() => {
                              const allSelected = otherItems.every(i => selected.has(i.id))
                              setSelected(prev => {
                                const next = new Set(prev)
                                otherItems.forEach(i => allSelected ? next.delete(i.id) : next.add(i.id))
                                return next
                              })
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {otherItems.map((item) => {
                        const unit = unitLabels[item.weightUnit] || "g"
                        const currentWeight = item.totalWeight - item.soldWeight
                        const profitPositive = item.totalProfit >= 0
                        return (
                          <tr key={item.id} className={`hover:bg-gray-50 ${selected.has(item.id) ? "bg-blue-50" : ""}`}>
                            <td className="px-4 py-4 w-8">
                              <input type="checkbox" checked={selected.has(item.id)}
                                onChange={() => toggleSelect(item.id)}
                                onClick={e => e.stopPropagation()}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                            </td>
                            <td className="px-4 py-4">
                              <Link href={`/inventory/${item.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                                {item.itemCode ? item.name : (item.subcategory || item.name)}
                              </Link>
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-gray-700">{currentWeight.toFixed(3)}{unit}</td>
                            <td className="px-4 py-4 text-right text-sm text-orange-600 font-medium">${item.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-4 text-right text-sm text-blue-600 font-medium">
                              {item.soldValue > 0 ? `$${item.soldValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                            </td>
                            <td className="px-4 py-4 text-right text-sm font-semibold">
                              {item.soldValue > 0 ? (
                                <span className={profitPositive ? "text-green-600" : "text-red-600"}>
                                  {profitPositive ? "+" : ""}${item.totalProfit.toFixed(2)}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <button onClick={() => toggleStatus(item)} disabled={updatingStatus === item.id}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                                  item.status === "ON_STOCK" ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                }`}>
                                {item.status === "ON_STOCK" ? "On Stock" : "Out on Memo"}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Total Cost</td>
                        <td className="px-4 py-3 text-left text-sm font-bold text-orange-600">
                          ${otherItems.reduce((s, i) => s + i.totalCost, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={5} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Jewelry Table */}
            {jewelryItems.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Jewelry</h2>
                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 w-8">
                          <input type="checkbox"
                            checked={jewelryItems.length > 0 && jewelryItems.every(i => selected.has(i.id))}
                            onChange={() => {
                              const allSelected = jewelryItems.every(i => selected.has(i.id))
                              setSelected(prev => {
                                const next = new Set(prev)
                                jewelryItems.forEach(i => allSelected ? next.delete(i.id) : next.add(i.id))
                                return next
                              })
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metal</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stone</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">$/g</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ask/g</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {jewelryItems.map((item) => {
                        const jd = item.jewelryDetails
                        const currentWeight = item.totalWeight - item.soldWeight
                        const costPerG = currentWeight > 0 ? item.totalCost / currentWeight : (jd?.costPerGram || 0)
                        const profitPositive = item.totalProfit >= 0
                        return (
                          <tr key={item.id} className={`hover:bg-gray-50 ${selected.has(item.id) ? "bg-blue-50" : ""}`}>
                            <td className="px-4 py-4 w-8">
                              <input type="checkbox" checked={selected.has(item.id)}
                                onChange={() => toggleSelect(item.id)}
                                onClick={e => e.stopPropagation()}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                            </td>
                            <td className="px-4 py-4">
                              <Link href={`/inventory/${item.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                                {item.itemCode ? item.name : (item.subcategory || item.name)}
                              </Link>
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-700">{jd?.metal || "—"}</td>
                            <td className="px-3 py-4 text-sm text-gray-700">{jd?.brand || "—"}</td>
                            <td className="px-3 py-4 text-sm text-gray-700">{jd?.mainStone || "—"}</td>
                            <td className="px-4 py-4 text-right text-sm font-medium text-gray-900">
                              {currentWeight.toFixed(2)}g
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-orange-600 font-medium">
                              ${item.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-gray-500">
                              ${costPerG.toFixed(2)}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-gray-500">
                              {askCell(item, "g")}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-blue-600 font-medium">
                              {item.soldValue > 0 ? `$${item.soldValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                            </td>
                            <td className="px-4 py-4 text-right text-sm font-semibold">
                              {item.soldValue > 0 ? (
                                <span className={profitPositive ? "text-green-600" : "text-red-600"}>
                                  {profitPositive ? "+" : ""}${item.totalProfit.toFixed(2)}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <button
                                onClick={() => toggleStatus(item)}
                                disabled={updatingStatus === item.id}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                                  item.status === "ON_STOCK"
                                    ? "bg-green-100 text-green-800 hover:bg-green-200"
                                    : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                }`}
                              >
                                {item.status === "ON_STOCK" ? "On Stock" : "Out on Memo"}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Total Cost</td>
                        <td className="px-4 py-3 text-left text-sm font-bold text-orange-600">
                          ${jewelryItems.reduce((s, i) => s + i.totalCost, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={10} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Diamonds Table */}
            {diamondItems.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-3">Diamonds</h2>
                <div className="bg-white rounded-lg shadow overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 w-8">
                          <input type="checkbox"
                            checked={diamondItems.length > 0 && diamondItems.every(i => selected.has(i.id))}
                            onChange={() => {
                              const allSelected = diamondItems.every(i => selected.has(i.id))
                              setSelected(prev => {
                                const next = new Set(prev)
                                diamondItems.forEach(i => allSelected ? next.delete(i.id) : next.add(i.id))
                                return next
                              })
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shape</th>
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ct</th>
                        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Color</th>
                        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Clarity</th>
                        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cut</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lab / Cert</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">$/ct</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ask/ct</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {diamondItems.map((item) => {
                        const dd = item.diamondDetails
                        const currentWeight = item.totalWeight - item.soldWeight
                        const costPerCt = currentWeight > 0 ? item.totalCost / currentWeight : (dd?.costPerCarat || 0)
                        const profitPositive = item.totalProfit >= 0
                        return (
                          <tr key={item.id} className={`hover:bg-gray-50 ${selected.has(item.id) ? "bg-blue-50" : ""}`}>
                            <td className="px-4 py-4 w-8">
                              <input type="checkbox" checked={selected.has(item.id)}
                                onChange={() => toggleSelect(item.id)}
                                onClick={e => e.stopPropagation()}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                            </td>
                            <td className="px-4 py-4">
                              <Link href={`/inventory/${item.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                                {item.itemCode ? item.name : (item.subcategory || item.name)}
                              </Link>
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-700">
                              {dd?.shape || "—"}
                            </td>
                            <td className="px-3 py-4 text-right text-sm font-medium text-gray-900">
                              {dd?.caratWeight ? dd.caratWeight.toFixed(2) : currentWeight.toFixed(2)}
                            </td>
                            <td className="px-3 py-4 text-center text-sm text-gray-700">
                              {dd?.color || "—"}
                            </td>
                            <td className="px-3 py-4 text-center text-sm text-gray-700">
                              {dd?.clarity || "—"}
                            </td>
                            <td className="px-3 py-4 text-center text-sm text-gray-700">
                              {dd?.cutGrade || "—"}
                            </td>
                            <td className="px-3 py-4 text-sm text-gray-600">
                              {dd?.lab && dd.certNumber
                                ? <span>{dd.lab} <span className="text-gray-400">{dd.certNumber}</span></span>
                                : dd?.lab || "—"}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-orange-600 font-medium">
                              ${item.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-gray-500">
                              ${costPerCt.toFixed(2)}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-gray-500">
                              {askCell(item, "ct")}
                            </td>
                            <td className="px-4 py-4 text-right text-sm text-blue-600 font-medium">
                              {item.soldValue > 0 ? `$${item.soldValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                            </td>
                            <td className="px-4 py-4 text-right text-sm font-semibold">
                              {item.soldValue > 0 ? (
                                <span className={profitPositive ? "text-green-600" : "text-red-600"}>
                                  {profitPositive ? "+" : ""}${item.totalProfit.toFixed(2)}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <button
                                onClick={() => toggleStatus(item)}
                                disabled={updatingStatus === item.id}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                                  item.status === "ON_STOCK"
                                    ? "bg-green-100 text-green-800 hover:bg-green-200"
                                    : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                                }`}
                              >
                                {item.status === "ON_STOCK" ? "On Stock" : "Out on Memo"}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Total Cost</td>
                        <td className="px-4 py-3 text-left text-sm font-bold text-orange-600">
                          ${diamondItems.reduce((s, i) => s + i.totalCost, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={12} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
