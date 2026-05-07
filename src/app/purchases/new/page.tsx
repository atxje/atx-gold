"use client"

import React, { Suspense, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { arrowNav } from "@/lib/table-nav"

interface DiamondData {
  shape: string
  caratWeight: string
  color: string
  clarity: string
  lab: string
  certNumber: string
  cutGrade: string
  polish: string
  symmetry: string
  fluorescence: string
  measurements: string
  costPerCarat: string
  rapPrice: string
  rapDiscount: string
  notes: string
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
  metal: string
  brand: string
  mainStone: string
  weight: string
  costPerGram: string
  totalPrice: string
}

const JEWELRY_METALS = ["Sterling", "10K", "14K", "18K", "Plat"]
const JEWELRY_BRANDS = ["", "T&Co", "DY", "JA", "Cartier", "VCA", "Other"]
const JEWELRY_STONES = ["", "None", "Diamond", "Sapphire", "Ruby", "Tanzanite", "Topaz", "Other"]

const emptyJewelryData: JewelryData = {
  metal: "", brand: "", mainStone: "", weight: "", costPerGram: "", totalPrice: "",
}

const JEWELRY_COL_HEADERS = [
  "Metal", "Brand", "Main Stone", "Weight (g)", "$/g", "Total",
]

interface WatchData {
  brand: string
  referenceNumber: string
  serialNumber: string
  caseMetal: string
  caseSizeMM: string
  description: string
  totalCost: string
  box: boolean
  paperwork: boolean
}

const WATCH_BRANDS = ["", "Rolex", "Cartier", "Omega", "Audemars Piguet", "Patek Philippe", "Breitling", "Tag Heuer", "IWC", "Panerai", "Tudor", "Hublot", "Other"]
const WATCH_METALS = ["", "SS", "Gold", "Platinum", "Two-Tone", "Titanium", "Ceramic"]
const WATCH_SIZES = ["", "26mm", "28mm", "31mm", "34mm", "36mm", "38mm", "39mm", "40mm", "41mm", "42mm", "44mm", "45mm", "46mm"]

const emptyWatchData: WatchData = {
  brand: "", referenceNumber: "", serialNumber: "", caseMetal: "", caseSizeMM: "", description: "", totalCost: "", box: false, paperwork: false,
}

const WATCH_COL_HEADERS = [
  "Brand", "Metal", "Size", "Ref #", "Serial #", "Description", "Box", "Papers", "Total Cost",
]

interface Lead {
  id: string
  name: string
  phone: string | null
  email: string | null
}

const PAYMENT_METHODS = ["Cash", "Check", "Zelle / Venmo", "Bank Transfer"]

interface PaymentEntry {
  method: string
  amount: string
}

interface LineItem {
  id: number
  dbId?: string
  category: string
  subcategory: string
  quantity: string
  weight: string
  pricePerUnit: string
  pricePaid: string
  description: string
  color: string
  clarity: string
  caratWeight: string
  lastEdited: "pricePerUnit" | "pricePaid"
  diamondData?: DiamondData
  jewelryData?: JewelryData
  watchData?: WatchData
  itemCode?: string
  weightUnit?: string
}

interface ColDef {
  key: string
  label: string
  removable: boolean
  defaultVisible: boolean
}

const ALL_COLUMNS: ColDef[] = [
  { key: "category",    label: "Category",    removable: false, defaultVisible: true },
  { key: "type",        label: "Type",        removable: false, defaultVisible: true },
  { key: "description", label: "Description", removable: true,  defaultVisible: true },
  { key: "color",       label: "Color",       removable: true,  defaultVisible: false },
  { key: "clarity",     label: "Clarity",     removable: true,  defaultVisible: false },
  { key: "caratWeight", label: "Carat (ct)",  removable: true,  defaultVisible: false },
  { key: "quantity",    label: "Qty",         removable: true,  defaultVisible: true },
  { key: "weight",      label: "Weight",      removable: false, defaultVisible: true },
  { key: "pricePerUnit",label: "Price/Unit",  removable: true,  defaultVisible: true },
  { key: "pricePaid",   label: "Total Paid",  removable: false, defaultVisible: true },
]

const STORAGE_KEY = "purchase-columns"

const channels = ["ONLINE_FORM", "PHONE", "TEXT", "WALK_IN"]
const sources = ["ORGANIC", "PAID"]

const unitLabelMap: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

interface CategoryDef {
  label: string
  metalType: string
  weightUnit: string
  unitLabel: string
  subcategories: string[]
}

function newLineItem(id: number): LineItem {
  return { id, category: "", subcategory: "", quantity: "", weight: "", pricePerUnit: "", pricePaid: "", description: "", color: "", clarity: "", caratWeight: "", lastEdited: "pricePaid" }
}

function loadVisibleCols(): Record<string, boolean> {
  if (typeof window === "undefined") return {}
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.defaultVisible]))
}

const cellClass = "border-r border-gray-200 last:border-r-0 px-1 py-1"
const inputClass = "w-full px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:bg-blue-50 rounded"
const numInputClass = inputClass + " text-right"
const selectClass = "w-full px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:bg-blue-50 rounded"

// Diamond table columns (after Category + Type)
const DIAMOND_COL_HEADERS = [
  "Shape", "Size (ct)", "Lab", "Cert #", "Color", "Clarity",
  "Fluor.", "Cut", "Polish", "Sym.", "$/ct", "Disc %", "Total",
]

function NewPurchaseForm() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("editId")
  const preselectedLeadId = searchParams.get("leadId")

  const [categories, setCategories] = useState<Record<string, CategoryDef>>({})
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [selectedLeadId, setSelectedLeadId] = useState(preselectedLeadId || "")
  const [isNewLead, setIsNewLead] = useState(false)
  const [newLeadName, setNewLeadName] = useState("")
  const [newLeadPhone, setNewLeadPhone] = useState("")
  const [newLeadEmail, setNewLeadEmail] = useState("")
  const [newLeadSource, setNewLeadSource] = useState("ORGANIC")
  const [newLeadChannel, setNewLeadChannel] = useState("PHONE")
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0])
  const [ticketTotal, setTicketTotal] = useState("")
  const [notes, setNotes] = useState("")
  const [editPurchaseNumber, setEditPurchaseNumber] = useState("")
  const [originalDbIds, setOriginalDbIds] = useState<string[]>([])
  const [payments, setPayments] = useState<PaymentEntry[]>([])
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem(1)])
  const nextIdRef = useRef(2)
  const getNextId = () => nextIdRef.current++
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(loadVisibleCols)
  const [showColMenu, setShowColMenu] = useState(false)
  const [focusLastRow, setFocusLastRow] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)
  const tableBodyRef = useRef<HTMLTableSectionElement>(null)
  const rapFetchKeys = useRef<Record<number, string>>({})
  const rapTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetch("/api/leads").then(r => r.ok ? r.json() : []).then(setLeads)
      const catPromise = fetch("/api/categories").then(r => r.ok ? r.json() : []).then((cats: { id: string; name: string; metalType: string; weightUnit: string; subcategories: { name: string }[] }[]) => {
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
        return map
      })
      if (editId) {
        catPromise.then(async (catMap) => {
          const res = await fetch(`/api/purchases/${editId}`)
          if (!res.ok) return
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const purchase: any = await res.json()
          setSelectedLeadId(purchase.lead?.id || "")
          setPurchaseDate(new Date(purchase.purchaseDate).toISOString().split("T")[0])
          setNotes(purchase.notes || "")
          setEditPurchaseNumber(purchase.purchaseNumber || "")
          // Parse payment
          try {
            if (purchase.paymentMethod) {
              const pm = typeof purchase.paymentMethod === "string" ? JSON.parse(purchase.paymentMethod) : purchase.paymentMethod
              if (Array.isArray(pm)) setPayments(pm.map((p: { method: string; amount: number }) => ({ method: p.method, amount: p.amount.toString() })))
            }
          } catch {}
          // Map items to line items, reverse-mapping category labels to IDs
          // Split into regular, diamond, and jewelry based on metalType
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const items: any[] = purchase.items || []
          const regularRows: LineItem[] = []
          const diamondRows: LineItem[] = []
          const jewelryRows: LineItem[] = []
          const watchRows: LineItem[] = []
          let counter = 1
          for (const item of items) {
            const catEntry = Object.entries(catMap).find(([, c]) => c.label === item.category)
            const catId = catEntry?.[0] || ""
            const catDef = catEntry?.[1]
            const ppu = item.pricePerUnit ?? (item.weight > 0 ? item.pricePaid / item.weight : 0)
            const base: LineItem = {
              ...newLineItem(counter++),
              dbId: item.id,
              category: catId,
              subcategory: item.subcategory || "",
              description: item.description,
              quantity: item.quantity ? item.quantity.toString() : "",
              weight: item.weight.toString(),
              pricePerUnit: ppu ? ppu.toString() : "",
              pricePaid: item.pricePaid.toString(),
              lastEdited: "pricePaid" as const,
              itemCode: item.inventoryItem?.itemCode || undefined,
              weightUnit: item.weightUnit,
            }

            if (catDef?.metalType === "DIAMOND" && item.inventoryItem?.diamondDetails) {
              const dd = item.inventoryItem.diamondDetails
              base.diamondData = {
                shape: dd.shape || "",
                caratWeight: dd.caratWeight?.toString() || "",
                color: dd.color || "",
                clarity: dd.clarity || "",
                lab: dd.lab || "",
                certNumber: dd.certNumber || "",
                cutGrade: dd.cutGrade || "",
                polish: dd.polish || "",
                symmetry: dd.symmetry || "",
                fluorescence: dd.fluorescence || "",
                measurements: dd.measurements || "",
                costPerCarat: dd.costPerCarat?.toString() || "",
                rapPrice: dd.rapPrice?.toString() || "",
                rapDiscount: dd.rapDiscount?.toString() || "",
                notes: dd.notes || "",
              }
              diamondRows.push(base)
            } else if (catDef?.metalType === "JEWELRY" && item.inventoryItem?.jewelryDetails) {
              const jd = item.inventoryItem.jewelryDetails
              base.jewelryData = {
                metal: jd.metal || "",
                brand: jd.brand || "",
                mainStone: jd.mainStone || "",
                weight: item.weight.toString(),
                costPerGram: jd.costPerGram?.toString() || "",
                totalPrice: item.pricePaid.toString(),
              }
              jewelryRows.push(base)
            } else if (item.inventoryItem?.watchDetails || item.metalType === "WATCH" || catDef?.metalType === "WATCH") {
              const wd = item.inventoryItem?.watchDetails
              // Ensure watch category is set even if label didn't match
              if (!base.category) {
                const wCatEntry = Object.entries(catMap).find(([, c]) => c.metalType === "WATCH")
                base.category = wCatEntry?.[0] || ""
              }
              base.watchData = {
                brand: wd?.brand || "",
                referenceNumber: wd?.referenceNumber || "",
                serialNumber: wd?.serialNumber || "",
                caseMetal: wd?.caseMetal || "",
                caseSizeMM: wd?.caseSizeMM || "",
                description: "",
                totalCost: item.pricePaid.toString(),
                box: wd?.box || false,
                paperwork: wd?.paperwork || false,
              }
              watchRows.push(base)
            } else {
              regularRows.push(base)
            }
          }
          if (regularRows.length > 0) setLineItems(regularRows)
          if (diamondRows.length > 0) {
            setDiamondItems(diamondRows)
            setShowDiamonds(true)
          }
          if (jewelryRows.length > 0) {
            setJewelryItems(jewelryRows)
            setShowJewelry(true)
          }
          if (watchRows.length > 0) {
            setWatchItems(watchRows)
            setShowWatches(true)
          }
          nextIdRef.current = counter
          setOriginalDbIds(items.map((item: { id: string }) => item.id))
          const total = items.reduce((s: number, item: { pricePaid: number }) => s + item.pricePaid, 0)
          if (total > 0) setTicketTotal(total.toString())
        })
      }
    }
  }, [session])

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
      const firstEl = lastRow?.querySelector<HTMLSelectElement | HTMLInputElement>("select,input")
      firstEl?.focus()
    }
  }, [focusLastRow, lineItems])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => { Object.values(rapTimers.current).forEach(clearTimeout) }
  }, [])

  function toggleCol(key: string) {
    const next = { ...visibleCols, [key]: !visibleCols[key] }
    setVisibleCols(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function addLineItem() {
    setLineItems([...lineItems, newLineItem(getNextId())])
  }

  function addLineItemAndFocus() {
    setLineItems(prev => [...prev, newLineItem(getNextId())])
    setFocusLastRow(true)
  }

  function removeLineItem(id: number) {
    if (lineItems.length > 1) setLineItems(lineItems.filter(item => item.id !== id))
  }

  function updateLineItem(id: number, field: keyof LineItem, value: string) {
    setLineItems(lineItems.map(item => {
      if (item.id !== id) return item
      if (field === "category") {
        return { ...item, category: value, subcategory: "", weight: "", pricePerUnit: "", pricePaid: "" }
      }
      if (field === "subcategory") {
        return { ...item, subcategory: value }
      }
      const updated = { ...item, [field]: value }
      const weight = parseFloat(field === "weight" ? value : item.weight) || 0
      if (field === "pricePerUnit") {
        updated.lastEdited = "pricePerUnit"
        const perUnit = parseFloat(value) || 0
        if (weight > 0 && perUnit > 0) updated.pricePaid = (perUnit * weight).toFixed(2)
      } else if (field === "pricePaid") {
        updated.lastEdited = "pricePaid"
        const total = parseFloat(value) || 0
        if (weight > 0 && total > 0) updated.pricePerUnit = (total / weight).toFixed(4)
      } else if (field === "weight") {
        const w = parseFloat(value) || 0
        if (item.lastEdited === "pricePerUnit") {
          const perUnit = parseFloat(item.pricePerUnit) || 0
          if (w > 0 && perUnit > 0) updated.pricePaid = (perUnit * w).toFixed(2)
        } else {
          const total = parseFloat(item.pricePaid) || 0
          if (w > 0 && total > 0) updated.pricePerUnit = (total / w).toFixed(4)
        }
      }
      return updated
    }))
  }

  // Separate item lists for each section
  const [diamondItems, setDiamondItems] = useState<LineItem[]>([])
  const [jewelryItems, setJewelryItems] = useState<LineItem[]>([])
  const [watchItems, setWatchItems] = useState<LineItem[]>([])
  const [showDiamonds, setShowDiamonds] = useState(false)
  const [showJewelry, setShowJewelry] = useState(false)
  const [showWatches, setShowWatches] = useState(false)
  const diamondBodyRef = useRef<HTMLTableSectionElement>(null)
  const jewelryBodyRef = useRef<HTMLTableSectionElement>(null)
  const watchBodyRef = useRef<HTMLTableSectionElement>(null)
  const [focusDiamondRow, setFocusDiamondRow] = useState(false)
  const [focusJewelryRow, setFocusJewelryRow] = useState(false)
  const [focusWatchRow, setFocusWatchRow] = useState(false)
  const [nextDiamondNum, setNextDiamondNum] = useState<number>(0)
  const [nextJewelryNum, setNextJewelryNum] = useState<number>(0)
  const [nextWatchNum, setNextWatchNum] = useState<number>(0)
  const [giaLoading, setGiaLoading] = useState<Record<number, boolean>>({})

  useEffect(() => {
    if (focusDiamondRow && diamondBodyRef.current) {
      setFocusDiamondRow(false)
      const rows = diamondBodyRef.current.querySelectorAll("tr")
      const lastRow = rows[rows.length - 1]
      lastRow?.querySelector<HTMLSelectElement | HTMLInputElement>("select,input")?.focus()
    }
  }, [focusDiamondRow, diamondItems])

  useEffect(() => {
    if (focusJewelryRow && jewelryBodyRef.current) {
      setFocusJewelryRow(false)
      const rows = jewelryBodyRef.current.querySelectorAll("tr")
      const lastRow = rows[rows.length - 1]
      lastRow?.querySelector<HTMLSelectElement | HTMLInputElement>("select,input")?.focus()
    }
  }, [focusJewelryRow, jewelryItems])

  useEffect(() => {
    if (focusWatchRow && watchBodyRef.current) {
      setFocusWatchRow(false)
      const rows = watchBodyRef.current.querySelectorAll("tr")
      const lastRow = rows[rows.length - 1]
      lastRow?.querySelector<HTMLSelectElement | HTMLInputElement>("select,input")?.focus()
    }
  }, [focusWatchRow, watchItems])

  async function fetchNextCode(prefix: "D" | "J" | "W"): Promise<number> {
    const res = await fetch(`/api/inventory/next-code?prefix=${prefix}`)
    if (!res.ok) return 1
    const { nextNum } = await res.json()
    return nextNum
  }

  function getNextCodeNum(items: LineItem[], prefix: string, baseNum: number): number {
    const nums = items
      .map(i => i.itemCode?.startsWith(prefix) ? parseInt(i.itemCode.slice(1)) : NaN)
      .filter(n => !isNaN(n))
    const maxInList = nums.length > 0 ? Math.max(...nums) : baseNum - 1
    return maxInList + 1
  }

  async function toggleShowDiamonds() {
    if (!showDiamonds && diamondItems.length === 0) {
      const dCatEntry = Object.entries(categories).find(([, c]) => c.metalType === "DIAMOND")
      const dCatId = dCatEntry?.[0] || ""
      const singleSub = dCatEntry?.[1]?.subcategories.find(s => s.toLowerCase().includes("single")) || ""
      const num = await fetchNextCode("D")
      setNextDiamondNum(num + 1)
      setDiamondItems([{ ...newLineItem(getNextId()), category: dCatId, subcategory: singleSub, diamondData: { ...emptyDiamondData }, itemCode: `D${String(num).padStart(4, "0")}` }])

    }
    setShowDiamonds(!showDiamonds)
  }

  async function toggleShowJewelry() {
    if (!showJewelry && jewelryItems.length === 0) {
      const jCatEntry = Object.entries(categories).find(([, c]) => c.metalType === "JEWELRY")
      const jCatId = jCatEntry?.[0] || ""
      const num = await fetchNextCode("J")
      setNextJewelryNum(num + 1)
      setJewelryItems([{ ...newLineItem(getNextId()), category: jCatId, jewelryData: { ...emptyJewelryData }, itemCode: `J${String(num).padStart(4, "0")}` }])

    }
    setShowJewelry(!showJewelry)
  }

  function addDiamondRow() {
    const dCatEntry = Object.entries(categories).find(([, c]) => c.metalType === "DIAMOND")
    const dCatId = dCatEntry?.[0] || ""
    const singleSub = dCatEntry?.[1]?.subcategories.find(s => s.toLowerCase().includes("single")) || ""
    const num = getNextCodeNum(diamondItems, "D", nextDiamondNum)
    const code = `D${String(num).padStart(4, "0")}`
    setNextDiamondNum(num + 1)
    setDiamondItems(prev => [...prev, { ...newLineItem(getNextId()), category: dCatId, subcategory: singleSub, diamondData: { ...emptyDiamondData }, itemCode: code }])

    setFocusDiamondRow(true)
  }

  function removeDiamondRow(id: number) {
    setDiamondItems(prev => {
      const next = prev.filter(i => i.id !== id)
      if (next.length === 0) setShowDiamonds(false)
      return next
    })
  }

  function addJewelryRow() {
    const jCatEntry = Object.entries(categories).find(([, c]) => c.metalType === "JEWELRY")
    const jCatId = jCatEntry?.[0] || ""
    const num = getNextCodeNum(jewelryItems, "J", nextJewelryNum)
    const code = `J${String(num).padStart(4, "0")}`
    setNextJewelryNum(num + 1)
    setJewelryItems(prev => [...prev, { ...newLineItem(getNextId()), category: jCatId, jewelryData: { ...emptyJewelryData }, itemCode: code }])

    setFocusJewelryRow(true)
  }

  function removeJewelryRow(id: number) {
    setJewelryItems(prev => {
      const next = prev.filter(i => i.id !== id)
      if (next.length === 0) setShowJewelry(false)
      return next
    })
  }

  async function toggleShowWatches() {
    if (!showWatches && watchItems.length === 0) {
      const wCatEntry = Object.entries(categories).find(([, c]) => c.metalType === "WATCH")
      const wCatId = wCatEntry?.[0] || ""
      const num = await fetchNextCode("W")
      setNextWatchNum(num + 1)
      setWatchItems([{ ...newLineItem(getNextId()), category: wCatId, watchData: { ...emptyWatchData }, itemCode: `W${String(num).padStart(4, "0")}` }])

    }
    setShowWatches(!showWatches)
  }

  function addWatchRow() {
    const wCatEntry = Object.entries(categories).find(([, c]) => c.metalType === "WATCH")
    const wCatId = wCatEntry?.[0] || ""
    const num = getNextCodeNum(watchItems, "W", nextWatchNum)
    const code = `W${String(num).padStart(4, "0")}`
    setNextWatchNum(num + 1)
    setWatchItems(prev => [...prev, { ...newLineItem(getNextId()), category: wCatId, watchData: { ...emptyWatchData }, itemCode: code }])

    setFocusWatchRow(true)
  }

  function removeWatchRow(id: number) {
    setWatchItems(prev => {
      const next = prev.filter(i => i.id !== id)
      if (next.length === 0) setShowWatches(false)
      return next
    })
  }

  function updateWatchItem(id: number, field: keyof WatchData, value: string | boolean) {
    setWatchItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const wd = { ...(item.watchData || { ...emptyWatchData }), [field]: value }
      return { ...item, watchData: wd, pricePaid: wd.totalCost, weight: "1", quantity: "1" }
    }))
  }

  function updateWatchSubcategory(id: number, value: string) {
    setWatchItems(prev => prev.map(item => item.id === id ? { ...item, subcategory: value } : item))
  }

  function updateDiamondItem(id: number, field: keyof DiamondData, value: string) {
    setDiamondItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const dd = { ...(item.diamondData || { ...emptyDiamondData }), [field]: value }
      const rap = parseFloat(dd.rapPrice)
      if (field === "rapDiscount" || field === "rapPrice") {
        const disc = parseFloat(dd.rapDiscount)
        if (rap > 0 && !isNaN(disc)) dd.costPerCarat = (rap * (1 + disc / 100)).toFixed(2)
      } else if (field === "costPerCarat") {
        const cpc = parseFloat(value)
        if (rap > 0 && cpc > 0) dd.rapDiscount = (((cpc / rap) - 1) * 100).toFixed(1)
      }
      const updated = { ...item, diamondData: dd }
      if (field === "caratWeight") updated.weight = value
      if (field === "costPerCarat" || field === "rapDiscount" || field === "rapPrice") updated.pricePerUnit = dd.costPerCarat
      const ct = parseFloat(dd.caratWeight) || 0
      const cpc = parseFloat(dd.costPerCarat) || 0
      if (ct > 0 && cpc > 0) updated.pricePaid = (ct * cpc).toFixed(2)
      return updated
    }))
  }

  function updateDiamondTotal(id: number, total: string) {
    setDiamondItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const dd = item.diamondData || { ...emptyDiamondData }
      const ct = parseFloat(dd.caratWeight) || 0
      if (ct > 0 && parseFloat(total) > 0) {
        const cpc = (parseFloat(total) / ct).toFixed(2)
        const rap = parseFloat(dd.rapPrice) || 0
        const newDd = { ...dd, costPerCarat: cpc }
        if (rap > 0) newDd.rapDiscount = (((parseFloat(cpc) / rap) - 1) * 100).toFixed(1)
        return { ...item, diamondData: newDd, pricePaid: total, weight: dd.caratWeight, pricePerUnit: cpc }
      }
      return { ...item, pricePaid: total }
    }))
  }

  function updateJewelryItem(id: number, field: keyof JewelryData, value: string) {
    setJewelryItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const jd = { ...(item.jewelryData || { ...emptyJewelryData }), [field]: value }
      const w = parseFloat(jd.weight) || 0
      if (field === "costPerGram") {
        const cpg = parseFloat(value) || 0
        if (w > 0 && cpg > 0) jd.totalPrice = (cpg * w).toFixed(2)
      } else if (field === "totalPrice") {
        const total = parseFloat(value) || 0
        if (w > 0 && total > 0) jd.costPerGram = (total / w).toFixed(2)
      } else if (field === "weight") {
        const newW = parseFloat(value) || 0
        const cpg = parseFloat(jd.costPerGram) || 0
        if (newW > 0 && cpg > 0) jd.totalPrice = (cpg * newW).toFixed(2)
      }
      return { ...item, jewelryData: jd, weight: jd.weight, pricePerUnit: jd.costPerGram, pricePaid: jd.totalPrice }
    }))
  }

  function updateJewelrySubcategory(id: number, value: string) {
    setJewelryItems(prev => prev.map(item => item.id === id ? { ...item, subcategory: value } : item))
  }

  async function fetchGIA(itemId: number, certNumber: string) {
    if (!certNumber) return
    setGiaLoading(prev => ({ ...prev, [itemId]: true }))
    try {
      const res = await fetch(`/api/gia?reportNumber=${encodeURIComponent(certNumber)}`)
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || "GIA lookup failed")
        return
      }
      const data = await res.json()
      setDiamondItems(prev => prev.map(item => {
        if (item.id !== itemId) return item
        const dd = { ...(item.diamondData || { ...emptyDiamondData }) }
        if (data.shape) dd.shape = data.shape
        if (data.caratWeight) dd.caratWeight = data.caratWeight
        if (data.color) dd.color = data.color
        if (data.clarity) dd.clarity = data.clarity
        if (data.cutGrade) dd.cutGrade = data.cutGrade
        if (data.polish) dd.polish = data.polish
        if (data.symmetry) dd.symmetry = data.symmetry
        if (data.fluorescence) dd.fluorescence = data.fluorescence
        if (data.measurements) dd.measurements = data.measurements
        dd.lab = "GIA"
        dd.certNumber = data.reportNumber || certNumber
        const updated = { ...item, diamondData: dd }
        if (dd.caratWeight) updated.weight = dd.caratWeight
        return updated
      }))
    } catch {
      setError("Failed to fetch GIA report")
    } finally {
      setGiaLoading(prev => ({ ...prev, [itemId]: false }))
    }
  }

  // Auto-fetch Rapaport for diamond items
  useEffect(() => {
    diamondItems.forEach(item => {
      const dd = item.diamondData
      if (!dd?.shape || !dd.caratWeight || !dd.color || !dd.clarity) return
      const key = `${dd.shape}|${dd.caratWeight}|${dd.color}|${dd.clarity}`
      if (rapFetchKeys.current[item.id] === key) return
      if (rapTimers.current[item.id]) clearTimeout(rapTimers.current[item.id])
      rapTimers.current[item.id] = setTimeout(async () => {
        rapFetchKeys.current[item.id] = key
        try {
          const params = new URLSearchParams({ shape: dd.shape, size: dd.caratWeight, color: dd.color, clarity: dd.clarity })
          const res = await fetch(`/api/rapaport?${params}`)
          if (res.ok) {
            const price = await res.json()
            setDiamondItems(prev => prev.map(li => {
              if (li.id !== item.id) return li
              return { ...li, diamondData: { ...(li.diamondData || emptyDiamondData), rapPrice: Math.round(price.caratPrice).toString() } }
            }))
          }
        } catch {}
      }, 500)
    })
  }, [diamondItems])

  const allItems = [...lineItems, ...diamondItems, ...jewelryItems, ...watchItems]
  const grandTotal = allItems.reduce((s, i) => s + (parseFloat(i.pricePaid) || 0), 0)
  const ticketNum = parseFloat(ticketTotal) || 0
  const ticketRemaining = ticketNum - grandTotal
  const paymentTotal = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const paymentDiff = grandTotal - paymentTotal

  function togglePayment(method: string) {
    if (payments.find(p => p.method === method)) {
      setPayments(payments.filter(p => p.method !== method))
    } else {
      setPayments([...payments, { method, amount: "" }])
    }
  }

  function setPaymentAmount(method: string, amount: string) {
    setPayments(payments.map(p => p.method === method ? { ...p, amount } : p))
  }
  const visibleDefs = ALL_COLUMNS.filter(c => visibleCols[c.key] !== false)
  const lastColKey = visibleDefs[visibleDefs.length - 1].key

  function tabProps(colKey: string, isLastRow: boolean) {
    return {
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        arrowNav(e)
        if (e.key === "Tab" && !e.shiftKey && isLastRow && colKey === lastColKey) { e.preventDefault(); addLineItemAndFocus() }
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (payments.length === 0) { setError("Please select at least one payment method"); return }
    if (Math.abs(paymentDiff) > 0.01) { setError(`Payment total ($${paymentTotal.toFixed(2)}) must equal purchase total ($${grandTotal.toFixed(2)})`); return }
    setLoading(true)
    try {
      if (editId) {
        // Edit mode
        let redirectId = editId
        const paymentData = payments.length > 0
          ? payments.filter(p => p.amount).map(p => ({ method: p.method, amount: parseFloat(p.amount) }))
          : null

        const existingItems = [
          ...lineItems.filter(i => i.dbId),
          ...diamondItems.filter(i => i.dbId),
          ...jewelryItems.filter(i => i.dbId),
          ...watchItems.filter(i => i.dbId),
        ]
        const keptDbIds = existingItems.map(i => i.dbId!).filter(Boolean)
        const removedIds = originalDbIds.filter(id => !keptDbIds.includes(id))

        const isRowEmpty = (item: LineItem) => !item.weight && !item.pricePaid && !(item.watchData?.totalCost)
        const allNewItems = [
          ...lineItems.filter(i => !i.dbId),
          ...(showDiamonds ? diamondItems.filter(i => !i.dbId) : []),
          ...(showJewelry ? jewelryItems.filter(i => !i.dbId) : []),
          ...(showWatches ? watchItems.filter(i => !i.dbId) : []),
        ].filter(item => !isRowEmpty(item))

        // PUT existing items + remove deleted items
        if (existingItems.length > 0 || removedIds.length > 0) {
          const res = await fetch(`/api/purchases/${editId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              purchaseDate,
              notes: notes || null,
              paymentMethod: paymentData,
              removeItemIds: removedIds.length > 0 ? removedIds : undefined,
              items: existingItems.map(item => {
                const dd = item.diamondData
                const jd = item.jewelryData
                const wd = item.watchData
                return {
                  id: item.dbId,
                  description: item.description,
                  quantity: parseInt(item.quantity) || 0,
                  weight: parseFloat(item.weight) || 0,
                  pricePerUnit: parseFloat(item.pricePerUnit) || null,
                  pricePaid: parseFloat(item.pricePaid) || 0,
                  ...(dd && { diamondData: {
                    shape: dd.shape || null, caratWeight: dd.caratWeight ? parseFloat(dd.caratWeight) : null,
                    color: dd.color || null, clarity: dd.clarity || null, lab: dd.lab || null,
                    certNumber: dd.certNumber || null, cutGrade: dd.cutGrade || null,
                    polish: dd.polish || null, symmetry: dd.symmetry || null,
                    fluorescence: dd.fluorescence || null, measurements: dd.measurements || null,
                    costPerCarat: dd.costPerCarat ? parseFloat(dd.costPerCarat) : null,
                    rapPrice: dd.rapPrice ? parseFloat(dd.rapPrice) : null,
                    rapDiscount: dd.rapDiscount ? parseFloat(dd.rapDiscount) : null,
                    notes: dd.notes || null,
                  }}),
                  ...(jd && { jewelryData: {
                    metal: jd.metal || null, brand: jd.brand || null,
                    mainStone: jd.mainStone || null,
                    costPerGram: jd.costPerGram ? parseFloat(jd.costPerGram) : null,
                  }}),
                  ...(wd && { watchData: {
                    brand: wd.brand || null, referenceNumber: wd.referenceNumber || null,
                    serialNumber: wd.serialNumber || null, caseMetal: wd.caseMetal || null,
                    caseSizeMM: wd.caseSizeMM || null,
                    box: wd.box || false, paperwork: wd.paperwork || false,
                  }}),
                }
              }),
            }),
          })
          if (!res.ok) throw new Error((await res.json()).error || "Failed to save purchase")
          const putResult = await res.json()
          // If the original editId was deleted, use the surviving purchase's ID for redirect
          redirectId = putResult.id || editId
        }

        // POST new items using the existing purchaseNumber and leadId
        for (const item of allNewItems) {
          const isWatch = !!item.watchData
          if (!item.category || (!isWatch && (!item.subcategory || !item.weight || !item.pricePaid)) || (isWatch && !item.pricePaid)) {
            const missing = [!item.category && "category", !isWatch && !item.subcategory && "type", !isWatch && !item.weight && "weight", !item.pricePaid && "price"].filter(Boolean).join(", ")
            throw new Error(`Please fill in all required fields for new items (missing: ${missing})`)
          }
          const cat = categories[item.category]
          let baseDesc: string
          let extras: string
          if (item.watchData?.brand) {
            const wd = item.watchData
            const parts = [wd.brand, wd.caseMetal, wd.caseSizeMM, wd.referenceNumber, wd.description].filter(Boolean)
            baseDesc = parts.join(" ") || "Watch"
            extras = ""
          } else if (item.jewelryData?.metal) {
            const jd = item.jewelryData
            const parts = [jd.metal, item.subcategory, jd.brand, jd.mainStone && jd.mainStone !== "None" && `w/ ${jd.mainStone}`].filter(Boolean)
            baseDesc = item.description || parts.join(" ")
            extras = ""
          } else if (item.diamondData?.shape) {
            const dd = item.diamondData
            const parts = [dd.shape, dd.caratWeight && `${dd.caratWeight}ct`, dd.color, dd.clarity, dd.cutGrade].filter(Boolean)
            baseDesc = item.description || parts.join(" ")
            extras = [dd.lab && dd.certNumber && `${dd.lab} ${dd.certNumber}`].filter(Boolean).join(", ")
          } else {
            extras = [item.color && `Color: ${item.color}`, item.clarity && `Clarity: ${item.clarity}`, item.caratWeight && `Carat: ${item.caratWeight}ct`].filter(Boolean).join(", ")
            baseDesc = item.description || `${item.subcategory} ${cat?.label || ""}`.trim()
          }
          const fullDesc = extras ? `${baseDesc} (${extras})` : baseDesc

          const res: Response = await fetch("/api/purchases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              purchaseNumber: editPurchaseNumber,
              leadId: selectedLeadId,
              description: fullDesc,
              metalType: cat?.metalType || "OTHER",
              weight: item.weight || (isWatch ? "1" : ""),
              weightUnit: cat?.weightUnit || "GRAM",
              purity: item.subcategory,
              pricePaid: item.pricePaid || (isWatch ? item.watchData?.totalCost : ""),
              pricePerUnit: item.pricePerUnit || null,
              category: cat?.label || item.category,
              subcategory: item.subcategory,
              purchaseDate,
              notes: notes || null,
              paymentMethod: paymentData,
            }),
          })
          if (!res.ok) throw new Error((await res.json()).error || "Failed to add new item")

          // Save diamond/jewelry details if present
          const created = await res.json()
          if (item.diamondData && created.inventoryItemId) {
            const dd = item.diamondData
            await fetch("/api/diamonds", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                inventoryItemId: created.inventoryItemId,
                shape: dd.shape || null, caratWeight: dd.caratWeight ? parseFloat(dd.caratWeight) : null,
                color: dd.color || null, clarity: dd.clarity || null, lab: dd.lab || null,
                certNumber: dd.certNumber || null, cutGrade: dd.cutGrade || null,
                polish: dd.polish || null, symmetry: dd.symmetry || null,
                fluorescence: dd.fluorescence || null, measurements: dd.measurements || null,
                costPerCarat: dd.costPerCarat ? parseFloat(dd.costPerCarat) : null,
                rapPrice: dd.rapPrice ? parseFloat(dd.rapPrice) : null,
                rapDiscount: dd.rapDiscount ? parseFloat(dd.rapDiscount) : null,
                notes: dd.notes || null,
              }),
            })
          }
          if (item.jewelryData && created.inventoryItemId) {
            const jd = item.jewelryData
            await fetch("/api/jewelry", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                inventoryItemId: created.inventoryItemId,
                metal: jd.metal || null, brand: jd.brand || null,
                mainStone: jd.mainStone || null,
                costPerGram: jd.costPerGram ? parseFloat(jd.costPerGram) : null,
              }),
            })
          }
          if (item.watchData && created.inventoryItemId) {
            const wd = item.watchData
            await fetch("/api/watches", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                inventoryItemId: created.inventoryItemId,
                brand: wd.brand || null,
                referenceNumber: wd.referenceNumber || null,
                serialNumber: wd.serialNumber || null,
                caseMetal: wd.caseMetal || null,
                caseSizeMM: wd.caseSizeMM || null,
                box: wd.box || false,
                paperwork: wd.paperwork || false,
              }),
            })
          }
        }

        router.push(`/purchases/${redirectId || editId}`)
        return
      }

      let leadId = selectedLeadId

      if (isNewLead) {
        if (!newLeadName) throw new Error("Seller name is required")
        const leadRes = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newLeadName, phone: newLeadPhone || null, email: newLeadEmail || null, source: newLeadSource, channel: newLeadChannel, status: "BOUGHT" }),
        })
        if (!leadRes.ok) throw new Error((await leadRes.json()).error || "Failed to create lead")
        leadId = (await leadRes.json()).id
      }

      // Filter out empty rows (no weight and no price) and validate the rest
      const isRowFilled = (item: LineItem) => {
        if (item.watchData) return item.category && item.pricePaid
        return item.category && item.subcategory && item.weight && item.pricePaid
      }
      const isRowEmpty = (item: LineItem) => !item.weight && !item.pricePaid && !(item.watchData?.totalCost)
      const submitItems = [
        ...lineItems,
        ...(showDiamonds ? diamondItems : []),
        ...(showJewelry ? jewelryItems : []),
        ...(showWatches ? watchItems : []),
      ].filter(item => !isRowEmpty(item))
      for (const item of submitItems) {
        if (!isRowFilled(item))
          throw new Error("Please fill in all required fields for each item, or leave the row completely empty")
      }
      if (submitItems.length === 0) throw new Error("Add at least one item")

      const paymentData = payments.length > 0
        ? payments.filter(p => p.amount).map(p => ({ method: p.method, amount: parseFloat(p.amount) }))
        : null

      let sharedPurchaseNumber: string | null = null
      let firstPurchaseId: string | null = null

      for (const item of submitItems) {
        const cat = categories[item.category]
        let extras: string
        let baseDesc: string
        if (item.watchData?.brand) {
          const wd = item.watchData
          const parts = [wd.brand, wd.caseMetal, wd.caseSizeMM, wd.referenceNumber, wd.description].filter(Boolean)
          baseDesc = parts.join(" ") || "Watch"
          extras = ""
        } else if (item.jewelryData?.metal) {
          const jd = item.jewelryData
          const parts = [
            jd.metal,
            item.subcategory,
            jd.brand,
            jd.mainStone && jd.mainStone !== "None" && `w/ ${jd.mainStone}`,
          ].filter(Boolean)
          baseDesc = item.description || parts.join(" ")
          extras = ""
        } else if (item.diamondData?.shape) {
          const dd = item.diamondData
          const parts = [
            dd.shape,
            dd.caratWeight && `${dd.caratWeight}ct`,
            dd.color,
            dd.clarity,
            dd.cutGrade,
          ].filter(Boolean)
          baseDesc = item.description || parts.join(" ")
          extras = [
            dd.lab && dd.certNumber && `${dd.lab} ${dd.certNumber}`,
          ].filter(Boolean).join(", ")
        } else {
          extras = [
            item.color && `Color: ${item.color}`,
            item.clarity && `Clarity: ${item.clarity}`,
            item.caratWeight && `Carat: ${item.caratWeight}ct`,
          ].filter(Boolean).join(", ")
          baseDesc = item.description || `${item.subcategory} ${cat?.label || ""}`.trim()
        }
        const fullDesc = extras ? `${baseDesc} (${extras})` : baseDesc

        const res: Response = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseNumber: sharedPurchaseNumber,
            leadId,
            description: fullDesc,
            metalType: cat?.metalType || "OTHER",
            quantity: parseInt(item.quantity) || 0,
            weight: item.weight,
            weightUnit: cat?.weightUnit || "GRAM",
            purity: item.subcategory,
            pricePaid: item.pricePaid,
            pricePerUnit: item.pricePerUnit || null,
            category: cat?.label || item.category,
            subcategory: item.subcategory,
            purchaseDate,
            notes: notes || null,
            paymentMethod: paymentData,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error || "Failed to record purchase")
        const created = await res.json()
        if (!sharedPurchaseNumber) sharedPurchaseNumber = created.purchaseNumber
        if (!firstPurchaseId) firstPurchaseId = created.id

        // Save diamond details if present
        if (item.diamondData && created.inventoryItemId) {
          const dd = item.diamondData
          await fetch("/api/diamonds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inventoryItemId: created.inventoryItemId,
              shape: dd.shape || null,
              caratWeight: dd.caratWeight ? parseFloat(dd.caratWeight) : null,
              color: dd.color || null,
              clarity: dd.clarity || null,
              lab: dd.lab || null,
              certNumber: dd.certNumber || null,
              cutGrade: dd.cutGrade || null,
              polish: dd.polish || null,
              symmetry: dd.symmetry || null,
              fluorescence: dd.fluorescence || null,
              measurements: dd.measurements || null,
              costPerCarat: dd.costPerCarat ? parseFloat(dd.costPerCarat) : null,
              rapPrice: dd.rapPrice ? parseFloat(dd.rapPrice) : null,
              rapDiscount: dd.rapDiscount ? parseFloat(dd.rapDiscount) : null,
              notes: dd.notes || null,
            }),
          })
        }

        // Save jewelry details if present
        if (item.jewelryData && created.inventoryItemId) {
          const jd = item.jewelryData
          await fetch("/api/jewelry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inventoryItemId: created.inventoryItemId,
              metal: jd.metal || null,
              brand: jd.brand || null,
              mainStone: jd.mainStone || null,
              costPerGram: jd.costPerGram ? parseFloat(jd.costPerGram) : null,
            }),
          })
        }

        // Save watch details if present
        if (item.watchData && created.inventoryItemId) {
          const wd = item.watchData
          await fetch("/api/watches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inventoryItemId: created.inventoryItemId,
              brand: wd.brand || null,
              referenceNumber: wd.referenceNumber || null,
              serialNumber: wd.serialNumber || null,
              caseMetal: wd.caseMetal || null,
              caseSizeMM: wd.caseSizeMM || null,
              box: wd.box || false,
              paperwork: wd.paperwork || false,
            }),
          })
        }
      }

      router.push(firstPurchaseId ? `/purchases/${firstPurchaseId}` : `/documents?tab=purchases`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (status === "loading" || !session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className={`mx-auto px-4 py-8 ${showDiamonds ? "max-w-[1400px]" : "max-w-6xl"}`}>
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-sm">&larr; Back</button>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{editId ? `Edit Purchase${editPurchaseNumber ? ` — ${editPurchaseNumber}` : ""}` : "Record Purchase"}</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

          {/* Seller Info */}
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Seller Information</h2>
            <div className="flex gap-3 mb-4">
              <button type="button" onClick={() => setIsNewLead(false)}
                className={`px-4 py-1.5 rounded text-sm font-medium ${!isNewLead ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                Existing Lead
              </button>
              <button type="button" onClick={() => { setIsNewLead(true); setSelectedLeadId("") }}
                className={`px-4 py-1.5 rounded text-sm font-medium ${isNewLead ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                New Lead
              </button>
            </div>

            {!isNewLead ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Seller (Lead) *</label>
                  <select required value={selectedLeadId} onChange={e => setSelectedLeadId(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                    <option value="">Select a lead</option>
                    {leads.map(l => (
                      <option key={l.id} value={l.id}>{l.name}{l.phone ? ` (${l.phone})` : l.email ? ` (${l.email})` : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                  <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ticket Total</label>
                  <div className="flex items-center gap-0.5">
                    <span className="text-gray-400 text-sm">$</span>
                    <input type="number" step="0.01" placeholder="0.00" value={ticketTotal}
                      onChange={e => setTicketTotal(e.target.value)}
                      className="block w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-right" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                  <input value={newLeadName} onChange={e => setNewLeadName(e.target.value)} required={isNewLead}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                  <input type="tel" value={newLeadPhone} onChange={e => setNewLeadPhone(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input type="email" value={newLeadEmail} onChange={e => setNewLeadEmail(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                  <select value={newLeadSource} onChange={e => setNewLeadSource(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                    {sources.map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Channel</label>
                  <select value={newLeadChannel} onChange={e => setNewLeadChannel(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                    {channels.map(c => <option key={c} value={c}>{c === "ONLINE_FORM" ? "Online Form" : c.replace("_", " ").charAt(0) + c.replace("_", " ").slice(1).toLowerCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                  <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ticket Total</label>
                  <div className="flex items-center gap-0.5">
                    <span className="text-gray-400 text-sm">$</span>
                    <input type="number" step="0.01" placeholder="0.00" value={ticketTotal}
                      onChange={e => setTicketTotal(e.target.value)}
                      className="block w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-right" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section toggles */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showDiamonds} onChange={toggleShowDiamonds}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Single Diamonds</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showJewelry} onChange={toggleShowJewelry}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Jewelry</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showWatches} onChange={toggleShowWatches}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Watches</span>
            </label>
          </div>

          {/* Regular Items Table */}
          <div className="bg-white rounded-lg shadow overflow-visible relative">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <span className="text-sm font-semibold text-gray-700">Items</span>
              <div className="flex items-center gap-3">
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
                <button type="button" onClick={addLineItem}
                  className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100">
                  + Add Row
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {visibleDefs.map(col => (
                      <th key={col.key} className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>
                        {col.label}
                      </th>
                    ))}
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody ref={tableBodyRef} className="divide-y divide-gray-100">
                  {lineItems.map(item => {
                    const cat = item.category ? categories[item.category] : null
                    const unit = cat?.unitLabel || "g"
                    const isLastRow = item.id === lineItems[lineItems.length - 1].id
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 group">
                        {visibleDefs.map(col => (
                          <td key={col.key} className={`${cellClass} align-middle`}>
                            {col.key === "category" && (
                              <select value={item.category}
                                onChange={e => updateLineItem(item.id, "category", e.target.value)}
                                className={selectClass + " min-w-[140px]"}>
                                <option value="">Select...</option>
                                {Object.entries(categories).filter(([, c]) => c.metalType !== "DIAMOND" && c.metalType !== "JEWELRY").map(([key, c]) => (
                                  <option key={key} value={key}>{c.label}</option>
                                ))}
                              </select>
                            )}
                            {col.key === "type" && (
                              <select value={item.subcategory} disabled={!item.category}
                                onChange={e => updateLineItem(item.id, "subcategory", e.target.value)}
                                className={selectClass + " min-w-[120px] disabled:opacity-40"}>
                                <option value="">Select...</option>
                                {cat?.subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            )}
                            {col.key === "description" && (
                              <input value={item.description} placeholder="Optional"
                                onChange={e => updateLineItem(item.id, "description", e.target.value)}
                                className={inputClass + " min-w-[130px]"}
                                {...tabProps("description", isLastRow)} />
                            )}
                            {col.key === "color" && (
                              <input value={item.color} placeholder="e.g. D"
                                onChange={e => updateLineItem(item.id, "color", e.target.value)}
                                className={inputClass + " min-w-[80px]"}
                                {...tabProps("color", isLastRow)} />
                            )}
                            {col.key === "clarity" && (
                              <input value={item.clarity} placeholder="e.g. VS1"
                                onChange={e => updateLineItem(item.id, "clarity", e.target.value)}
                                className={inputClass + " min-w-[80px]"}
                                {...tabProps("clarity", isLastRow)} />
                            )}
                            {col.key === "caratWeight" && (
                              <div className="flex items-center gap-0.5 min-w-[80px]">
                                <input type="number" step="0.01" placeholder="0.00" value={item.caratWeight}
                                  onChange={e => updateLineItem(item.id, "caratWeight", e.target.value)}
                                  className={numInputClass}
                                  {...tabProps("caratWeight", isLastRow)} />
                                <span className="text-xs text-gray-400">ct</span>
                              </div>
                            )}
                            {col.key === "quantity" && (
                              <div className="min-w-[50px]">
                                <input type="number" step="1" min="0" placeholder="0" value={item.quantity}
                                  onChange={e => updateLineItem(item.id, "quantity", e.target.value)}
                                  className={numInputClass}
                                  {...tabProps("quantity", isLastRow)} />
                              </div>
                            )}
                            {col.key === "weight" && (
                              <div className="flex items-center gap-1 min-w-[100px]">
                                <input type="number" step="0.0001" placeholder="0.000" value={item.weight}
                                  onChange={e => updateLineItem(item.id, "weight", e.target.value)}
                                  className={numInputClass}
                                  {...tabProps("weight", isLastRow)} />
                                <span className="text-xs text-gray-400 whitespace-nowrap">{unit}</span>
                              </div>
                            )}
                            {col.key === "pricePerUnit" && (
                              <div className="flex items-center gap-0.5 min-w-[110px]">
                                <span className="text-gray-400 text-sm">$</span>
                                <input type="number" step="0.0001" placeholder="0.00" value={item.pricePerUnit}
                                  onChange={e => updateLineItem(item.id, "pricePerUnit", e.target.value)}
                                  className={numInputClass}
                                  {...tabProps("pricePerUnit", isLastRow)} />
                                <span className="text-xs text-gray-400">/{unit}</span>
                              </div>
                            )}
                            {col.key === "pricePaid" && (
                              <div className="flex items-center gap-0.5 min-w-[100px]">
                                <span className="text-gray-400 text-sm">$</span>
                                <input type="number" step="0.01" placeholder="0.00" value={item.pricePaid}
                                  onChange={e => updateLineItem(item.id, "pricePaid", e.target.value)}
                                  className={numInputClass + " font-medium"}
                                  {...tabProps("pricePaid", isLastRow)} />
                              </div>
                            )}
                          </td>
                        ))}
                        <td className="px-1 text-center align-middle w-8">
                          {lineItems.length > 1 && (
                            <button type="button" onClick={() => removeLineItem(item.id)}
                              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none">
                              x
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Single Diamonds Table */}
          {showDiamonds && (
            <div className="bg-white rounded-lg shadow overflow-visible relative">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-blue-50">
                <span className="text-sm font-semibold text-gray-700">Single Diamonds</span>
                <button type="button" onClick={addDiamondRow}
                  className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100">
                  + Add Row
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>Code</th>
                      {DIAMOND_COL_HEADERS.map(h => (
                        <th key={h} className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>{h}</th>
                      ))}
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody ref={diamondBodyRef} className="divide-y divide-gray-100">
                    {diamondItems.map(item => {
                      const dd = item.diamondData || emptyDiamondData
                      const isLastRow = item.id === diamondItems[diamondItems.length - 1].id
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 group">
                          <td className={`${cellClass} align-middle`}>
                            <span className="px-2 py-1 text-xs font-mono font-semibold text-amber-600">{item.itemCode}</span>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={dd.shape} onChange={e => updateDiamondItem(item.id, "shape", e.target.value)}
                              className={selectClass + " min-w-[90px]"}>
                              <option value="">--</option>
                              {DIAMOND_SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <input type="number" step="0.01" value={dd.caratWeight} placeholder="0.00"
                              onChange={e => updateDiamondItem(item.id, "caratWeight", e.target.value)}
                              className={numInputClass + " min-w-[70px]"} />
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={dd.lab} onChange={e => updateDiamondItem(item.id, "lab", e.target.value)}
                              className={selectClass + " min-w-[65px]"}>
                              {DIAMOND_LABS.map(l => <option key={l} value={l}>{l || "--"}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <div className="flex items-center gap-1 min-w-[130px]">
                              <input value={dd.certNumber} placeholder="Cert #"
                                onChange={e => updateDiamondItem(item.id, "certNumber", e.target.value)}
                                className={inputClass + " flex-1"} />
                              {dd.certNumber && (
                                <button type="button"
                                  onClick={() => fetchGIA(item.id, dd.certNumber)}
                                  disabled={giaLoading[item.id]}
                                  className="px-1.5 py-1 text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap"
                                  title="Fetch from GIA">
                                  {giaLoading[item.id] ? "…" : "GIA"}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={dd.color} onChange={e => updateDiamondItem(item.id, "color", e.target.value)}
                              className={selectClass + " min-w-[55px]"}>
                              <option value="">--</option>
                              {DIAMOND_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={dd.clarity} onChange={e => updateDiamondItem(item.id, "clarity", e.target.value)}
                              className={selectClass + " min-w-[60px]"}>
                              <option value="">--</option>
                              {DIAMOND_CLARITIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={dd.fluorescence} onChange={e => updateDiamondItem(item.id, "fluorescence", e.target.value)}
                              className={selectClass + " min-w-[70px]"}>
                              {DIAMOND_FLUORESCENCE.map(f => <option key={f} value={f}>{f || "--"}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={dd.cutGrade} onChange={e => updateDiamondItem(item.id, "cutGrade", e.target.value)}
                              className={selectClass + " min-w-[70px]"}>
                              {DIAMOND_GRADES.map(g => <option key={g} value={g}>{g || "--"}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={dd.polish} onChange={e => updateDiamondItem(item.id, "polish", e.target.value)}
                              className={selectClass + " min-w-[70px]"}>
                              {DIAMOND_GRADES.map(g => <option key={g} value={g}>{g || "--"}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={dd.symmetry} onChange={e => updateDiamondItem(item.id, "symmetry", e.target.value)}
                              className={selectClass + " min-w-[70px]"}>
                              {DIAMOND_GRADES.map(g => <option key={g} value={g}>{g || "--"}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <div className="flex items-center gap-0.5 min-w-[80px]">
                              <span className="text-gray-400 text-sm">$</span>
                              <input type="number" step="0.01" value={dd.costPerCarat} placeholder="0.00"
                                onChange={e => updateDiamondItem(item.id, "costPerCarat", e.target.value)}
                                className={numInputClass} />
                            </div>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <div className="flex items-center gap-0.5 min-w-[70px]">
                              <input type="number" step="0.1" value={dd.rapDiscount} placeholder="e.g. -35"
                                onChange={e => updateDiamondItem(item.id, "rapDiscount", e.target.value)}
                                className={numInputClass} />
                              <span className="text-gray-400 text-xs">%</span>
                            </div>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <div className="flex items-center gap-0.5 min-w-[90px]">
                              <span className="text-gray-400 text-sm">$</span>
                              <input type="number" step="0.01" value={item.pricePaid} placeholder="0.00"
                                onChange={e => updateDiamondTotal(item.id, e.target.value)}
                                onKeyDown={e => { arrowNav(e); if (e.key === "Tab" && !e.shiftKey && isLastRow) { e.preventDefault(); addDiamondRow() } }}
                                className={numInputClass + " font-medium"} />
                            </div>
                          </td>
                          <td className="px-1 text-center align-middle w-8">
                            <button type="button" onClick={() => removeDiamondRow(item.id)}
                              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none">
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Jewelry Table */}
          {showJewelry && (
            <div className="bg-white rounded-lg shadow overflow-visible relative">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-purple-50">
                <span className="text-sm font-semibold text-gray-700">Jewelry</span>
                <button type="button" onClick={addJewelryRow}
                  className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100">
                  + Add Row
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>Code</th>
                      <th className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>Type</th>
                      {JEWELRY_COL_HEADERS.map(h => (
                        <th key={h} className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>{h}</th>
                      ))}
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody ref={jewelryBodyRef} className="divide-y divide-gray-100">
                    {jewelryItems.map(item => {
                      const jd = item.jewelryData || emptyJewelryData
                      const jCat = item.category ? categories[item.category] : null
                      const isLastRow = item.id === jewelryItems[jewelryItems.length - 1].id
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 group">
                          <td className={`${cellClass} align-middle`}>
                            <span className="px-2 py-1 text-xs font-mono font-semibold text-amber-600">{item.itemCode}</span>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={item.subcategory}
                              onChange={e => updateJewelrySubcategory(item.id, e.target.value)}
                              className={selectClass + " min-w-[100px]"}>
                              <option value="">Select...</option>
                              {jCat?.subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={jd.metal} onChange={e => updateJewelryItem(item.id, "metal", e.target.value)}
                              className={selectClass + " min-w-[80px]"}>
                              <option value="">--</option>
                              {JEWELRY_METALS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={jd.brand} onChange={e => updateJewelryItem(item.id, "brand", e.target.value)}
                              className={selectClass + " min-w-[80px]"}>
                              {JEWELRY_BRANDS.map(b => <option key={b} value={b}>{b || "--"}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={jd.mainStone} onChange={e => updateJewelryItem(item.id, "mainStone", e.target.value)}
                              className={selectClass + " min-w-[90px]"}>
                              {JEWELRY_STONES.map(s => <option key={s} value={s}>{s || "--"}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <div className="flex items-center gap-0.5 min-w-[80px]">
                              <input type="number" step="0.001" value={jd.weight} placeholder="0.000"
                                onChange={e => updateJewelryItem(item.id, "weight", e.target.value)}
                                className={numInputClass} />
                              <span className="text-xs text-gray-400">g</span>
                            </div>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <div className="flex items-center gap-0.5 min-w-[80px]">
                              <span className="text-gray-400 text-sm">$</span>
                              <input type="number" step="0.01" value={jd.costPerGram} placeholder="0.00"
                                onChange={e => updateJewelryItem(item.id, "costPerGram", e.target.value)}
                                className={numInputClass} />
                            </div>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <div className="flex items-center gap-0.5 min-w-[90px]">
                              <span className="text-gray-400 text-sm">$</span>
                              <input type="number" step="0.01" value={jd.totalPrice} placeholder="0.00"
                                onChange={e => updateJewelryItem(item.id, "totalPrice", e.target.value)}
                                onKeyDown={e => { arrowNav(e); if (e.key === "Tab" && !e.shiftKey && isLastRow) { e.preventDefault(); addJewelryRow() } }}
                                className={numInputClass + " font-medium"} />
                            </div>
                          </td>
                          <td className="px-1 text-center align-middle w-8">
                            <button type="button" onClick={() => removeJewelryRow(item.id)}
                              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none">
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Watches Table */}
          {showWatches && (
            <div className="bg-white rounded-lg shadow overflow-visible relative">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-teal-50">
                <span className="text-sm font-semibold text-gray-700">Watches</span>
                <button type="button" onClick={addWatchRow}
                  className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100">
                  + Add Row
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>Code</th>
                      <th className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>Type</th>
                      {WATCH_COL_HEADERS.map(h => (
                        <th key={h} className={`${cellClass} text-left text-xs font-semibold text-gray-500 uppercase py-2 whitespace-nowrap`}>{h}</th>
                      ))}
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody ref={watchBodyRef} className="divide-y divide-gray-100">
                    {watchItems.map(item => {
                      const wd = item.watchData || emptyWatchData
                      const wCat = item.category ? categories[item.category] : null
                      const isLastRow = item.id === watchItems[watchItems.length - 1].id
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 group">
                          <td className={`${cellClass} align-middle`}>
                            <span className="px-2 py-1 text-xs font-mono font-semibold text-amber-600">{item.itemCode}</span>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={item.subcategory}
                              onChange={e => updateWatchSubcategory(item.id, e.target.value)}
                              className={selectClass + " min-w-[100px]"}>
                              <option value="">Select...</option>
                              {wCat?.subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={wd.brand} onChange={e => updateWatchItem(item.id, "brand", e.target.value)}
                              className={selectClass + " min-w-[120px]"}>
                              {WATCH_BRANDS.map(b => <option key={b} value={b}>{b || "--"}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={wd.caseMetal} onChange={e => updateWatchItem(item.id, "caseMetal", e.target.value)}
                              className={selectClass + " min-w-[80px]"}>
                              {WATCH_METALS.map(m => <option key={m} value={m}>{m || "--"}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <select value={wd.caseSizeMM} onChange={e => updateWatchItem(item.id, "caseSizeMM", e.target.value)}
                              className={selectClass + " min-w-[75px]"}>
                              {WATCH_SIZES.map(s => <option key={s} value={s}>{s || "--"}</option>)}
                            </select>
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <input value={wd.referenceNumber} placeholder="Ref #"
                              onChange={e => updateWatchItem(item.id, "referenceNumber", e.target.value)}
                              className={inputClass + " min-w-[100px]"} />
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <input value={wd.serialNumber} placeholder="Serial #"
                              onChange={e => updateWatchItem(item.id, "serialNumber", e.target.value)}
                              className={inputClass + " min-w-[100px]"} />
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <input value={wd.description} placeholder="Optional"
                              onChange={e => updateWatchItem(item.id, "description", e.target.value)}
                              className={inputClass + " min-w-[120px]"} />
                          </td>
                          <td className={`${cellClass} align-middle text-center`}>
                            <input type="checkbox" checked={wd.box}
                              onChange={e => updateWatchItem(item.id, "box", e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                          </td>
                          <td className={`${cellClass} align-middle text-center`}>
                            <input type="checkbox" checked={wd.paperwork}
                              onChange={e => updateWatchItem(item.id, "paperwork", e.target.checked)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                          </td>
                          <td className={`${cellClass} align-middle`}>
                            <div className="flex items-center gap-0.5 min-w-[90px]">
                              <span className="text-gray-400 text-sm">$</span>
                              <input type="number" step="0.01" value={wd.totalCost} placeholder="0.00"
                                onChange={e => updateWatchItem(item.id, "totalCost", e.target.value)}
                                onKeyDown={e => { arrowNav(e); if (e.key === "Tab" && !e.shiftKey && isLastRow) { e.preventDefault(); addWatchRow() } }}
                                className={numInputClass + " font-medium"} />
                            </div>
                          </td>
                          <td className="px-1 text-center align-middle w-8">
                            <button type="button" onClick={() => removeWatchRow(item.id)}
                              className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none">
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Grand Total + Ticket Remaining */}
          <div className="bg-white rounded-lg shadow px-4 py-3 flex justify-between items-center">
            {ticketNum > 0 ? (
              <span className={`text-sm font-medium ${Math.abs(ticketRemaining) < 0.01 ? "text-green-600" : ticketRemaining > 0 ? "text-amber-600" : "text-red-600"}`}>
                {Math.abs(ticketRemaining) < 0.01
                  ? "Items match ticket total"
                  : ticketRemaining > 0
                    ? `$${ticketRemaining.toLocaleString("en-US", { minimumFractionDigits: 2 })} remaining`
                    : `$${Math.abs(ticketRemaining).toLocaleString("en-US", { minimumFractionDigits: 2 })} over ticket total`}
              </span>
            ) : <span />}
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-600">Total Paid</span>
              <span className={`text-lg font-bold ${ticketNum > 0 && Math.abs(ticketRemaining) < 0.01 ? "text-green-600" : "text-amber-600"}`}>
                ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Payment Method</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {PAYMENT_METHODS.map(method => {
                const active = payments.find(p => p.method === method)
                return (
                  <div key={method}>
                    <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
                      <input type="checkbox" checked={!!active} onChange={() => togglePayment(method)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                      <span className="text-sm font-medium text-gray-700">{method}</span>
                    </label>
                    {active && (
                      <div className="flex items-center gap-0.5">
                        <span className="text-gray-400 text-sm">$</span>
                        <input
                          type="number" step="0.01" placeholder="0.00" value={active.amount}
                          onChange={e => setPaymentAmount(method, e.target.value)}
                          className="block w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-right"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {payments.length > 0 && (
              <div className={`mt-4 flex items-center justify-between text-sm pt-3 border-t ${Math.abs(paymentDiff) < 0.01 ? "text-green-600" : "text-amber-600"}`}>
                <span>
                  {Math.abs(paymentDiff) < 0.01
                    ? "Payment matches total"
                    : paymentDiff > 0
                      ? `$${paymentDiff.toFixed(2)} still unaccounted`
                      : `$${Math.abs(paymentDiff).toFixed(2)} over total`}
                </span>
                <span className="font-semibold">
                  Payment total: ${paymentTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
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
              className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
              {loading ? "Saving..." : editId ? "Save Changes" : `Record ${lineItems.length + diamondItems.length + jewelryItems.length} Item${lineItems.length + diamondItems.length + jewelryItems.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </form>

      </main>
    </div>
  )
}

export default function NewPurchasePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <NewPurchaseForm />
    </Suspense>
  )
}
