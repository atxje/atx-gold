"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { Select } from "@/components/select"
import { ScanIdButton, type ScannedId } from "@/components/scan-id-button"
import { todayInputValue } from "@/lib/purchase-date"

// Quick Ticket — the fast version used with the customer at the desk:
// seller, what they sold (category / type / optional weight), one amount per
// category, payment. Prints a bill of sale to sign; the full purchase is
// completed later from the To Finish list under the same PUR number.

interface Category { id: string; name: string; metalType: string; weightUnit: string; subcategories: { name: string }[] }
interface Lead {
  id: string; name: string; phone: string | null; email: string | null
  address?: string | null; idNumber?: string | null; source?: string; channel?: string
}
interface Line { key: number; categoryId: string; type: string; quantity: string; weight: string; description: string }

const PAYMENT_METHODS = ["Cash", "Check", "Zelle / Venmo", "Bank Transfer"]
const SOURCES = ["ORGANIC", "PAID"]
const CHANNELS = ["WALK_IN", "PHONE", "TEXT", "ONLINE_FORM"]
const UNIT: Record<string, string> = { GRAM: "g", TROY_OZ: "ozt", CARAT: "ct" }
const channelLabel = (c: string) => c === "ONLINE_FORM" ? "Online Form" : c === "WALK_IN" ? "Walk-in" : c.charAt(0) + c.slice(1).toLowerCase()

const field = "block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
const cell = "w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
const label = "block text-xs font-medium text-gray-500 mb-1"

let keySeq = 1
const blankLine = (): Line => ({ key: keySeq++, categoryId: "", type: "", quantity: "", weight: "", description: "" })

export default function QuickTicketPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [categories, setCategories] = useState<Category[]>([])
  const [leads, setLeads] = useState<Lead[]>([])

  // Seller
  const [isNew, setIsNew] = useState(true)
  const [leadId, setLeadId] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [idNumber, setIdNumber] = useState("")
  const [source, setSource] = useState("ORGANIC")
  const [channel, setChannel] = useState("WALK_IN")
  const [scanNotice, setScanNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null)
  const scanOverride = useRef<{ address: string; idNumber: string } | null>(null)

  // Ticket
  const [date, setDate] = useState(todayInputValue())
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [catAmounts, setCatAmounts] = useState<Record<string, string>>({})
  const [payments, setPayments] = useState<{ method: string; amount: string; auto: boolean }[]>([])
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => { if (status === "unauthenticated") router.push("/login") }, [status, router])

  useEffect(() => {
    if (!session) return
    fetch("/api/categories").then(r => r.ok ? r.json() : []).then(setCategories)
    fetch("/api/leads").then(r => r.ok ? r.json() : []).then(setLeads)
  }, [session])

  // Existing seller picked → fill in what's on file
  useEffect(() => {
    if (isNew) return
    const l = leads.find(x => x.id === leadId)
    setPhone(l?.phone || ""); setEmail(l?.email || "")
    setSource(l?.source || "ORGANIC"); setChannel(l?.channel || "WALK_IN")
    if (scanOverride.current) {
      setAddress(scanOverride.current.address); setIdNumber(scanOverride.current.idNumber)
      scanOverride.current = null
    } else {
      setAddress(l?.address || ""); setIdNumber(l?.idNumber || "")
    }
  }, [leadId, leads, isNew])

  function switchToNew() {
    setIsNew(true); setLeadId(""); setName(""); setPhone(""); setEmail(""); setAddress(""); setIdNumber("")
    setSource("ORGANIC"); setChannel("WALK_IN")
  }

  function applyScannedId(id: ScannedId) {
    const notesOut: string[] = []
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "")
    const addr = id.address || address
    const dl = id.idNumber || idNumber
    if (!isNew && leadId) {
      const l = leads.find(x => x.id === leadId)
      if (id.name && l && norm(l.name) !== norm(id.name)) notesOut.push(`Name on ID is "${id.name}" but the selected seller is "${l.name}".`)
    } else if (id.name) {
      const match = leads.find(l => norm(l.name) === norm(id.name!))
      if (match) {
        scanOverride.current = { address: addr, idNumber: dl }
        setIsNew(false); setLeadId(match.id)
        notesOut.push(`Matched existing seller ${match.name}.`)
      } else {
        setIsNew(true); setName(id.name)
      }
    }
    setAddress(addr); setIdNumber(dl)
    const missing = [!id.name && "name", !id.address && "address", !id.idNumber && "DL #"].filter(Boolean)
    if (missing.length) notesOut.push(`Couldn't read: ${missing.join(", ")}.`)
    setScanNotice(id.expired
      ? { tone: "warn", text: `⚠ This ID expired on ${id.expirationDate}. ${notesOut.join(" ")}` }
      : { tone: missing.length || notesOut.some(n => n.startsWith("Name")) ? "warn" : "ok", text: ["ID read — please check.", ...notesOut].join(" ") })
  }

  // Lines
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories])
  function updateLine(key: number, patch: Partial<Line>) {
    setLines(prev => {
      const next = prev.map(l => l.key === key ? { ...l, ...patch, ...(patch.categoryId !== undefined ? { type: "" } : {}) } : l)
      // Always keep one empty row at the bottom, ready for the next item
      const last = next[next.length - 1]
      if (last.categoryId) next.push(blankLine())
      return next
    })
  }
  const removeLine = (key: number) => setLines(prev => prev.length > 1 ? prev.filter(l => l.key !== key) : [blankLine()])

  // One amount per category used on the ticket, in order of first use
  const usedCats = useMemo(() => {
    const ids: string[] = []
    for (const l of lines) if (l.categoryId && !ids.includes(l.categoryId)) ids.push(l.categoryId)
    return ids
  }, [lines])
  const amountOf = (id: string) => parseFloat(catAmounts[id] || "") || 0
  const total = Math.round(usedCats.reduce((s, id) => s + amountOf(id), 0) * 100) / 100

  // Payment: a single method follows the total automatically
  useEffect(() => {
    setPayments(prev => prev.length === 1 && prev[0].auto ? [{ ...prev[0], amount: total ? total.toFixed(2) : "" }] : prev)
  }, [total])
  function togglePayment(method: string) {
    setPayments(prev => {
      if (prev.some(p => p.method === method)) return prev.filter(p => p.method !== method)
      if (prev.length === 0) return [{ method, amount: total ? total.toFixed(2) : "", auto: true }]
      return [...prev.map(p => ({ ...p, auto: false })), { method, amount: "", auto: false }]
    })
  }
  const paidTotal = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)

  async function save() {
    setError("")
    if (isNew && !name.trim()) return setError("Enter the seller's name (or scan their ID)")
    if (!isNew && !leadId) return setError("Pick the seller")
    const filled = lines.filter(l => l.categoryId)
    if (filled.length === 0) return setError("Add at least one item")
    const missingAmt = usedCats.filter(id => !(amountOf(id) > 0)).map(id => catById[id]?.name)
    if (missingAmt.length) return setError(`Enter the amount for: ${missingAmt.join(", ")}`)
    if (payments.length && Math.abs(paidTotal - total) > 0.005 &&
        !confirm(`Payments add up to $${paidTotal.toFixed(2)} but the total is $${total.toFixed(2)}. Save anyway?`)) return

    setSaving(true)
    try {
      const res = await fetch("/api/quick-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNew ? { newLead: { name: name.trim(), phone, email, source, channel } } : { leadId }),
          seller: { address, idNumber, phone, email, source, channel },
          purchaseDate: date,
          notes,
          lines: filled.map(l => {
            const c = catById[l.categoryId]
            return {
              categoryId: l.categoryId, category: c?.name || "", type: l.type || null,
              quantity: parseInt(l.quantity) || null,
              weight: l.weight ? parseFloat(l.weight) : null, weightUnit: c?.weightUnit || "GRAM",
              description: l.description || null,
            }
          }),
          categoryTotals: usedCats.map(id => ({ category: catById[id]?.name || "", amount: amountOf(id) })),
          paymentMethod: payments.filter(p => p.amount).map(p => ({ method: p.method, amount: parseFloat(p.amount) })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save the ticket")
      router.push(`/purchases/quick/${data.id}?print=1`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the ticket")
      setSaving(false)
    }
  }

  if (status === "loading" || !session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <Link href="/purchases" className="text-sm text-gray-500 hover:text-gray-700">&larr; Purchases</Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Quick Ticket</h1>
            <p className="text-sm text-gray-500">For the customer to sign now — complete the full purchase later from <b>To Finish</b>.</p>
          </div>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

        {/* Seller */}
        <section className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-semibold text-gray-900 mr-2">Seller</h2>
            <button type="button" onClick={() => setIsNew(false)}
              className={`px-3 py-1.5 rounded text-sm font-medium ${!isNew ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>Existing</button>
            <button type="button" onClick={switchToNew}
              className={`px-3 py-1.5 rounded text-sm font-medium ${isNew ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>New</button>
            <div className="ml-auto"><ScanIdButton onScanned={applyScannedId} /></div>
          </div>
          {scanNotice && (
            <div className={`mb-3 px-3 py-2 rounded text-sm ${scanNotice.tone === "warn" ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-green-50 text-green-800 border border-green-200"}`}>{scanNotice.text}</div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              {isNew ? (
                <><label className={label}>Name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} className={field} autoFocus /></>
              ) : (
                <><label className={label}>Seller *</label>
                  <Select value={leadId} onChange={e => setLeadId(e.target.value)} className={field}>
                    <option value="">Select a seller</option>
                    {leads.map(l => <option key={l.id} value={l.id}>{l.name}{l.phone ? ` (${l.phone})` : ""}</option>)}
                  </Select></>
              )}
            </div>
            <div><label className={label}>Phone</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={field} /></div>
            <div><label className={label}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={field} /></div>
            <div className="col-span-2 md:col-span-3"><label className={label}>Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, City, State ZIP" className={field} /></div>
            <div className="col-span-2 md:col-span-1"><label className={label}>DL / ID #</label>
              <input value={idNumber} onChange={e => setIdNumber(e.target.value)} className={field} /></div>
            <div><label className={label}>Source</label>
              <Select value={source} onChange={e => setSource(e.target.value)} className={field}>
                {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
              </Select></div>
            <div><label className={label}>Channel</label>
              <Select value={channel} onChange={e => setChannel(e.target.value)} className={field}>
                {CHANNELS.map(c => <option key={c} value={c}>{channelLabel(c)}</option>)}
              </Select></div>
            <div><label className={label}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} /></div>
          </div>
        </section>

        {/* Items */}
        <section className="bg-white rounded-lg shadow p-5">
          <h2 className="font-semibold text-gray-900 mb-3">What they sold</h2>
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                <th className="pb-2 pr-2 w-[24%]">Category</th>
                <th className="pb-2 pr-2 w-[18%]">Type</th>
                <th className="pb-2 pr-2 w-[9%] text-right">Qty</th>
                <th className="pb-2 pr-2 w-[14%] text-right">Weight <span className="normal-case font-normal">(optional)</span></th>
                <th className="pb-2 pr-2">Description</th>
                <th className="pb-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map(l => {
                const c = catById[l.categoryId]
                const isLast = l.key === lines[lines.length - 1].key
                return (
                  <tr key={l.key}>
                    <td className="pr-2 pb-2">
                      <Select value={l.categoryId} onChange={e => updateLine(l.key, { categoryId: e.target.value })} className={cell}>
                        <option value="">{isLast ? "+ Add item…" : "—"}</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </Select>
                    </td>
                    <td className="pr-2 pb-2">
                      {c && c.subcategories.length > 0 ? (
                        <Select value={l.type} onChange={e => updateLine(l.key, { type: e.target.value })} className={cell}>
                          <option value="">—</option>
                          {c.subcategories.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                        </Select>
                      ) : <span className="text-xs text-gray-300 px-2">—</span>}
                    </td>
                    <td className="pr-2 pb-2">
                      <input type="number" min="0" step="1" value={l.quantity} disabled={!c}
                        onChange={e => updateLine(l.key, { quantity: e.target.value })} className={cell + " text-right"} />
                    </td>
                    <td className="pr-2 pb-2">
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" step="0.001" value={l.weight} disabled={!c}
                          onChange={e => updateLine(l.key, { weight: e.target.value })} className={cell + " text-right"} />
                        <span className="text-xs text-gray-400 w-6">{c ? UNIT[c.weightUnit] || "g" : ""}</span>
                      </div>
                    </td>
                    <td className="pr-2 pb-2">
                      <input value={l.description} disabled={!c} placeholder={c ? "e.g. chains, broken ring" : ""}
                        onChange={e => updateLine(l.key, { description: e.target.value })} className={cell} />
                    </td>
                    <td className="pb-2 text-right">
                      {!isLast && (
                        <button type="button" tabIndex={-1} onClick={() => removeLine(l.key)} title="Remove line"
                          className="text-gray-300 hover:text-red-500 text-lg leading-none px-1">×</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        {/* Amounts + payment */}
        <section className="bg-white rounded-lg shadow p-5 grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="font-semibold text-gray-900 mb-3">Amount per category</h2>
            {usedCats.length === 0 ? <p className="text-sm text-gray-400">Add items above.</p> : (
              <div className="space-y-2">
                {usedCats.map(id => (
                  <div key={id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-gray-800">{catById[id]?.name}</span>
                    <span className="text-gray-400 text-sm">$</span>
                    <input type="number" min="0" step="0.01" placeholder="0.00" value={catAmounts[id] || ""}
                      onChange={e => setCatAmounts(prev => ({ ...prev, [id]: e.target.value }))}
                      className="w-32 px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                  <span className="flex-1 font-bold text-gray-900">Total paid</span>
                  <span className="text-xl font-bold text-amber-600">${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            )}
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 mb-3">Payment</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {PAYMENT_METHODS.map(m => {
                const on = payments.some(p => p.method === m)
                return (
                  <button key={m} type="button" onClick={() => togglePayment(m)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${on ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50"}`}>{m}</button>
                )
              })}
            </div>
            {payments.map(p => (
              <div key={p.method} className="flex items-center gap-3 mb-1.5">
                <span className="text-sm text-gray-700 w-32">{p.method}</span>
                <span className="text-gray-400 text-sm">$</span>
                <input type="number" step="0.01" value={p.amount}
                  onChange={e => setPayments(prev => prev.map(x => x.method === p.method ? { ...x, amount: e.target.value, auto: false } : x))}
                  className="w-32 px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            ))}
            {payments.length > 0 && Math.abs(paidTotal - total) > 0.005 && (
              <p className="text-xs text-amber-700 mt-1">Payments add up to ${paidTotal.toFixed(2)} (total is ${total.toFixed(2)})</p>
            )}
            <label className={label + " mt-4"}>Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={field} />
          </div>
        </section>

        <div className="flex justify-end gap-3 pb-8">
          <button type="button" onClick={() => router.back()}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={save} disabled={saving}
            className="px-5 py-2 bg-amber-600 text-white rounded-md text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save & Print for Signature"}
          </button>
        </div>
      </main>
    </div>
  )
}
