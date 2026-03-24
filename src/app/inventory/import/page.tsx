"use client"

import React, { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { arrowNav } from "@/lib/table-nav"

interface DiamondData {
  shape: string; caratWeight: string; color: string; clarity: string
  lab: string; certNumber: string; cutGrade: string; polish: string
  symmetry: string; fluorescence: string; measurements: string
  costPerCarat: string; rapPrice: string; rapDiscount: string; notes: string
}

const DIAMOND_SHAPES = ["Round", "Princess", "Cushion", "Oval", "Emerald", "Pear", "Marquise", "Radiant", "Asscher", "Heart", "Other"]
const DIAMOND_COLORS = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O-P", "Q-R", "S-Z", "Fancy"]
const DIAMOND_CLARITIES = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3"]
const DIAMOND_LABS = ["", "GIA", "AGS", "IGI", "EGL", "HRD", "Other"]
const DIAMOND_GRADES = ["", "Excellent", "Very Good", "Good", "Fair", "Poor"]
const DIAMOND_FLUORESCENCE = ["", "None", "Faint", "Medium", "Strong", "Very Strong"]

const emptyDiamondData: DiamondData = {
  shape: "", caratWeight: "", color: "", clarity: "", lab: "", certNumber: "",
  cutGrade: "", polish: "", symmetry: "", fluorescence: "", measurements: "",
  costPerCarat: "", rapPrice: "", rapDiscount: "", notes: "",
}

interface JewelryData {
  metal: string; brand: string; mainStone: string
  weight: string; costPerGram: string; totalPrice: string
}

const JEWELRY_METALS = ["Sterling", "10K", "14K", "18K", "Plat"]
const JEWELRY_BRANDS = ["", "T&Co", "DY", "JA", "Cartier", "VCA", "Other"]
const JEWELRY_STONES = ["", "None", "Diamond", "Sapphire", "Ruby", "Tanzanite", "Topaz", "Other"]

const emptyJewelryData: JewelryData = {
  metal: "", brand: "", mainStone: "", weight: "", costPerGram: "", totalPrice: "",
}

interface LineItem {
  id: number
  category: string
  subcategory: string
  quantity: string
  weight: string
  pricePerUnit: string
  cost: string
  description: string
  lastEdited: "pricePerUnit" | "cost"
  diamondData?: DiamondData
  jewelryData?: JewelryData
  itemCode?: string
  weightUnit?: string
}

interface CategoryDef {
  label: string
  metalType: string
  weightUnit: string
  unitLabel: string
  subcategories: string[]
}

const unitLabelMap: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

function newLineItem(id: number): LineItem {
  return { id, category: "", subcategory: "", quantity: "", weight: "", pricePerUnit: "", cost: "", description: "", lastEdited: "cost" }
}

const cellClass = "border-r border-gray-200 last:border-r-0 px-1 py-1"
const inputClass = "w-full px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:bg-blue-50 rounded"
const numInputClass = inputClass + " text-right"
const selectClass = "w-full px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:bg-blue-50 rounded"

const DIAMOND_COL_HEADERS = [
  "Shape", "Size (ct)", "Lab", "Cert #", "Color", "Clarity",
  "Fluor.", "Cut", "Polish", "Sym.", "$/ct", "Disc %", "Total",
]

const JEWELRY_COL_HEADERS = [
  "Metal", "Brand", "Main Stone", "Weight (g)", "$/g", "Total",
]

export default function ImportStockPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [categories, setCategories] = useState<Record<string, CategoryDef>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Regular items
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem(1)])
  const [nextId, setNextId] = useState(2)
  const tableBodyRef = useRef<HTMLTableSectionElement>(null)
  const [focusLastRow, setFocusLastRow] = useState(false)

  // Diamond items
  const [showDiamonds, setShowDiamonds] = useState(false)
  const [diamondItems, setDiamondItems] = useState<LineItem[]>([])
  const [giaLoading, setGiaLoading] = useState<Record<number, boolean>>({})

  // Jewelry items
  const [showJewelry, setShowJewelry] = useState(false)
  const [jewelryItems, setJewelryItems] = useState<LineItem[]>([])

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetch("/api/categories").then(r => r.ok ? r.json() : []).then((cats: { id: string; name: string; metalType: string; weightUnit: string; subcategories: { name: string }[] }[]) => {
        const map: Record<string, CategoryDef> = {}
        cats.forEach(c => {
          map[c.id] = {
            label: c.name,
            metalType: c.metalType,
            weightUnit: c.weightUnit,
            unitLabel: unitLabelMap[c.weightUnit] || "g",
            subcategories: c.subcategories.map(s => s.name),
          }
        })
        setCategories(map)
      })
    }
  }, [session])

  useEffect(() => {
    if (focusLastRow && tableBodyRef.current) {
      const rows = tableBodyRef.current.querySelectorAll("tr")
      const last = rows[rows.length - 1]
      if (last) {
        const firstInput = last.querySelector("select, input") as HTMLElement
        firstInput?.focus()
      }
      setFocusLastRow(false)
    }
  }, [focusLastRow, lineItems])

  // Filter categories for each section
  const regularCategories = Object.entries(categories).filter(([, c]) => c.metalType !== "DIAMOND" && c.metalType !== "JEWELRY")
  const diamondCategories = Object.entries(categories).filter(([, c]) => c.metalType === "DIAMOND")
  const jewelryCategories = Object.entries(categories).filter(([, c]) => c.metalType === "JEWELRY")

  function updateLineItem(items: LineItem[], setItems: (items: LineItem[]) => void, id: number, field: string, value: string) {
    setItems(items.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }

      if (field === "category") {
        updated.subcategory = ""
        updated.weight = ""
        updated.pricePerUnit = ""
        updated.cost = ""
        const catDef = categories[value]
        if (catDef) updated.weightUnit = catDef.weightUnit
      }

      if (field === "weight" || field === "pricePerUnit" || field === "cost") {
        if (field === "pricePerUnit") updated.lastEdited = "pricePerUnit"
        if (field === "cost") updated.lastEdited = "cost"

        const w = parseFloat(field === "weight" ? value : updated.weight) || 0
        const ppu = parseFloat(field === "pricePerUnit" ? value : updated.pricePerUnit) || 0
        const total = parseFloat(field === "cost" ? value : updated.cost) || 0

        if (field === "weight") {
          if (updated.lastEdited === "pricePerUnit" && ppu > 0) {
            updated.cost = (w * ppu).toFixed(2)
          } else if (total > 0 && w > 0) {
            updated.pricePerUnit = (total / w).toFixed(2)
          }
        } else if (field === "pricePerUnit") {
          if (w > 0) updated.cost = (w * ppu).toFixed(2)
        } else if (field === "cost") {
          if (w > 0) updated.pricePerUnit = (total / w).toFixed(2)
        }
      }

      return updated
    }))
  }

  function addRow(items: LineItem[], setItems: (items: LineItem[]) => void) {
    const id = nextId
    setNextId(nextId + 1)
    setItems([...items, newLineItem(id)])
    setFocusLastRow(true)
  }

  function removeRow(items: LineItem[], setItems: (items: LineItem[]) => void, id: number) {
    if (items.length <= 1) return
    setItems(items.filter(i => i.id !== id))
  }

  // Diamond-specific functions
  function addDiamondRow() {
    const id = nextId
    setNextId(nextId + 1)
    const item = newLineItem(id)
    item.diamondData = { ...emptyDiamondData }
    if (diamondCategories.length === 1) {
      item.category = diamondCategories[0][0]
      item.weightUnit = diamondCategories[0][1].weightUnit
    }
    setDiamondItems([...diamondItems, item])
  }

  function updateDiamondField(id: number, field: string, value: string) {
    setDiamondItems(diamondItems.map(item => {
      if (item.id !== id) return item
      const dd = { ...item.diamondData!, [field]: value }

      if (field === "caratWeight" || field === "costPerCarat") {
        const ct = parseFloat(field === "caratWeight" ? value : dd.caratWeight) || 0
        const cpc = parseFloat(field === "costPerCarat" ? value : dd.costPerCarat) || 0
        if (ct > 0 && cpc > 0) {
          const total = ct * cpc
          return { ...item, diamondData: dd, weight: ct.toString(), cost: total.toFixed(2), pricePerUnit: cpc.toFixed(2) }
        }
      }

      return { ...item, diamondData: dd }
    }))
  }

  async function fetchGIA(id: number) {
    const item = diamondItems.find(i => i.id === id)
    if (!item?.diamondData?.certNumber) return
    setGiaLoading(prev => ({ ...prev, [id]: true }))
    try {
      const res = await fetch(`/api/gia?reportNumber=${item.diamondData.certNumber}`)
      if (!res.ok) throw new Error("GIA lookup failed")
      const data = await res.json()
      if (data.results?.[0]) {
        const r = data.results[0]
        setDiamondItems(prev => prev.map(i => {
          if (i.id !== id) return i
          const dd = { ...i.diamondData! }
          if (r.data?.SHAPE) dd.shape = r.data.SHAPE.charAt(0).toUpperCase() + r.data.SHAPE.slice(1).toLowerCase()
          if (r.data?.WEIGHT) dd.caratWeight = r.data.WEIGHT.toString()
          if (r.data?.COLOR_GRADE) dd.color = r.data.COLOR_GRADE
          if (r.data?.CLARITY_GRADE) dd.clarity = r.data.CLARITY_GRADE
          if (r.data?.CUT_GRADE) dd.cutGrade = r.data.CUT_GRADE.charAt(0).toUpperCase() + r.data.CUT_GRADE.slice(1).toLowerCase()
          if (r.data?.POLISH) dd.polish = r.data.POLISH.charAt(0).toUpperCase() + r.data.POLISH.slice(1).toLowerCase()
          if (r.data?.SYMMETRY) dd.symmetry = r.data.SYMMETRY.charAt(0).toUpperCase() + r.data.SYMMETRY.slice(1).toLowerCase()
          if (r.data?.FLUORESCENCE_INTENSITY) dd.fluorescence = r.data.FLUORESCENCE_INTENSITY.charAt(0).toUpperCase() + r.data.FLUORESCENCE_INTENSITY.slice(1).toLowerCase()
          if (r.data?.MEASUREMENTS) dd.measurements = r.data.MEASUREMENTS
          dd.lab = "GIA"
          return { ...i, diamondData: dd, weight: dd.caratWeight || i.weight }
        }))
      }
    } catch (err) {
      console.error("GIA fetch error:", err)
    } finally {
      setGiaLoading(prev => ({ ...prev, [id]: false }))
    }
  }

  // Jewelry-specific functions
  function addJewelryRow() {
    const id = nextId
    setNextId(nextId + 1)
    const item = newLineItem(id)
    item.jewelryData = { ...emptyJewelryData }
    if (jewelryCategories.length === 1) {
      item.category = jewelryCategories[0][0]
      item.weightUnit = jewelryCategories[0][1].weightUnit
    }
    setJewelryItems([...jewelryItems, item])
  }

  function updateJewelryField(id: number, field: string, value: string) {
    setJewelryItems(jewelryItems.map(item => {
      if (item.id !== id) return item
      const jd = { ...item.jewelryData!, [field]: value }

      if (field === "weight" || field === "costPerGram" || field === "totalPrice") {
        const w = parseFloat(field === "weight" ? value : jd.weight) || 0
        const cpg = parseFloat(field === "costPerGram" ? value : jd.costPerGram) || 0
        const total = parseFloat(field === "totalPrice" ? value : jd.totalPrice) || 0

        if (field === "weight" && cpg > 0) jd.totalPrice = (w * cpg).toFixed(2)
        else if (field === "costPerGram" && w > 0) jd.totalPrice = (w * cpg).toFixed(2)
        else if (field === "totalPrice" && w > 0) jd.costPerGram = (total / w).toFixed(2)

        return { ...item, jewelryData: jd, weight: jd.weight, cost: jd.totalPrice }
      }

      return { ...item, jewelryData: jd }
    }))
  }

  async function handleSubmit() {
    setError("")
    setSuccess("")

    // Collect all filled items
    const allItems: {
      category: string; subcategory: string; metalType: string; weightUnit: string
      weight: number; cost: number; quantity: number; description?: string
      diamondData?: Record<string, unknown>; jewelryData?: Record<string, unknown>
    }[] = []

    // Regular items
    for (const item of lineItems) {
      const w = parseFloat(item.weight) || 0
      const c = parseFloat(item.cost) || 0
      if (w === 0 && c === 0) continue
      if (!item.category || !item.subcategory) {
        setError("All items need a category and type")
        return
      }
      const catDef = categories[item.category]
      allItems.push({
        category: catDef?.label || item.category,
        subcategory: item.subcategory,
        metalType: catDef?.metalType || "OTHER",
        weightUnit: catDef?.weightUnit || "GRAM",
        weight: w,
        cost: c,
        quantity: parseInt(item.quantity) || 0,
        description: item.description || undefined,
      })
    }

    // Diamond items
    for (const item of diamondItems) {
      const w = parseFloat(item.weight || item.diamondData?.caratWeight || "0") || 0
      const c = parseFloat(item.cost) || 0
      if (w === 0 && c === 0) continue
      if (!item.subcategory) {
        setError("All diamond items need a type")
        return
      }
      const catDef = item.category ? categories[item.category] : diamondCategories[0]?.[1]
      const dd = item.diamondData!
      allItems.push({
        category: catDef?.label || "Single Diamonds",
        subcategory: item.subcategory,
        metalType: "DIAMOND",
        weightUnit: catDef?.weightUnit || "CARAT",
        weight: w,
        cost: c,
        quantity: parseInt(item.quantity) || 0,
        diamondData: {
          shape: dd.shape || undefined,
          caratWeight: parseFloat(dd.caratWeight) || undefined,
          color: dd.color || undefined,
          clarity: dd.clarity || undefined,
          lab: dd.lab || undefined,
          certNumber: dd.certNumber || undefined,
          cutGrade: dd.cutGrade || undefined,
          polish: dd.polish || undefined,
          symmetry: dd.symmetry || undefined,
          fluorescence: dd.fluorescence || undefined,
          measurements: dd.measurements || undefined,
          costPerCarat: parseFloat(dd.costPerCarat) || undefined,
          rapPrice: parseFloat(dd.rapPrice) || undefined,
          rapDiscount: parseFloat(dd.rapDiscount) || undefined,
          notes: dd.notes || undefined,
        },
      })
    }

    // Jewelry items
    for (const item of jewelryItems) {
      const jd = item.jewelryData!
      const w = parseFloat(jd.weight) || 0
      const c = parseFloat(jd.totalPrice) || 0
      if (w === 0 && c === 0) continue
      if (!item.subcategory) {
        setError("All jewelry items need a type")
        return
      }
      const catDef = item.category ? categories[item.category] : jewelryCategories[0]?.[1]
      allItems.push({
        category: catDef?.label || "Jewelry",
        subcategory: item.subcategory,
        metalType: "JEWELRY",
        weightUnit: "GRAM",
        weight: w,
        cost: c,
        quantity: parseInt(item.quantity) || 0,
        jewelryData: {
          metal: jd.metal || undefined,
          brand: jd.brand || undefined,
          mainStone: jd.mainStone || undefined,
          costPerGram: parseFloat(jd.costPerGram) || undefined,
        },
      })
    }

    if (allItems.length === 0) {
      setError("Add at least one item with weight or cost")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/inventory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: allItems }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Import failed")
      }

      const data = await res.json()
      setSuccess(`Imported ${data.imported} item(s) successfully`)
      // Reset form
      setLineItems([newLineItem(1)])
      setDiamondItems([])
      setJewelryItems([])
      setShowDiamonds(false)
      setShowJewelry(false)
      setNextId(2)

      setTimeout(() => router.push("/inventory"), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setLoading(false)
    }
  }

  if (status === "loading") return null

  const regularTotal = lineItems.reduce((s, i) => s + (parseFloat(i.cost) || 0), 0)
  const diamondTotal = diamondItems.reduce((s, i) => s + (parseFloat(i.cost) || 0), 0)
  const jewelryTotal = jewelryItems.reduce((s, i) => s + (parseFloat(i.jewelryData?.totalPrice || "0") || 0), 0)
  const grandTotal = regularTotal + diamondTotal + jewelryTotal

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Insert Stock</h1>
            <p className="text-sm text-gray-500 mt-1">Add existing inventory without a purchase record</p>
          </div>
          <button onClick={() => router.push("/inventory")} className="text-sm text-gray-500 hover:text-gray-700">
            Back to Inventory
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md text-sm">{success}</div>}

        {/* Regular Items Table */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Items</h2>
            <span className="text-xs text-gray-400">
              Total: ${regularTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                  <th className={cellClass + " w-8"}>#</th>
                  <th className={cellClass + " text-left"}>Category</th>
                  <th className={cellClass + " text-left"}>Type</th>
                  <th className={cellClass + " text-left w-40"}>Description</th>
                  <th className={cellClass + " text-right w-16"}>Qty</th>
                  <th className={cellClass + " text-right w-24"}>Weight</th>
                  <th className={cellClass + " text-right w-24"}>$/Unit</th>
                  <th className={cellClass + " text-right w-28"}>Total Cost</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody ref={tableBodyRef}>
                {lineItems.map((item, idx) => {
                  const catDef = categories[item.category]
                  const unitLabel = catDef?.unitLabel || "g"
                  return (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50" onKeyDown={e => arrowNav(e as unknown as React.KeyboardEvent<HTMLInputElement>)}>
                      <td className={cellClass + " text-center text-xs text-gray-400"}>{idx + 1}</td>
                      <td className={cellClass}>
                        <select value={item.category} onChange={e => updateLineItem(lineItems, setLineItems, item.id, "category", e.target.value)} className={selectClass}>
                          <option value="">Select...</option>
                          {regularCategories.map(([id, c]) => (
                            <option key={id} value={id}>{c.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className={cellClass}>
                        <select value={item.subcategory} onChange={e => updateLineItem(lineItems, setLineItems, item.id, "subcategory", e.target.value)} className={selectClass} disabled={!item.category}>
                          <option value="">Select...</option>
                          {catDef?.subcategories.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className={cellClass}>
                        <input value={item.description} onChange={e => updateLineItem(lineItems, setLineItems, item.id, "description", e.target.value)} className={inputClass} placeholder="Optional" />
                      </td>
                      <td className={cellClass}>
                        <input type="number" value={item.quantity} onChange={e => updateLineItem(lineItems, setLineItems, item.id, "quantity", e.target.value)} className={numInputClass} min="0" step="1" placeholder="0" />
                      </td>
                      <td className={cellClass}>
                        <div className="flex items-center">
                          <input type="number" value={item.weight} onChange={e => updateLineItem(lineItems, setLineItems, item.id, "weight", e.target.value)} className={numInputClass} min="0" step="any" />
                          <span className="text-xs text-gray-400 ml-1 w-5">{unitLabel}</span>
                        </div>
                      </td>
                      <td className={cellClass}>
                        <input type="number" value={item.pricePerUnit} onChange={e => updateLineItem(lineItems, setLineItems, item.id, "pricePerUnit", e.target.value)} className={numInputClass} min="0" step="any" />
                      </td>
                      <td className={cellClass}>
                        <input type="number" value={item.cost} onChange={e => updateLineItem(lineItems, setLineItems, item.id, "cost", e.target.value)} className={numInputClass} min="0" step="any" />
                      </td>
                      <td className="px-1">
                        {lineItems.length > 1 && (
                          <button onClick={() => removeRow(lineItems, setLineItems, item.id)} className="text-red-400 hover:text-red-600 text-xs">×</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100">
            <button onClick={() => addRow(lineItems, setLineItems)} className="text-sm text-blue-600 hover:text-blue-800">+ Add Row</button>
          </div>
        </div>

        {/* Diamond / Jewelry section toggles */}
        <div className="flex gap-4 mb-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showDiamonds} onChange={e => {
              setShowDiamonds(e.target.checked)
              if (e.target.checked && diamondItems.length === 0) addDiamondRow()
            }} className="rounded border-gray-300" />
            Single Diamonds
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showJewelry} onChange={e => {
              setShowJewelry(e.target.checked)
              if (e.target.checked && jewelryItems.length === 0) addJewelryRow()
            }} className="rounded border-gray-300" />
            Jewelry
          </label>
        </div>

        {/* Diamonds Table */}
        {showDiamonds && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Single Diamonds</h2>
              <span className="text-xs text-gray-400">
                Total: ${diamondTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                    <th className={cellClass + " w-8"}>#</th>
                    <th className={cellClass + " text-left"}>Type</th>
                    {DIAMOND_COL_HEADERS.map(h => (
                      <th key={h} className={cellClass + " text-left"}>{h}</th>
                    ))}
                    <th className={cellClass + " text-left"}>GIA</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {diamondItems.map((item, idx) => {
                    const dd = item.diamondData!
                    const catDef = item.category ? categories[item.category] : diamondCategories[0]?.[1]
                    return (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className={cellClass + " text-center text-xs text-gray-400"}>{idx + 1}</td>
                        <td className={cellClass}>
                          <select value={item.subcategory} onChange={e => setDiamondItems(diamondItems.map(i => i.id === item.id ? { ...i, subcategory: e.target.value } : i))} className={selectClass}>
                            <option value="">Select...</option>
                            {catDef?.subcategories.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className={cellClass}>
                          <select value={dd.shape} onChange={e => updateDiamondField(item.id, "shape", e.target.value)} className={selectClass}>
                            <option value="">–</option>
                            {DIAMOND_SHAPES.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className={cellClass}><input type="number" value={dd.caratWeight} onChange={e => updateDiamondField(item.id, "caratWeight", e.target.value)} className={numInputClass} step="any" /></td>
                        <td className={cellClass}>
                          <select value={dd.lab} onChange={e => updateDiamondField(item.id, "lab", e.target.value)} className={selectClass}>
                            {DIAMOND_LABS.map(l => <option key={l} value={l}>{l || "–"}</option>)}
                          </select>
                        </td>
                        <td className={cellClass}><input value={dd.certNumber} onChange={e => updateDiamondField(item.id, "certNumber", e.target.value)} className={inputClass} placeholder="Cert #" /></td>
                        <td className={cellClass}>
                          <select value={dd.color} onChange={e => updateDiamondField(item.id, "color", e.target.value)} className={selectClass}>
                            <option value="">–</option>
                            {DIAMOND_COLORS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className={cellClass}>
                          <select value={dd.clarity} onChange={e => updateDiamondField(item.id, "clarity", e.target.value)} className={selectClass}>
                            <option value="">–</option>
                            {DIAMOND_CLARITIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className={cellClass}>
                          <select value={dd.fluorescence} onChange={e => updateDiamondField(item.id, "fluorescence", e.target.value)} className={selectClass}>
                            {DIAMOND_FLUORESCENCE.map(f => <option key={f} value={f}>{f || "–"}</option>)}
                          </select>
                        </td>
                        <td className={cellClass}>
                          <select value={dd.cutGrade} onChange={e => updateDiamondField(item.id, "cutGrade", e.target.value)} className={selectClass}>
                            {DIAMOND_GRADES.map(g => <option key={g} value={g}>{g || "–"}</option>)}
                          </select>
                        </td>
                        <td className={cellClass}>
                          <select value={dd.polish} onChange={e => updateDiamondField(item.id, "polish", e.target.value)} className={selectClass}>
                            {DIAMOND_GRADES.map(g => <option key={g} value={g}>{g || "–"}</option>)}
                          </select>
                        </td>
                        <td className={cellClass}>
                          <select value={dd.symmetry} onChange={e => updateDiamondField(item.id, "symmetry", e.target.value)} className={selectClass}>
                            {DIAMOND_GRADES.map(g => <option key={g} value={g}>{g || "–"}</option>)}
                          </select>
                        </td>
                        <td className={cellClass}><input type="number" value={dd.costPerCarat} onChange={e => updateDiamondField(item.id, "costPerCarat", e.target.value)} className={numInputClass} step="any" /></td>
                        <td className={cellClass}><input type="number" value={dd.rapDiscount} onChange={e => updateDiamondField(item.id, "rapDiscount", e.target.value)} className={numInputClass} step="any" placeholder="%" /></td>
                        <td className={cellClass}><input type="number" value={item.cost} onChange={e => setDiamondItems(diamondItems.map(i => i.id === item.id ? { ...i, cost: e.target.value } : i))} className={numInputClass} step="any" /></td>
                        <td className={cellClass}>
                          <button
                            onClick={() => fetchGIA(item.id)}
                            disabled={!dd.certNumber || giaLoading[item.id]}
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-40 whitespace-nowrap"
                          >
                            {giaLoading[item.id] ? "..." : "Fetch"}
                          </button>
                        </td>
                        <td className="px-1">
                          <button onClick={() => { setDiamondItems(diamondItems.filter(i => i.id !== item.id)) }} className="text-red-400 hover:text-red-600 text-xs">×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-100">
              <button onClick={addDiamondRow} className="text-sm text-blue-600 hover:text-blue-800">+ Add Diamond</button>
            </div>
          </div>
        )}

        {/* Jewelry Table */}
        {showJewelry && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Jewelry</h2>
              <span className="text-xs text-gray-400">
                Total: ${jewelryTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                    <th className={cellClass + " w-8"}>#</th>
                    <th className={cellClass + " text-left"}>Type</th>
                    {JEWELRY_COL_HEADERS.map(h => (
                      <th key={h} className={cellClass + " text-left"}>{h}</th>
                    ))}
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {jewelryItems.map((item, idx) => {
                    const jd = item.jewelryData!
                    const catDef = item.category ? categories[item.category] : jewelryCategories[0]?.[1]
                    return (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className={cellClass + " text-center text-xs text-gray-400"}>{idx + 1}</td>
                        <td className={cellClass}>
                          <select value={item.subcategory} onChange={e => setJewelryItems(jewelryItems.map(i => i.id === item.id ? { ...i, subcategory: e.target.value } : i))} className={selectClass}>
                            <option value="">Select...</option>
                            {catDef?.subcategories.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className={cellClass}>
                          <select value={jd.metal} onChange={e => updateJewelryField(item.id, "metal", e.target.value)} className={selectClass}>
                            <option value="">–</option>
                            {JEWELRY_METALS.map(m => <option key={m}>{m}</option>)}
                          </select>
                        </td>
                        <td className={cellClass}>
                          <select value={jd.brand} onChange={e => updateJewelryField(item.id, "brand", e.target.value)} className={selectClass}>
                            {JEWELRY_BRANDS.map(b => <option key={b} value={b}>{b || "–"}</option>)}
                          </select>
                        </td>
                        <td className={cellClass}>
                          <select value={jd.mainStone} onChange={e => updateJewelryField(item.id, "mainStone", e.target.value)} className={selectClass}>
                            {JEWELRY_STONES.map(s => <option key={s} value={s}>{s || "–"}</option>)}
                          </select>
                        </td>
                        <td className={cellClass}><input type="number" value={jd.weight} onChange={e => updateJewelryField(item.id, "weight", e.target.value)} className={numInputClass} step="any" /></td>
                        <td className={cellClass}><input type="number" value={jd.costPerGram} onChange={e => updateJewelryField(item.id, "costPerGram", e.target.value)} className={numInputClass} step="any" /></td>
                        <td className={cellClass}><input type="number" value={jd.totalPrice} onChange={e => updateJewelryField(item.id, "totalPrice", e.target.value)} className={numInputClass} step="any" /></td>
                        <td className="px-1">
                          <button onClick={() => setJewelryItems(jewelryItems.filter(i => i.id !== item.id))} className="text-red-400 hover:text-red-600 text-xs">×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-100">
              <button onClick={addJewelryRow} className="text-sm text-blue-600 hover:text-blue-800">+ Add Jewelry</button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-700">
            Grand Total: <span className="text-lg font-bold text-gray-900">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Insert to Inventory"}
          </button>
        </div>
      </div>
    </div>
  )
}
