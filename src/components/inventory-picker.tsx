"use client"

import { useEffect, useRef, useState } from "react"

export interface PickerInventoryItem {
  id: string
  name: string
  weightUnit: string
  availableWeight: number
  totalCost: number
  totalWeight: number
  quantity?: number
  itemCode?: string | null
  category?: string
  diamondDetails?: { shape?: string; caratWeight?: number; color?: string; clarity?: string; lab?: string; certNumber?: string } | null
  jewelryDetails?: { metal?: string; brand?: string; mainStone?: string } | null
}

const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

function subtitle(item: PickerInventoryItem) {
  if (item.diamondDetails) {
    const d = item.diamondDetails
    const parts = [d.shape, d.caratWeight ? `${d.caratWeight}ct` : "", d.color, d.clarity, item.itemCode].filter(Boolean)
    return parts.length > 0 ? parts.join(" / ") : null
  }
  if (item.jewelryDetails) {
    const j = item.jewelryDetails
    const parts = [j.metal, j.brand, item.itemCode].filter(Boolean)
    return parts.length > 0 ? parts.join(" / ") : null
  }
  return null
}

export function InventoryPickerModal({ inventory, onAdd, onClose, exclude = [], title }: {
  inventory: PickerInventoryItem[]
  onAdd: (ids: string[]) => void
  onClose: () => void
  exclude?: string[]
  title?: string
}) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const available = inventory.filter(i => !exclude.includes(i.id))
  const filtered = search.trim()
    ? available.filter(i => {
        const q = search.toLowerCase()
        return i.name.toLowerCase().includes(q)
          || (i.itemCode && i.itemCode.toLowerCase().includes(q))
          || (i.category && i.category.toLowerCase().includes(q))
          || (subtitle(i) || "").toLowerCase().includes(q)
      })
    : available

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAdd() {
    if (selected.size > 0) onAdd(Array.from(selected))
    onClose()
  }

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={e => { if (e.target === overlayRef.current) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title || "Select Inventory Items"}</h3>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, code, category..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No items found</div>
          )}
          {filtered.map(item => {
            const checked = selected.has(item.id)
            const sub = subtitle(item)
            const unit = unitLabels[item.weightUnit] || "g"
            return (
              <label key={item.id}
                className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-blue-50 transition-colors ${checked ? "bg-blue-50" : ""}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(item.id)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm truncate">{item.name}</span>
                    {item.itemCode && <span className="text-xs text-gray-400 font-mono">{item.itemCode}</span>}
                  </div>
                  {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-medium text-gray-700">{item.availableWeight.toFixed(3)} {unit}</div>
                  <div className="text-xs text-gray-400">available</div>
                </div>
              </label>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <span className="text-sm text-gray-500">
            {selected.size > 0 ? `${selected.size} item${selected.size > 1 ? "s" : ""} selected` : "No items selected"}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" onClick={handleAdd} disabled={selected.size === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Add {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Simple button that opens the picker
export function InventoryPickerButton({ label, onClick }: { label?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">
      {label || "+ Add from Inventory"}
    </button>
  )
}
