"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { InventoryPickerModal } from "@/components/inventory-picker"

interface InventoryItem {
  id: string
  name: string
  category: string
  subcategory: string
  weightUnit: string
  totalWeight: number
  availableWeight: number
  totalCost: number
}

interface SourceRow {
  id: number
  inventoryItemId: string
  weight: string
  costPerUnit: string
  totalCost: string
  lastEdited: "costPerUnit" | "totalCost"
}

const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

const categories = {
  "GOLD_JEWELRY": { label: "Gold Jewelry", weightUnit: "GRAM", subcategories: ["10K", "14K", "18K", "21K+"] },
  "SILVER":       { label: "Silver",       weightUnit: "GRAM", subcategories: ["Sterling Jewelry", "Silverware"] },
  "COINS_SILVER": { label: "Coins/Bars - Silver", weightUnit: "TROY_OZ", subcategories: ["Silver Eagles", "Silver Buffalo", "Generics"] },
  "COINS_GOLD":   { label: "Coins/Bars - Gold",   weightUnit: "TROY_OZ", subcategories: ["Gold Eagle", "Gold Maple", "Krugerrand", "PAMP", "VALCAMBI", "Credit Suisse", "Centenario"] },
}

let rowCounter = 1

function newRow(): SourceRow {
  return { id: rowCounter++, inventoryItemId: "", weight: "", costPerUnit: "", totalCost: "", lastEdited: "totalCost" }
}

export default function MixPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [sources, setSources] = useState<SourceRow[]>([newRow()])
  const [destType, setDestType] = useState<"existing" | "new">("existing")
  const [destItemId, setDestItemId] = useState("")
  const [destCategory, setDestCategory] = useState("")
  const [destSubcategory, setDestSubcategory] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
  const [destPickerOpen, setDestPickerOpen] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (!session) return
    const preselectedIds = searchParams.get("items")?.split(",").filter(Boolean) || []
    fetch("/api/inventory").then(r => r.json()).then((inv: InventoryItem[]) => {
      setInventory(inv)
      if (preselectedIds.length > 0) {
        const rows = preselectedIds.map(id => {
          const item = inv.find((x: InventoryItem) => x.id === id)
          if (!item) return newRow()
          const avgCpu = item.totalWeight > 0 ? item.totalCost / item.totalWeight : 0
          const w = item.availableWeight
          return { id: rowCounter++, inventoryItemId: id, weight: w.toFixed(3), costPerUnit: avgCpu.toFixed(4), totalCost: (avgCpu * w).toFixed(2), lastEdited: "costPerUnit" as const }
        })
        setSources(rows)
      }
    })
  }, [session, searchParams])

  function selectSource(rowId: number, itemId: string) {
    const item = inventory.find(i => i.id === itemId)
    setSources(prev => prev.map(r => {
      if (r.id !== rowId) return r
      if (!item) return { ...r, inventoryItemId: "", weight: "", costPerUnit: "", totalCost: "" }
      const avgCpu = item.totalWeight > 0 ? item.totalCost / item.totalWeight : 0
      const w = item.availableWeight
      return {
        ...r,
        inventoryItemId: itemId,
        weight: w.toFixed(3),
        costPerUnit: avgCpu.toFixed(4),
        totalCost: (avgCpu * w).toFixed(2),
        lastEdited: "costPerUnit",
      }
    }))
  }

  function addSourcesFromInventory(ids: string[]) {
    const newRows: SourceRow[] = []
    for (const invId of ids) {
      if (sources.some(r => r.inventoryItemId === invId)) continue
      const item = inventory.find(i => i.id === invId)
      if (!item) continue
      const avgCpu = item.totalWeight > 0 ? item.totalCost / item.totalWeight : 0
      const w = item.availableWeight
      newRows.push({
        id: rowCounter++,
        inventoryItemId: invId,
        weight: w.toFixed(3),
        costPerUnit: avgCpu.toFixed(4),
        totalCost: (avgCpu * w).toFixed(2),
        lastEdited: "costPerUnit",
      })
    }
    if (newRows.length > 0) {
      setSources(prev => {
        const hasOnlyEmpty = prev.length === 1 && !prev[0].inventoryItemId
        return hasOnlyEmpty ? newRows : [...prev, ...newRows]
      })
    }
  }

  function updateSource(rowId: number, field: "weight" | "costPerUnit" | "totalCost", value: string) {
    setSources(prev => prev.map(r => {
      if (r.id !== rowId) return r
      const item = inventory.find(i => i.id === r.inventoryItemId)
      const maxCost = item?.totalCost ?? Infinity
      const updated = { ...r, [field]: value }
      const w = parseFloat(field === "weight" ? value : r.weight) || 0
      if (field === "costPerUnit") {
        updated.lastEdited = "costPerUnit"
        const cpu = parseFloat(value) || 0
        if (w > 0 && cpu > 0) {
          const computed = cpu * w
          const capped = Math.min(computed, maxCost)
          updated.totalCost = capped.toFixed(2)
          if (computed > maxCost) updated.costPerUnit = (capped / w).toFixed(4)
        }
      } else if (field === "totalCost") {
        updated.lastEdited = "totalCost"
        const raw = parseFloat(value) || 0
        const tc = Math.min(raw, maxCost)
        if (raw > maxCost) updated.totalCost = tc.toFixed(2)
        if (w > 0 && tc > 0) updated.costPerUnit = (tc / w).toFixed(4)
      } else if (field === "weight") {
        const wNew = parseFloat(value) || 0
        if (r.lastEdited === "costPerUnit") {
          const cpu = parseFloat(r.costPerUnit) || 0
          if (wNew > 0 && cpu > 0) {
            const computed = cpu * wNew
            const capped = Math.min(computed, maxCost)
            updated.totalCost = capped.toFixed(2)
            if (computed > maxCost) updated.costPerUnit = (capped / wNew).toFixed(4)
          }
        } else {
          const tc = Math.min(parseFloat(r.totalCost) || 0, maxCost)
          if (wNew > 0 && tc > 0) updated.costPerUnit = (tc / wNew).toFixed(4)
        }
      }
      return updated
    }))
  }

  const sourceItemIds = sources.map(r => r.inventoryItemId).filter(Boolean)
  const totalWeight = sources.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0)
  const totalCost = sources.reduce((s, r) => s + (parseFloat(r.totalCost) || 0), 0)
  const destCat = destCategory ? categories[destCategory as keyof typeof categories] : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    for (const src of sources) {
      if (!src.inventoryItemId || !src.weight || !src.totalCost)
        return setError("Fill in all source rows")
      const item = inventory.find(i => i.id === src.inventoryItemId)
      if (item && parseFloat(src.weight) > item.availableWeight + 0.0001)
        return setError(`Weight exceeds available for "${item.name}"`)
    }
    if (destType === "existing" && !destItemId) return setError("Select a destination item")
    if (destType === "new" && (!destCategory || !destSubcategory)) return setError("Select category and type for new item")

    setLoading(true)
    try {
      const res = await fetch("/api/inventory/mix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: sources.map(r => ({
            inventoryItemId: r.inventoryItemId,
            weight: parseFloat(r.weight),
            totalCost: parseFloat(r.totalCost),
          })),
          destination: destType === "existing"
            ? { type: "existing", inventoryItemId: destItemId }
            : { type: "new", category: destCategory, subcategory: destSubcategory, weightUnit: destCat?.weightUnit || "GRAM" },
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      router.push("/inventory")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const cellClass = "border-r border-gray-200 last:border-r-0 px-2 py-1"
  const inputClass = "w-full px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:bg-blue-50 rounded"
  const numClass = inputClass + " text-right"

  if (status === "loading" || !session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-sm">&larr; Back</button>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Mix / Transfer</h1>
          <p className="text-sm text-gray-500 mt-1">Move weight and cost from one or more items into another item.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

          {/* Sources */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <div>
                <span className="text-sm font-semibold text-gray-700">Transfer From</span>
                <span className="ml-2 text-xs text-gray-400">Items being reduced</span>
              </div>
              <button type="button" onClick={() => setSourcePickerOpen(true)}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">
                + Add from Inventory
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["Item", "Weight", "Cost / Unit", "Total Cost"].map(h => (
                      <th key={h} className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2`}>{h}</th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sources.map(row => {
                    const item = inventory.find(i => i.id === row.inventoryItemId)
                    const unit = item ? unitLabels[item.weightUnit] || "g" : "g"
                    const transferWeight = parseFloat(row.weight) || 0
                    const transferCost = parseFloat(row.totalCost) || 0
                    const remainWeight = item ? item.availableWeight - transferWeight : 0
                    const remainCost = item ? item.totalCost - transferCost : 0
                    const remainCpu = remainWeight > 0 ? remainCost / remainWeight : 0
                    return (
                      <tr key={row.id} className="hover:bg-gray-50 group">
                        <td className={`${cellClass} align-top pt-2`}>
                          <div className="min-w-[160px] px-2 py-1.5 text-sm text-gray-700 truncate">
                            {item ? item.name : <span className="text-gray-300 italic">—</span>}
                          </div>
                        </td>
                        <td className={`${cellClass} align-top pt-1`}>
                          <div className="flex items-center gap-1 min-w-[110px]">
                            <input type="number" step="0.0001" placeholder="0.000" value={row.weight}
                              onChange={e => updateSource(row.id, "weight", e.target.value)}
                              className={numClass} />
                            <span className="text-xs text-gray-400 whitespace-nowrap">{unit}</span>
                          </div>
                          {item && transferWeight > 0 && (
                            <div className="text-xs text-right pr-1 space-y-0.5 mt-0.5">
                              <div className="text-gray-400">of {item.availableWeight.toFixed(3)} avail</div>
                              <div className="text-blue-500">→ {remainWeight.toFixed(3)} remaining</div>
                            </div>
                          )}
                        </td>
                        <td className={`${cellClass} align-top pt-1`}>
                          <div className="flex items-center gap-0.5 min-w-[110px]">
                            <span className="text-gray-400 text-sm">$</span>
                            <input type="number" step="0.0001" placeholder="0.0000" value={row.costPerUnit}
                              onChange={e => updateSource(row.id, "costPerUnit", e.target.value)}
                              className={numClass} />
                            <span className="text-xs text-gray-400">/{unit}</span>
                          </div>
                          {item && transferWeight > 0 && (
                            <div className="text-xs text-right pr-1 mt-0.5 text-blue-500">
                              → ${remainCpu.toFixed(4)}/{unit} remaining
                            </div>
                          )}
                        </td>
                        <td className={`${cellClass} align-top pt-1`}>
                          <div className="flex items-center gap-0.5 min-w-[100px]">
                            <span className="text-gray-400 text-sm">$</span>
                            <input type="number" step="0.01" placeholder="0.00" value={row.totalCost}
                              onChange={e => updateSource(row.id, "totalCost", e.target.value)}
                              className={numClass + " font-medium"} />
                          </div>
                          {item && transferCost > 0 && (
                            <div className="text-xs text-right mt-0.5 space-y-0.5">
                              <div className="text-gray-400">of ${item.totalCost.toFixed(2)} total</div>
                              <div className="text-blue-500">→ ${remainCost.toFixed(2)} remaining</div>
                            </div>
                          )}
                        </td>
                        <td className="px-2 text-center align-top pt-2 w-8">
                          {sources.length > 1 && (
                            <button type="button" onClick={() => setSources(p => p.filter(r => r.id !== row.id))}
                              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none">
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Totals</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-gray-700">
                      {totalWeight.toFixed(3)}
                    </td>
                    <td />
                    <td className="px-4 py-2 text-right text-sm font-bold text-amber-600">
                      ${totalCost.toFixed(2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="flex flex-col items-center text-gray-400">
              <div className="w-0.5 h-6 bg-gray-300" />
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <div className="text-xs font-medium text-gray-500 mt-1">
                {totalWeight > 0 && `${totalWeight.toFixed(3)} · $${totalCost.toFixed(2)}`}
              </div>
            </div>
          </div>

          {/* Destination */}
          <div className="bg-white rounded-lg shadow overflow-visible">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-gray-700">Transfer Into</span>
                <span className="ml-2 text-xs text-gray-400">Item receiving the weight & cost</span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDestType("existing")}
                  className={`px-3 py-1.5 rounded text-xs font-medium ${destType === "existing" ? "bg-blue-600 text-white" : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                  Existing Item
                </button>
                <button type="button" onClick={() => { setDestType("new"); setDestItemId("") }}
                  className={`px-3 py-1.5 rounded text-xs font-medium ${destType === "new" ? "bg-blue-600 text-white" : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                  New Item
                </button>
              </div>
            </div>

            <div className="p-5 min-h-[200px]">
              {destType === "existing" ? (
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Select Item</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[38px]">
                        {destItemId ? inventory.find(i => i.id === destItemId)?.name || "—" : <span className="text-gray-400">No item selected</span>}
                      </div>
                      <button type="button" onClick={() => setDestPickerOpen(true)}
                        className="px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 whitespace-nowrap">
                        Choose
                      </button>
                    </div>
                  </div>
                  {destItemId && (() => {
                    const item = inventory.find(i => i.id === destItemId)!
                    const unit = unitLabels[item.weightUnit] || "g"
                    const avgCpu = item.totalWeight > 0 ? item.totalCost / item.totalWeight : 0
                    const newTotalWeight = item.totalWeight + totalWeight
                    const newTotalCost = item.totalCost + totalCost
                    const newAvgCpu = newTotalWeight > 0 ? newTotalCost / newTotalWeight : 0
                    return (
                      <div className="text-sm text-gray-500 grid grid-cols-2 gap-x-8 gap-y-1">
                        <div>Weight now: <span className="font-medium text-gray-800">{item.availableWeight.toFixed(3)} {unit}</span></div>
                        <div>Total cost now: <span className="font-medium text-gray-800">${item.totalCost.toFixed(2)}</span></div>
                        <div>Weight after: <span className="font-medium text-blue-600">{(item.availableWeight + totalWeight).toFixed(3)} {unit}</span></div>
                        <div>Total cost after: <span className="font-medium text-blue-600">${newTotalCost.toFixed(2)}</span></div>
                        <div className="col-span-2">
                          Avg cost/unit: <span className="font-medium text-amber-600">${newAvgCpu.toFixed(4)}/{unit}</span>
                          <span className="text-xs text-gray-400 ml-2">(was ${avgCpu.toFixed(4)})</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Category *</label>
                    <select required value={destCategory} onChange={e => { setDestCategory(e.target.value); setDestSubcategory("") }}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                      <option value="">Select…</option>
                      {Object.entries(categories).map(([key, c]) => (
                        <option key={key} value={key}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type *</label>
                    <select required value={destSubcategory} onChange={e => setDestSubcategory(e.target.value)}
                      disabled={!destCategory}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:opacity-40">
                      <option value="">Select…</option>
                      {destCat?.subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {destCategory && destSubcategory && (
                    <div className="col-span-2 text-sm text-gray-500">
                      Will create: <span className="font-medium text-gray-800">{destSubcategory} {destCat?.label}</span> with {totalWeight.toFixed(3)} {unitLabels[destCat?.weightUnit || "GRAM"]} · ${totalCost.toFixed(2)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? "Processing…" : "Mix / Transfer"}
            </button>
          </div>
        </form>

        {sourcePickerOpen && (
          <InventoryPickerModal
            inventory={inventory}
            exclude={sourceItemIds}
            onAdd={addSourcesFromInventory}
            onClose={() => setSourcePickerOpen(false)}
            title="Select Source Items"
          />
        )}

        {destPickerOpen && (
          <InventoryPickerModal
            inventory={inventory}
            exclude={sourceItemIds}
            onAdd={ids => { if (ids[0]) setDestItemId(ids[0]); }}
            onClose={() => setDestPickerOpen(false)}
            title="Select Destination Item"
          />
        )}
      </main>
    </div>
  )
}
