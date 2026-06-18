"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useRouter, useParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { format } from "date-fns"

interface DiamondDetails {
  shape: string | null; caratWeight: number | null; color: string | null; clarity: string | null
  lab: string | null; certNumber: string | null; cutGrade: string | null; polish: string | null
  symmetry: string | null; fluorescence: string | null; measurements: string | null
  costPerCarat: number | null; rapPrice: number | null; rapDiscount: number | null; notes: string | null
}
interface JewelryDetails {
  metal: string | null; brand: string | null; mainStone: string | null
  costPerGram: number | null; description: string | null
}
interface WatchDetails {
  brand: string | null; referenceNumber: string | null; serialNumber: string | null
  caseMetal: string | null; caseSizeMM: string | null
  box: boolean; paperwork: boolean; description: string | null
}

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
  diamondDetails: DiamondDetails | null
  jewelryDetails: JewelryDetails | null
  watchDetails: WatchDetails | null
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

const JEWELRY_METALS = ["", "Sterling", "10K", "14K", "18K", "Plat"]
const WATCH_METALS = ["", "SS", "Gold", "Platinum", "Two-Tone", "Titanium", "Ceramic"]
const WATCH_SIZES = ["", "26mm", "28mm", "31mm", "34mm", "36mm", "38mm", "39mm", "40mm", "41mm", "42mm", "44mm", "45mm", "46mm"]
const DIAMOND_SHAPES = ["", "Round", "Princess", "Cushion", "Oval", "Emerald", "Pear", "Marquise", "Radiant", "Asscher", "Heart", "Other"]
const DIAMOND_COLORS = ["", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O-P", "Q-R", "S-Z", "Fancy"]
const DIAMOND_CLARITIES = ["", "FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3"]
const DIAMOND_LABS = ["", "GIA", "AGS", "IGI", "EGL", "HRD", "Other"]
const DIAMOND_GRADES = ["", "Excellent", "Very Good", "Good", "Fair", "Poor"]
const DIAMOND_FLUORESCENCE = ["", "None", "Faint", "Medium", "Strong", "Very Strong"]

// Brand/stone <option> lists from the DB-managed list, preserving any legacy value.
function brandOptions(brands: string[], current: string): string[] {
  const opts = ["", ...brands, "Other"]
  if (current && !opts.includes(current)) opts.push(current)
  return opts
}
function stoneOptions(stones: string[], current: string): string[] {
  const opts = ["", "None", ...stones, "Other"]
  if (current && !opts.includes(current)) opts.push(current)
  return opts
}
const numOrNull = (s: string) => (s.trim() === "" ? null : parseFloat(s) || null)
const strOrNull = (s: string) => (s.trim() === "" ? null : s)

const labelClass = "block text-xs font-medium text-gray-600 mb-1"
const inputClass = "w-full border rounded px-3 py-2 text-sm"

type JewelryForm = { metal: string; brand: string; mainStone: string; costPerGram: string; description: string }
type WatchForm = { brand: string; referenceNumber: string; serialNumber: string; caseMetal: string; caseSizeMM: string; box: boolean; paperwork: boolean; description: string }
type DiamondForm = {
  shape: string; caratWeight: string; color: string; clarity: string; lab: string; certNumber: string
  cutGrade: string; polish: string; symmetry: string; fluorescence: string; measurements: string
  costPerCarat: string; rapPrice: string; rapDiscount: string; notes: string
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

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fWeight, setFWeight] = useState("")
  const [fCost, setFCost] = useState("")
  const [fJewelry, setFJewelry] = useState<JewelryForm>({ metal: "", brand: "", mainStone: "", costPerGram: "", description: "" })
  const [fWatch, setFWatch] = useState<WatchForm>({ brand: "", referenceNumber: "", serialNumber: "", caseMetal: "", caseSizeMM: "", box: false, paperwork: false, description: "" })
  const [fDiamond, setFDiamond] = useState<DiamondForm>({ shape: "", caratWeight: "", color: "", clarity: "", lab: "", certNumber: "", cutGrade: "", polish: "", symmetry: "", fluorescence: "", measurements: "", costPerCarat: "", rapPrice: "", rapDiscount: "", notes: "" })
  const [jewelryBrands, setJewelryBrands] = useState<string[]>([])
  const [watchBrands, setWatchBrands] = useState<string[]>([])
  const [stones, setStones] = useState<string[]>([])

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session && id) {
      setLoading(true)
      fetch(`/api/inventory/${id}`)
        .then(r => r.json())
        .then(data => { setItem(data); setLoading(false) })
      fetch("/api/brands").then(r => r.ok ? r.json() : []).then((bs: { name: string; type: string }[]) => {
        setJewelryBrands(bs.filter(b => b.type === "JEWELRY").map(b => b.name))
        setWatchBrands(bs.filter(b => b.type === "WATCH").map(b => b.name))
        setStones(bs.filter(b => b.type === "STONE").map(b => b.name))
      })
    }
  }, [session, id])

  function startEdit() {
    if (!item) return
    setFWeight(item.totalWeight.toString())
    setFCost(item.totalCost.toString())
    const j = item.jewelryDetails
    setFJewelry({
      metal: j?.metal ?? "", brand: j?.brand ?? "", mainStone: j?.mainStone ?? "",
      costPerGram: j?.costPerGram?.toString() ?? "", description: j?.description ?? "",
    })
    const w = item.watchDetails
    setFWatch({
      brand: w?.brand ?? "", referenceNumber: w?.referenceNumber ?? "", serialNumber: w?.serialNumber ?? "",
      caseMetal: w?.caseMetal ?? "", caseSizeMM: w?.caseSizeMM ?? "",
      box: w?.box ?? false, paperwork: w?.paperwork ?? false, description: w?.description ?? "",
    })
    const d = item.diamondDetails
    setFDiamond({
      shape: d?.shape ?? "", caratWeight: d?.caratWeight?.toString() ?? "", color: d?.color ?? "", clarity: d?.clarity ?? "",
      lab: d?.lab ?? "", certNumber: d?.certNumber ?? "", cutGrade: d?.cutGrade ?? "", polish: d?.polish ?? "",
      symmetry: d?.symmetry ?? "", fluorescence: d?.fluorescence ?? "", measurements: d?.measurements ?? "",
      costPerCarat: d?.costPerCarat?.toString() ?? "", rapPrice: d?.rapPrice?.toString() ?? "", rapDiscount: d?.rapDiscount?.toString() ?? "", notes: d?.notes ?? "",
    })
    setEditing(true)
  }

  async function saveEdit() {
    if (!item) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { totalWeight: fWeight, totalCost: fCost }
      if (item.jewelryDetails) {
        payload.jewelryData = {
          metal: strOrNull(fJewelry.metal), brand: strOrNull(fJewelry.brand), mainStone: strOrNull(fJewelry.mainStone),
          costPerGram: numOrNull(fJewelry.costPerGram), description: strOrNull(fJewelry.description),
        }
      }
      if (item.watchDetails) {
        payload.watchData = {
          brand: strOrNull(fWatch.brand), referenceNumber: strOrNull(fWatch.referenceNumber), serialNumber: strOrNull(fWatch.serialNumber),
          caseMetal: strOrNull(fWatch.caseMetal), caseSizeMM: strOrNull(fWatch.caseSizeMM),
          box: fWatch.box, paperwork: fWatch.paperwork, description: strOrNull(fWatch.description),
        }
      }
      if (item.diamondDetails) {
        payload.diamondData = {
          shape: strOrNull(fDiamond.shape), caratWeight: numOrNull(fDiamond.caratWeight), color: strOrNull(fDiamond.color), clarity: strOrNull(fDiamond.clarity),
          lab: strOrNull(fDiamond.lab), certNumber: strOrNull(fDiamond.certNumber), cutGrade: strOrNull(fDiamond.cutGrade), polish: strOrNull(fDiamond.polish),
          symmetry: strOrNull(fDiamond.symmetry), fluorescence: strOrNull(fDiamond.fluorescence), measurements: strOrNull(fDiamond.measurements),
          costPerCarat: numOrNull(fDiamond.costPerCarat), rapPrice: numOrNull(fDiamond.rapPrice), rapDiscount: numOrNull(fDiamond.rapDiscount), notes: strOrNull(fDiamond.notes),
        }
      }
      const res = await fetch(`/api/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const full = await fetch(`/api/inventory/${id}`).then(r => r.json())
        setItem(full)
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

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
            <div className="flex items-center gap-2">
              {!editing && (
                <button onClick={startEdit}
                  className="px-4 py-2 rounded-full text-sm font-medium bg-blue-100 text-blue-800 hover:bg-blue-200">
                  Edit
                </button>
              )}
              <button onClick={toggleStatus} disabled={updatingStatus}
                className={`px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50 ${item.status === "ON_STOCK" ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-amber-100 text-amber-800 hover:bg-amber-200"}`}>
                {item.status === "ON_STOCK" ? "On Stock" : "Out on Memo"}
              </button>
            </div>
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

        {/* Edit panel */}
        {editing && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Item</h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <label className={labelClass}>Total Weight ({unit})</label>
                <input type="number" step="any" value={fWeight} onChange={e => setFWeight(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Total Cost ($)</label>
                <input type="number" step="any" value={fCost} onChange={e => setFCost(e.target.value)} className={inputClass} />
              </div>
            </div>

            {item.jewelryDetails && (
              <div className="border-t border-gray-100 pt-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Jewelry Details</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Metal</label>
                    <select value={fJewelry.metal} onChange={e => setFJewelry({ ...fJewelry, metal: e.target.value })} className={inputClass}>
                      {JEWELRY_METALS.map(m => <option key={m} value={m}>{m || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Brand</label>
                    <select value={fJewelry.brand} onChange={e => setFJewelry({ ...fJewelry, brand: e.target.value })} className={inputClass}>
                      {brandOptions(jewelryBrands, fJewelry.brand).map(b => <option key={b} value={b}>{b || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Main Stone</label>
                    <select value={fJewelry.mainStone} onChange={e => setFJewelry({ ...fJewelry, mainStone: e.target.value })} className={inputClass}>
                      {stoneOptions(stones, fJewelry.mainStone).map(s => <option key={s} value={s}>{s || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Cost / gram ($)</label>
                    <input type="number" step="any" value={fJewelry.costPerGram} onChange={e => setFJewelry({ ...fJewelry, costPerGram: e.target.value })} className={inputClass} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Description</label>
                    <input value={fJewelry.description} onChange={e => setFJewelry({ ...fJewelry, description: e.target.value })} className={inputClass} />
                  </div>
                </div>
              </div>
            )}

            {item.watchDetails && (
              <div className="border-t border-gray-100 pt-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Watch Details</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Brand</label>
                    <select value={fWatch.brand} onChange={e => setFWatch({ ...fWatch, brand: e.target.value })} className={inputClass}>
                      {brandOptions(watchBrands, fWatch.brand).map(b => <option key={b} value={b}>{b || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Case Metal</label>
                    <select value={fWatch.caseMetal} onChange={e => setFWatch({ ...fWatch, caseMetal: e.target.value })} className={inputClass}>
                      {WATCH_METALS.map(m => <option key={m} value={m}>{m || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Case Size</label>
                    <select value={fWatch.caseSizeMM} onChange={e => setFWatch({ ...fWatch, caseSizeMM: e.target.value })} className={inputClass}>
                      {WATCH_SIZES.map(s => <option key={s} value={s}>{s || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Reference #</label>
                    <input value={fWatch.referenceNumber} onChange={e => setFWatch({ ...fWatch, referenceNumber: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Serial #</label>
                    <input value={fWatch.serialNumber} onChange={e => setFWatch({ ...fWatch, serialNumber: e.target.value })} className={inputClass} />
                  </div>
                  <div className="flex items-end gap-4 pb-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={fWatch.box} onChange={e => setFWatch({ ...fWatch, box: e.target.checked })} /> Box
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={fWatch.paperwork} onChange={e => setFWatch({ ...fWatch, paperwork: e.target.checked })} /> Papers
                    </label>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <label className={labelClass}>Description</label>
                    <input value={fWatch.description} onChange={e => setFWatch({ ...fWatch, description: e.target.value })} className={inputClass} />
                  </div>
                </div>
              </div>
            )}

            {item.diamondDetails && (
              <div className="border-t border-gray-100 pt-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Diamond Details</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className={labelClass}>Shape</label>
                    <select value={fDiamond.shape} onChange={e => setFDiamond({ ...fDiamond, shape: e.target.value })} className={inputClass}>
                      {DIAMOND_SHAPES.map(s => <option key={s} value={s}>{s || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Carat</label>
                    <input type="number" step="any" value={fDiamond.caratWeight} onChange={e => setFDiamond({ ...fDiamond, caratWeight: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Color</label>
                    <select value={fDiamond.color} onChange={e => setFDiamond({ ...fDiamond, color: e.target.value })} className={inputClass}>
                      {DIAMOND_COLORS.map(c => <option key={c} value={c}>{c || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Clarity</label>
                    <select value={fDiamond.clarity} onChange={e => setFDiamond({ ...fDiamond, clarity: e.target.value })} className={inputClass}>
                      {DIAMOND_CLARITIES.map(c => <option key={c} value={c}>{c || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Lab</label>
                    <select value={fDiamond.lab} onChange={e => setFDiamond({ ...fDiamond, lab: e.target.value })} className={inputClass}>
                      {DIAMOND_LABS.map(l => <option key={l} value={l}>{l || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Cert #</label>
                    <input value={fDiamond.certNumber} onChange={e => setFDiamond({ ...fDiamond, certNumber: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Cut</label>
                    <select value={fDiamond.cutGrade} onChange={e => setFDiamond({ ...fDiamond, cutGrade: e.target.value })} className={inputClass}>
                      {DIAMOND_GRADES.map(g => <option key={g} value={g}>{g || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Polish</label>
                    <select value={fDiamond.polish} onChange={e => setFDiamond({ ...fDiamond, polish: e.target.value })} className={inputClass}>
                      {DIAMOND_GRADES.map(g => <option key={g} value={g}>{g || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Symmetry</label>
                    <select value={fDiamond.symmetry} onChange={e => setFDiamond({ ...fDiamond, symmetry: e.target.value })} className={inputClass}>
                      {DIAMOND_GRADES.map(g => <option key={g} value={g}>{g || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Fluorescence</label>
                    <select value={fDiamond.fluorescence} onChange={e => setFDiamond({ ...fDiamond, fluorescence: e.target.value })} className={inputClass}>
                      {DIAMOND_FLUORESCENCE.map(f => <option key={f} value={f}>{f || "–"}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Measurements</label>
                    <input value={fDiamond.measurements} onChange={e => setFDiamond({ ...fDiamond, measurements: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Cost / ct ($)</label>
                    <input type="number" step="any" value={fDiamond.costPerCarat} onChange={e => setFDiamond({ ...fDiamond, costPerCarat: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Rap / ct ($)</label>
                    <input type="number" step="any" value={fDiamond.rapPrice} onChange={e => setFDiamond({ ...fDiamond, rapPrice: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Rap Disc (%)</label>
                    <input type="number" step="any" value={fDiamond.rapDiscount} onChange={e => setFDiamond({ ...fDiamond, rapDiscount: e.target.value })} className={inputClass} />
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <label className={labelClass}>Notes</label>
                    <input value={fDiamond.notes} onChange={e => setFDiamond({ ...fDiamond, notes: e.target.value })} className={inputClass} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={saveEdit} disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button onClick={() => setEditing(false)} disabled={saving}
                className="px-4 py-2 border border-gray-300 text-gray-600 rounded text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}

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
