"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { arrowNav } from "@/lib/table-nav"
import { InventoryPickerModal } from "@/components/inventory-picker"

interface InventoryItem {
  id: string
  name: string
  weightUnit: string
  availableWeight: number
  totalCost: number
  totalWeight: number
  quantity: number
  itemCode?: string | null
  category?: string
  diamondDetails?: { shape?: string; caratWeight?: number; color?: string; clarity?: string; lab?: string; certNumber?: string } | null
  jewelryDetails?: { metal?: string; brand?: string; mainStone?: string } | null
}

interface Customer {
  id: string
  name: string
  address: string | null
  phone: string | null
  contactPerson: string | null
  salesTax: boolean
}

interface LineItem {
  id: number
  dbId?: string
  dbWeight?: number
  section?: "regular" | "diamond" | "jewelry"
  inventoryItemId: string
  description: string
  quantity: string
  weight: string
  pricePerUnit: string
  totalPrice: string
  lastEdited: "pricePerUnit" | "totalPrice"
  costPerUnit?: number
}

// Column definitions
interface ColDef {
  key: string
  label: string
  removable: boolean
  defaultVisible: boolean
}

const ALL_COLUMNS: ColDef[] = [
  { key: "item",        label: "Item",        removable: false, defaultVisible: true },
  { key: "description", label: "Description", removable: true,  defaultVisible: true },
  { key: "quantity",    label: "Qty",         removable: true,  defaultVisible: true },
  { key: "weight",      label: "Weight",      removable: false, defaultVisible: true },
  { key: "pricePerUnit",label: "Price/Unit",  removable: true,  defaultVisible: true },
  { key: "totalPrice",  label: "Total Price", removable: false, defaultVisible: true },
  { key: "costPerUnit", label: "Cost/Unit",   removable: false, defaultVisible: true },
  { key: "totalCost",   label: "Total Cost",  removable: false, defaultVisible: true },
]

const STORAGE_KEY = "invoice-columns"

const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

function newItem(id: number): LineItem {
  return { id, inventoryItemId: "", description: "", quantity: "", weight: "", pricePerUnit: "", totalPrice: "", lastEdited: "totalPrice" }
}

function loadVisibleCols(): Record<string, boolean> {
  if (typeof window === "undefined") return {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.defaultVisible]))
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <NewInvoiceContent />
    </Suspense>
  )
}

function NewInvoiceContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("editId")
  const isTransfer = searchParams.get("type") === "transfer"
  const memoItemIds = searchParams.get("memoItems")?.split(",").filter(Boolean) || []
  const rawItems = searchParams.get("items")?.split(",").filter(Boolean) || []
  // items may be plain IDs or "id:weight:pricePerUnit:totalPrice" encoded from memo
  const preselectedIds = rawItems.map(s => s.split(":")[0])
  const preselectedData: Record<string, { weight: string; pricePerUnit: string; totalPrice: string }> = {}
  rawItems.forEach(s => {
    const [id, weight, ppu, total] = s.split(":")
    if (weight && ppu && total) preselectedData[id] = { weight, pricePerUnit: ppu, totalPrice: total }
  })

  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [buyerName, setBuyerName] = useState(searchParams.get("buyerName") || "")
  const [buyerEmail, setBuyerEmail] = useState(searchParams.get("buyerEmail") || "")
  const [buyerPhone, setBuyerPhone] = useState(searchParams.get("buyerPhone") || "")
  const [buyerAddress, setBuyerAddress] = useState("")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState("")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [lineItems, setLineItems] = useState<LineItem[]>([newItem(1)])
  const [nextId, setNextId] = useState(2)
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(loadVisibleCols)
  const [showColMenu, setShowColMenu] = useState(false)
  const [hideCost, setHideCost] = useState(false)
  const [originalDbIds, setOriginalDbIds] = useState<string[]>([])
  const colMenuRef = useRef<HTMLDivElement>(null)
  const [focusLastRow, setFocusLastRow] = useState(false)
  const tableBodyRef = useRef<HTMLTableSectionElement>(null)
  const [showDiamonds, setShowDiamonds] = useState(false)
  const [showJewelry, setShowJewelry] = useState(false)
  const [focusSection, setFocusSection] = useState<"regular" | "diamond" | "jewelry" | null>(null)
  const diamondBodyRef = useRef<HTMLTableSectionElement>(null)
  const jewelryBodyRef = useRef<HTMLTableSectionElement>(null)
  const [pickerOpen, setPickerOpen] = useState<"regular" | "diamond" | "jewelry" | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session) {
      const fetches: Promise<unknown>[] = [
        fetch("/api/inventory").then(r => r.json()),
        fetch("/api/customers").then(r => r.json()),
      ]
      if (editId) fetches.push(fetch(`/api/invoices/${editId}`).then(r => r.json()))
      Promise.all(fetches).then((results) => {
        const inv = results[0] as InventoryItem[]
        const cust = results[1] as Customer[]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoice = results[2] as any
        setInventory(inv)
        setCustomers(cust)

        let loadedRows: LineItem[] | null = null
        if (invoice && editId) {
          setBuyerName(invoice.buyerName)
          setBuyerEmail(invoice.buyerEmail || "")
          setBuyerPhone(invoice.buyerPhone || "")
          setBuyerAddress(invoice.buyerAddress || "")
          setDate(new Date(invoice.date).toISOString().split("T")[0])
          setNotes(invoice.notes || "")
          setInvoiceNumber(invoice.invoiceNumber)
          const rows: LineItem[] = invoice.items.map((item: { id: string; inventoryItemId: string; description: string; quantity?: number; weight: number; pricePerUnit: number; totalPrice: number; costBasis?: number }, i: number) => {
            const invItem = inv.find(x => x.id === item.inventoryItemId)
            const section: "regular" | "diamond" | "jewelry" = invItem?.diamondDetails ? "diamond" : invItem?.jewelryDetails ? "jewelry" : "regular"
            return {
              id: i + 1,
              dbId: item.id,
              dbWeight: item.weight,
              section,
              inventoryItemId: item.inventoryItemId,
              description: item.description,
              quantity: (item.quantity ?? 0).toString(),
              weight: item.weight.toString(),
              pricePerUnit: item.pricePerUnit.toString(),
              totalPrice: item.totalPrice.toString(),
              lastEdited: "totalPrice" as const,
              costPerUnit: item.costBasis && item.weight > 0 ? item.costBasis / item.weight : 0,
            }
          })
          setLineItems(rows)
          setNextId(rows.length + 1)
          setOriginalDbIds(invoice.items.map((item: { id: string }) => item.id))
          loadedRows = rows
        } else if (preselectedIds.length > 0) {
          const rows = preselectedIds.map((id, i) => {
            const item = (inv as InventoryItem[]).find(x => x.id === id)
            if (!item) return newItem(i + 1)
            const pre = preselectedData[id]
            return {
              id: i + 1,
              inventoryItemId: id,
              description: item.name,
              quantity: item.quantity > 0 ? item.quantity.toString() : "",
              weight: pre?.weight || item.availableWeight.toString(),
              pricePerUnit: pre?.pricePerUnit || "",
              totalPrice: pre?.totalPrice || "",
              lastEdited: "totalPrice" as const,
            }
          })
          setLineItems(rows)
          setNextId(rows.length + 1)
          loadedRows = rows
        }

        // Auto-enable diamond/jewelry sections if loaded items belong to those categories
        if (loadedRows) {
          const hasDiamond = loadedRows.some(r => { const x = inv.find(i => i.id === r.inventoryItemId); return !!x?.diamondDetails })
          const hasJewelry = loadedRows.some(r => { const x = inv.find(i => i.id === r.inventoryItemId); return !!x?.jewelryDetails })
          if (hasDiamond) setShowDiamonds(true)
          if (hasJewelry) setShowJewelry(true)
        }
      })
    }
  }, [session, editId])

  // Close col menu on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setShowColMenu(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [])

  useEffect(() => {
    if (focusLastRow && tableBodyRef.current) {
      setFocusLastRow(false)
      const rows = tableBodyRef.current.querySelectorAll("tr")
      const lastRow = rows[rows.length - 1]
      lastRow?.querySelector<HTMLInputElement>("input")?.focus()
    }
  }, [focusLastRow, lineItems])

  useEffect(() => {
    if (!focusSection) return
    const ref = focusSection === "diamond" ? diamondBodyRef : focusSection === "jewelry" ? jewelryBodyRef : tableBodyRef
    if (ref.current) {
      setFocusSection(null)
      const rows = ref.current.querySelectorAll("tr")
      const lastRow = rows[rows.length - 1]
      lastRow?.querySelector<HTMLInputElement>("input")?.focus()
    }
  }, [focusSection, lineItems])

  function toggleCol(key: string) {
    const next = { ...visibleCols, [key]: !visibleCols[key] }
    setVisibleCols(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function handleCustomerSelect(id: string) {
    setSelectedCustomerId(id)
    if (!id) return
    const c = customers.find(c => c.id === id)
    if (!c) return
    setBuyerName(c.name)
    setBuyerPhone(c.phone || "")
    setBuyerAddress(c.address || "")
    setBuyerEmail("")
  }

  function addItem() {
    setLineItems([...lineItems, newItem(nextId)])
    setNextId(nextId + 1)
  }

  function addItemAndFocus() {
    setLineItems(prev => [...prev, newItem(nextId)])
    setNextId(prev => prev + 1)
    setFocusLastRow(true)
  }

  function addSectionItem(section: "regular" | "diamond" | "jewelry") {
    setLineItems(prev => [...prev, { ...newItem(nextId), section }])
    setNextId(prev => prev + 1)
    setFocusSection(section)
  }

  function addFromInventory(ids: string[], section: "regular" | "diamond" | "jewelry") {
    const newItems: LineItem[] = []
    let id = nextId
    for (const invId of ids) {
      // Skip if already in line items
      if (lineItems.some(li => li.inventoryItemId === invId)) continue
      const inv = inventory.find(i => i.id === invId)
      if (!inv) continue
      newItems.push({
        ...newItem(id++),
        section,
        inventoryItemId: invId,
        description: inv.name,
        quantity: inv.quantity > 0 ? inv.quantity.toString() : "",
        weight: inv.availableWeight.toString(),
      })
    }
    if (newItems.length > 0) {
      // Replace the empty placeholder row if it's the only one and has no data
      setLineItems(prev => {
        const hasOnlyEmpty = prev.length === 1 && !prev[0].inventoryItemId && !prev[0].weight && !prev[0].totalPrice
        return hasOnlyEmpty ? newItems : [...prev, ...newItems]
      })
      setNextId(id)
    }
  }

  function removeItem(id: number) {
    if (lineItems.length > 1 || editId) setLineItems(lineItems.filter(i => i.id !== id))
  }

  function updateItem(id: number, field: keyof LineItem, value: string) {
    setLineItems(lineItems.map(item => {
      if (item.id !== id) return item
      const updated = { ...item, [field]: value }

      if (field === "inventoryItemId") {
        const inv = inventory.find(i => i.id === value)
        updated.description = inv?.name || ""
        updated.quantity = inv ? (inv.quantity > 0 ? inv.quantity.toString() : "") : ""
        updated.weight = inv ? inv.availableWeight.toString() : ""
        updated.pricePerUnit = ""
        updated.totalPrice = ""
        return updated
      }

      const w = parseFloat(field === "weight" ? value : item.weight) || 0
      if (field === "pricePerUnit") {
        updated.lastEdited = "pricePerUnit"
        const ppu = parseFloat(value) || 0
        if (w > 0 && ppu > 0) updated.totalPrice = (ppu * w).toFixed(2)
      } else if (field === "totalPrice") {
        updated.lastEdited = "totalPrice"
        const total = parseFloat(value) || 0
        if (w > 0 && total > 0) updated.pricePerUnit = (total / w).toFixed(4)
      } else if (field === "weight") {
        const wNew = parseFloat(value) || 0
        if (item.lastEdited === "pricePerUnit") {
          const ppu = parseFloat(item.pricePerUnit) || 0
          if (wNew > 0 && ppu > 0) updated.totalPrice = (ppu * wNew).toFixed(2)
        } else {
          const total = parseFloat(item.totalPrice) || 0
          if (wNew > 0 && total > 0) updated.pricePerUnit = (total / wNew).toFixed(4)
        }
      }
      return updated
    }))
  }

  const grandTotal = lineItems.reduce((s, i) => s + (parseFloat(i.totalPrice) || 0), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      for (const item of lineItems) {
        if (!item.inventoryItemId || !item.weight || !item.totalPrice) throw new Error("Fill in all required item fields")
        const inv = inventory.find(i => i.id === item.inventoryItemId)
        // Skip weight check when converting from memo — API restores availableWeight before decrementing
        if (inv && !memoItemIds.length) {
          // When editing, the item's original weight is already deducted from availableWeight, so add it back for comparison
          const effectiveAvailable = inv.availableWeight + (item.dbWeight ?? 0)
          if (parseFloat(item.weight) > effectiveAvailable) {
            throw new Error(`Weight for "${inv.name}" exceeds available (${effectiveAvailable.toFixed(3)} ${unitLabels[inv.weightUnit]})`)
          }
        }
      }
      if (editId) {
        const keptDbIds = lineItems.filter(i => i.dbId).map(i => i.dbId!)
        const removedIds = originalDbIds.filter(id => !keptDbIds.includes(id))
        const newLineItems = lineItems.filter(i => !i.dbId && i.inventoryItemId && i.weight && i.totalPrice)
        const res = await fetch(`/api/invoices/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyerName, buyerEmail, buyerPhone, buyerAddress, date, notes,
            removeItemIds: removedIds.length > 0 ? removedIds : undefined,
            items: lineItems.filter(i => i.dbId).map(item => ({
              id: item.dbId,
              description: item.description,
              quantity: parseInt(item.quantity) || 0,
              weight: parseFloat(item.weight),
              pricePerUnit: parseFloat(item.pricePerUnit) || 0,
              totalPrice: parseFloat(item.totalPrice),
            })),
            newItems: newLineItems.length > 0 ? newLineItems.map(item => {
              const inv = inventory.find(i => i.id === item.inventoryItemId)
              return {
                inventoryItemId: item.inventoryItemId,
                description: item.description,
                quantity: parseInt(item.quantity) || 0,
                weight: parseFloat(item.weight),
                weightUnit: inv?.weightUnit || "GRAM",
                pricePerUnit: parseFloat(item.pricePerUnit) || 0,
                totalPrice: parseFloat(item.totalPrice),
              }
            }) : undefined,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error || "Failed to save invoice")
        const data = await res.json()
        if (data.deleted) { router.push("/documents"); return }
        router.push(`/documents/invoices/${editId}`)
      } else {
        const res = await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: selectedCustomerId || null,
            buyerName, buyerEmail, buyerPhone, buyerAddress, date, notes,
            invoiceType: isTransfer ? "TRANSFER" : "SALE",
            memoItemIds: memoItemIds.length ? memoItemIds : undefined,
            items: lineItems.map(item => {
              const inv = inventory.find(i => i.id === item.inventoryItemId)
              return {
                inventoryItemId: item.inventoryItemId,
                description: item.description,
                quantity: parseInt(item.quantity) || 0,
                weight: parseFloat(item.weight),
                weightUnit: inv?.weightUnit || "GRAM",
                pricePerUnit: parseFloat(item.pricePerUnit) || 0,
                totalPrice: parseFloat(item.totalPrice),
              }
            }),
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error || "Failed to create invoice")
        const invoice = await res.json()
        router.push(`/documents/invoices/${invoice.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const costKeys = ["costPerUnit", "totalCost"]
  const visibleDefs = ALL_COLUMNS.filter(c => visibleCols[c.key] !== false && (!costKeys.includes(c.key) || !hideCost))

  const cellClass = "border-r border-gray-200 last:border-r-0 px-2 py-1"
  const inputClass = "w-full px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:bg-blue-50 rounded"
  const numInputClass = inputClass + " text-right"

  // Inventory subsets for each section's combobox
  const regularInventory = inventory.filter(i => !i.diamondDetails && !i.jewelryDetails)
  const diamondInventory = inventory.filter(i => !!i.diamondDetails)
  const jewelryInventory = inventory.filter(i => !!i.jewelryDetails)

  // Compute 3 groups from single lineItems array
  const regularItems = lineItems.filter(i => {
    if (i.section) return i.section === "regular"
    if (!i.inventoryItemId) return true
    const inv = inventory.find(x => x.id === i.inventoryItemId)
    return inv ? !inv.diamondDetails && !inv.jewelryDetails : true
  })
  const diamondItemsList = lineItems.filter(i => {
    if (i.section) return i.section === "diamond"
    const inv = inventory.find(x => x.id === i.inventoryItemId)
    return !!inv?.diamondDetails
  })
  const jewelryItemsList = lineItems.filter(i => {
    if (i.section) return i.section === "jewelry"
    const inv = inventory.find(x => x.id === i.inventoryItemId)
    return !!inv?.jewelryDetails
  })

  function renderTableRows(items: LineItem[], sectionItems: LineItem[], sectionAddFn: () => void, tbodyRef: React.RefObject<HTMLTableSectionElement | null>) {
    return items.map(item => {
      const inv = inventory.find(i => i.id === item.inventoryItemId)
      const unit = inv ? unitLabels[inv.weightUnit] || "g" : "g"
      const isLastRow = item.id === sectionItems[sectionItems.length - 1]?.id
      const editableKeys = ["item", "description", "quantity", "weight", "pricePerUnit", "totalPrice"]
      const lastColKey = [...visibleDefs].reverse().find(c => editableKeys.includes(c.key))?.key || visibleDefs[visibleDefs.length - 1].key
      function tabProps(colKey: string) {
        return {
          onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
            arrowNav(e)
            if (e.key === "Tab" && !e.shiftKey && isLastRow && colKey === lastColKey) { e.preventDefault(); sectionAddFn() }
          }
        }
      }
      return (
        <tr key={item.id} className="hover:bg-gray-50 group">
          {visibleDefs.map(col => (
            <td key={col.key} className={`${cellClass} align-middle`}>
              {col.key === "item" && (
                <div className="min-w-[160px] px-2 py-1.5 text-sm text-gray-700 truncate">
                  {inv ? inv.name : <span className="text-gray-300 italic">—</span>}
                </div>
              )}
              {col.key === "description" && (
                <input value={item.description} placeholder="Description"
                  onChange={e => updateItem(item.id, "description", e.target.value)}
                  className={inputClass + " min-w-[140px]"} {...tabProps("description")} />
              )}
              {col.key === "quantity" && (
                <div className="min-w-[50px]">
                  <input type="number" step="1" min="0" placeholder="0" value={item.quantity}
                    onChange={e => updateItem(item.id, "quantity", e.target.value)}
                    className={numInputClass} {...tabProps("quantity")} />
                </div>
              )}
              {col.key === "weight" && (
                <div className="flex items-center gap-1 min-w-[100px]">
                  <input type="number" step="0.0001" required placeholder="0.000" value={item.weight}
                    onChange={e => updateItem(item.id, "weight", e.target.value)}
                    className={numInputClass} {...tabProps("weight")} />
                  <span className="text-xs text-gray-400 whitespace-nowrap">{unit}</span>
                </div>
              )}
              {col.key === "pricePerUnit" && (
                <div className="flex items-center gap-0.5 min-w-[110px]">
                  <span className="text-gray-400 text-sm">$</span>
                  <input type="number" step="0.0001" placeholder="0.00" value={item.pricePerUnit}
                    onChange={e => updateItem(item.id, "pricePerUnit", e.target.value)}
                    className={numInputClass} {...tabProps("pricePerUnit")} />
                  <span className="text-xs text-gray-400">/{unit}</span>
                </div>
              )}
              {col.key === "totalPrice" && (
                <div className="flex items-center gap-0.5 min-w-[100px]">
                  <span className="text-gray-400 text-sm">$</span>
                  <input type="number" step="0.01" required placeholder="0.00" value={item.totalPrice}
                    onChange={e => updateItem(item.id, "totalPrice", e.target.value)}
                    className={numInputClass + " font-medium"} {...tabProps("totalPrice")} />
                </div>
              )}
              {col.key === "costPerUnit" && (() => {
                const cpu = item.costPerUnit || (inv && inv.totalWeight > 0 ? inv.totalCost / inv.totalWeight : 0)
                return (
                  <span className="text-sm text-gray-500 whitespace-nowrap">
                    ${cpu.toFixed(2)}/{unit}
                  </span>
                )
              })()}
              {col.key === "totalCost" && (() => {
                const cpu = item.costPerUnit || (inv && inv.totalWeight > 0 ? inv.totalCost / inv.totalWeight : 0)
                const lineCost = cpu * (parseFloat(item.weight) || 0)
                return (
                  <span className="text-sm text-gray-500 whitespace-nowrap">
                    ${lineCost.toFixed(2)}
                  </span>
                )
              })()}
            </td>
          ))}
          <td className="px-2 text-center align-middle w-8">
            {(lineItems.length > 1 || editId) && (
              <button type="button" onClick={() => removeItem(item.id)}
                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none">
                ×
              </button>
            )}
          </td>
        </tr>
      )
    })
  }

  if (status === "loading" || !session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-sm">&larr; Back</button>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{editId ? `Edit ${isTransfer ? "Transfer" : "Invoice"}${invoiceNumber ? ` — ${invoiceNumber}` : ""}` : isTransfer ? "New Transfer" : "New Invoice"}</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

          {/* Buyer Info */}
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Buyer Information</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {customers.length > 0 && (
                <div className="col-span-2 md:col-span-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Select Existing Customer</label>
                  <select value={selectedCustomerId} onChange={e => handleCustomerSelect(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                    <option value="">— Enter manually —</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.contactPerson ? ` (${c.contactPerson})` : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                <input required value={buyerName} onChange={e => setBuyerName(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </div>

          {/* Section toggles */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showDiamonds} onChange={() => {
                if (!showDiamonds && diamondItemsList.length === 0) {
                  setLineItems(prev => [...prev, { ...newItem(nextId), section: "diamond" as const }])
                  setNextId(prev => prev + 1)
                }
                setShowDiamonds(!showDiamonds)
              }}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Single Diamonds</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showJewelry} onChange={() => {
                if (!showJewelry && jewelryItemsList.length === 0) {
                  setLineItems(prev => [...prev, { ...newItem(nextId), section: "jewelry" as const }])
                  setNextId(prev => prev + 1)
                }
                setShowJewelry(!showJewelry)
              }}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Jewelry</span>
            </label>
          </div>

          {/* Regular Items Table */}
          <div className="bg-white rounded-lg shadow">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <span className="text-sm font-semibold text-gray-700">Items</span>
              <div className="flex items-center gap-3">
                {/* Column Manager */}
                <div className="relative" ref={colMenuRef}>
                  <button type="button" onClick={() => setShowColMenu(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                    Columns
                  </button>
                  {showColMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-44 py-1">
                      <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase">Show / Hide</div>
                      {ALL_COLUMNS.filter(c => c.removable).map(col => (
                        <label key={col.key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={visibleCols[col.key] !== false}
                            onChange={() => toggleCol(col.key)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600" />
                          <span className="text-sm text-gray-700">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setPickerOpen("regular")}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">
                  + Add from Inventory
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {visibleDefs.map(col => (
                      <th key={col.key} className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>
                        {col.key === "item" ? "Item / Inventory" : col.label}
                      </th>
                    ))}
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody ref={tableBodyRef} className="divide-y divide-gray-100">
                  {renderTableRows(regularItems, regularItems, () => addSectionItem("regular"), tableBodyRef)}
                </tbody>
              </table>
            </div>
          </div>

          {/* Single Diamonds Table */}
          {showDiamonds && (
            <div className="bg-white rounded-lg shadow">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <span className="text-sm font-semibold text-gray-700">Single Diamonds</span>
                <button type="button" onClick={() => setPickerOpen("diamond")}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">
                  + Add from Inventory
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {visibleDefs.map(col => (
                        <th key={col.key} className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>
                          {col.key === "item" ? "Item / Inventory" : col.label}
                        </th>
                      ))}
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody ref={diamondBodyRef} className="divide-y divide-gray-100">
                    {renderTableRows(diamondItemsList, diamondItemsList, () => addSectionItem("diamond"), diamondBodyRef)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Jewelry Table */}
          {showJewelry && (
            <div className="bg-white rounded-lg shadow">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <span className="text-sm font-semibold text-gray-700">Jewelry</span>
                <button type="button" onClick={() => setPickerOpen("jewelry")}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100">
                  + Add from Inventory
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {visibleDefs.map(col => (
                        <th key={col.key} className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>
                          {col.key === "item" ? "Item / Inventory" : col.label}
                        </th>
                      ))}
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody ref={jewelryBodyRef} className="divide-y divide-gray-100">
                    {renderTableRows(jewelryItemsList, jewelryItemsList, () => addSectionItem("jewelry"), jewelryBodyRef)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-2 text-right text-sm font-semibold text-gray-600">Total</td>
                  <td className="px-4 py-2 text-right text-sm font-bold text-green-600 whitespace-nowrap w-36">
                    ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                {!hideCost && (() => {
                  const totalCost = lineItems.reduce((s, item) => {
                    const inv = inventory.find(i => i.id === item.inventoryItemId)
                    const cpu = item.costPerUnit || (inv && inv.totalWeight > 0 ? inv.totalCost / inv.totalWeight : 0)
                    return s + cpu * (parseFloat(item.weight) || 0)
                  }, 0)
                  const totalProfit = grandTotal - totalCost
                  return (
                    <>
                      <tr className="bg-gray-50">
                        <td className="px-4 py-1 text-right text-sm text-gray-500">Total Cost</td>
                        <td className="px-4 py-1 text-right text-sm text-gray-500 whitespace-nowrap w-36">
                          ${totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="px-4 py-1 text-right text-sm font-semibold text-gray-700">Total Profit</td>
                        <td className="px-4 py-1 text-right text-sm font-semibold text-gray-700 whitespace-nowrap w-36">
                          ${totalProfit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </>
                  )
                })()}
              </tfoot>
            </table>
          </div>

          <div className="px-1">
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
              <input type="checkbox" checked={hideCost} onChange={e => setHideCost(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              Hide cost and profit
            </label>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-lg shadow p-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? "Saving..." : editId ? "Save Changes" : isTransfer ? "Create Transfer" : "Create Invoice"}
            </button>
          </div>
        </form>

        {/* Inventory Picker Modal */}
        {pickerOpen && (
          <InventoryPickerModal
            inventory={
              pickerOpen === "diamond" ? diamondInventory
              : pickerOpen === "jewelry" ? jewelryInventory
              : regularInventory
            }
            exclude={lineItems.filter(i => i.inventoryItemId).map(i => i.inventoryItemId)}
            onAdd={ids => addFromInventory(ids, pickerOpen)}
            onClose={() => setPickerOpen(null)}
            title={
              pickerOpen === "diamond" ? "Select Diamonds"
              : pickerOpen === "jewelry" ? "Select Jewelry"
              : "Select Inventory Items"
            }
          />
        )}
      </main>
    </div>
  )
}
