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
  category: string
  subcategory: string
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
  itemCode?: string
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
  return { id, category: "", subcategory: "", weight: "", pricePerUnit: "", pricePaid: "", description: "", color: "", clarity: "", caratWeight: "", lastEdited: "pricePaid" }
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
  const [notes, setNotes] = useState("")
  const [payments, setPayments] = useState<PaymentEntry[]>([])
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem(1)])
  const [nextId, setNextId] = useState(2)
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
    setLineItems([...lineItems, newLineItem(nextId)])
    setNextId(nextId + 1)
  }

  function addLineItemAndFocus() {
    setLineItems(prev => [...prev, newLineItem(nextId)])
    setNextId(prev => prev + 1)
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
  const [showDiamonds, setShowDiamonds] = useState(false)
  const [showJewelry, setShowJewelry] = useState(false)
  const diamondBodyRef = useRef<HTMLTableSectionElement>(null)
  const jewelryBodyRef = useRef<HTMLTableSectionElement>(null)
  const [focusDiamondRow, setFocusDiamondRow] = useState(false)
  const [focusJewelryRow, setFocusJewelryRow] = useState(false)
  const [nextDiamondNum, setNextDiamondNum] = useState<number>(0)
  const [nextJewelryNum, setNextJewelryNum] = useState<number>(0)

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

  async function fetchNextCode(prefix: "D" | "J"): Promise<number> {
    const res = await fetch(`/api/inventory/next-code?prefix=${prefix}`)
    if (!res.ok) return 1
    const { nextNum } = await res.json()
    return nextNum
  }

  async function toggleShowDiamonds() {
    if (!showDiamonds && diamondItems.length === 0) {
      const dCatEntry = Object.entries(categories).find(([, c]) => c.metalType === "DIAMOND")
      const dCatId = dCatEntry?.[0] || ""
      const singleSub = dCatEntry?.[1]?.subcategories.find(s => s.toLowerCase().includes("single")) || ""
      const num = await fetchNextCode("D")
      setNextDiamondNum(num + 1)
      setDiamondItems([{ ...newLineItem(nextId), category: dCatId, subcategory: singleSub, diamondData: { ...emptyDiamondData }, itemCode: `D${String(num).padStart(4, "0")}` }])
      setNextId(prev => prev + 1)
    }
    setShowDiamonds(!showDiamonds)
  }

  async function toggleShowJewelry() {
    if (!showJewelry && jewelryItems.length === 0) {
      const jCatEntry = Object.entries(categories).find(([, c]) => c.metalType === "JEWELRY")
      const jCatId = jCatEntry?.[0] || ""
      const num = await fetchNextCode("J")
      setNextJewelryNum(num + 1)
      setJewelryItems([{ ...newLineItem(nextId), category: jCatId, jewelryData: { ...emptyJewelryData }, itemCode: `J${String(num).padStart(4, "0")}` }])
      setNextId(prev => prev + 1)
    }
    setShowJewelry(!showJewelry)
  }

  function addDiamondRow() {
    const dCatEntry = Object.entries(categories).find(([, c]) => c.metalType === "DIAMOND")
    const dCatId = dCatEntry?.[0] || ""
    const singleSub = dCatEntry?.[1]?.subcategories.find(s => s.toLowerCase().includes("single")) || ""
    const code = `D${String(nextDiamondNum).padStart(4, "0")}`
    setNextDiamondNum(prev => prev + 1)
    setDiamondItems(prev => [...prev, { ...newLineItem(nextId), category: dCatId, subcategory: singleSub, diamondData: { ...emptyDiamondData }, itemCode: code }])
    setNextId(prev => prev + 1)
    setFocusDiamondRow(true)
  }

  function removeDiamondRow(id: number) {
    if (diamondItems.length > 1) setDiamondItems(diamondItems.filter(i => i.id !== id))
  }

  function addJewelryRow() {
    const jCatEntry = Object.entries(categories).find(([, c]) => c.metalType === "JEWELRY")
    const jCatId = jCatEntry?.[0] || ""
    const code = `J${String(nextJewelryNum).padStart(4, "0")}`
    setNextJewelryNum(prev => prev + 1)
    setJewelryItems(prev => [...prev, { ...newLineItem(nextId), category: jCatId, jewelryData: { ...emptyJewelryData }, itemCode: code }])
    setNextId(prev => prev + 1)
    setFocusJewelryRow(true)
  }

  function removeJewelryRow(id: number) {
    if (jewelryItems.length > 1) setJewelryItems(jewelryItems.filter(i => i.id !== id))
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

  const allItems = [...lineItems, ...diamondItems, ...jewelryItems]
  const grandTotal = allItems.reduce((s, i) => s + (parseFloat(i.pricePaid) || 0), 0)
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
    setLoading(true)
    try {
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
      const isRowFilled = (item: LineItem) => item.category && item.subcategory && item.weight && item.pricePaid
      const isRowEmpty = (item: LineItem) => !item.weight && !item.pricePaid
      const submitItems = [
        ...lineItems,
        ...(showDiamonds ? diamondItems : []),
        ...(showJewelry ? jewelryItems : []),
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
        if (item.jewelryData?.metal) {
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
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Record Purchase</h1>
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
                              <select required value={item.category}
                                onChange={e => updateLineItem(item.id, "category", e.target.value)}
                                className={selectClass + " min-w-[140px]"}>
                                <option value="">Select...</option>
                                {Object.entries(categories).filter(([, c]) => c.metalType !== "DIAMOND" && c.metalType !== "JEWELRY").map(([key, c]) => (
                                  <option key={key} value={key}>{c.label}</option>
                                ))}
                              </select>
                            )}
                            {col.key === "type" && (
                              <select required value={item.subcategory} disabled={!item.category}
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
                            {col.key === "weight" && (
                              <div className="flex items-center gap-1 min-w-[100px]">
                                <input type="number" step="0.0001" required placeholder="0.000" value={item.weight}
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
                                <input type="number" step="0.01" required placeholder="0.00" value={item.pricePaid}
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
                            <input value={dd.certNumber} placeholder="Cert #"
                              onChange={e => updateDiamondItem(item.id, "certNumber", e.target.value)}
                              className={inputClass + " min-w-[85px]"} />
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
                              <input type="number" step="0.01" required value={item.pricePaid} placeholder="0.00"
                                onChange={e => updateDiamondTotal(item.id, e.target.value)}
                                onKeyDown={e => { arrowNav(e); if (e.key === "Tab" && !e.shiftKey && isLastRow) { e.preventDefault(); addDiamondRow() } }}
                                className={numInputClass + " font-medium"} />
                            </div>
                          </td>
                          <td className="px-1 text-center align-middle w-8">
                            {diamondItems.length > 1 && (
                              <button type="button" onClick={() => removeDiamondRow(item.id)}
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
                            <select required value={item.subcategory}
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
                              <input type="number" step="0.01" required value={jd.totalPrice} placeholder="0.00"
                                onChange={e => updateJewelryItem(item.id, "totalPrice", e.target.value)}
                                onKeyDown={e => { arrowNav(e); if (e.key === "Tab" && !e.shiftKey && isLastRow) { e.preventDefault(); addJewelryRow() } }}
                                className={numInputClass + " font-medium"} />
                            </div>
                          </td>
                          <td className="px-1 text-center align-middle w-8">
                            {jewelryItems.length > 1 && (
                              <button type="button" onClick={() => removeJewelryRow(item.id)}
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
          )}

          {/* Grand Total */}
          <div className="bg-white rounded-lg shadow px-4 py-3 flex justify-end items-center gap-3">
            <span className="text-sm font-semibold text-gray-600">Total Paid</span>
            <span className="text-lg font-bold text-amber-600">
              ${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
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
              {loading ? "Recording..." : `Record ${lineItems.length} Item${lineItems.length > 1 ? "s" : ""}`}
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
