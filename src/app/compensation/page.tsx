"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { format } from "date-fns"

interface PurchaseRow {
  id: string
  purchaseNumber: string | null
  purchaseDate: string
  description: string
  metalType: string
  weight: number
  weightUnit: string
  pricePaid: number
  grossProfit: number | null
  lead: { name: string } | null
  inventoryItem: { itemCode: string | null } | null
}

interface Employee {
  userId: string
  name: string | null
  email: string
  purchaseCount: number
  compedCount: number
  totalPaid: number
  totalGrossProfit: number
  purchases: PurchaseRow[]
}

const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })

function ymd(d: Date) {
  return d.toISOString().split("T")[0]
}

export default function CompensationPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  const fetchData = useCallback(async (s: string, e: string) => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (s) qs.set("start", s)
    if (e) qs.set("end", e)
    const res = await fetch(`/api/reports/compensation?${qs.toString()}`)
    const data = res.ok ? await res.json() : { employees: [] }
    setEmployees(data.employees || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (session) fetchData(start, end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  function applyRange(s: string, e: string) {
    setStart(s)
    setEnd(e)
    fetchData(s, e)
  }

  function shortcut(kind: "mtd" | "ytd" | "all") {
    const now = new Date()
    if (kind === "all") return applyRange("", "")
    if (kind === "mtd") return applyRange(ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(now))
    return applyRange(ymd(new Date(now.getFullYear(), 0, 1)), ymd(now))
  }

  if (status === "loading" || !session)
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  const totalGross = employees.reduce((s, e) => s + e.totalGrossProfit, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Employee Compensation</h1>
        <p className="text-sm text-gray-500 mb-6">
          Gross profit per purchase = metal value at comp rates − price paid. Watches and single diamonds are not compensated.
        </p>

        {/* Date range */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
            </div>
            <button onClick={() => fetchData(start, end)}
              className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm font-medium hover:bg-amber-700">
              Apply
            </button>
            <div className="flex gap-1.5 ml-auto">
              {([["mtd", "MTD"], ["ytd", "YTD"], ["all", "All Time"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => shortcut(k)}
                  className="px-2.5 py-1.5 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50">
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">Loading…</div>
        ) : employees.length === 0 ? (
          <div className="text-center text-gray-400 py-12">No purchases in this period.</div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Employee</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Purchases</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total Paid</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Gross Profit</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employees.map(emp => (
                    <tr key={emp.userId} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{emp.name || emp.email}</div>
                        <div className="text-xs text-gray-400">{emp.email}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">
                        {emp.purchaseCount}
                        {emp.compedCount < emp.purchaseCount && (
                          <span className="text-gray-400"> ({emp.compedCount} comped)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">{money(emp.totalPaid)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-green-700">{money(emp.totalGrossProfit)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setExpanded(expanded === emp.userId ? null : emp.userId)}
                          className="text-xs text-amber-600 hover:text-amber-700">
                          {expanded === emp.userId ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-gray-700" colSpan={3}>Total Gross Profit</td>
                    <td className="px-4 py-3 text-right font-bold text-green-700">{money(totalGross)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Expanded detail */}
            {expanded && (() => {
              const emp = employees.find(e => e.userId === expanded)
              if (!emp) return null
              return (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 font-medium text-gray-800">
                    {emp.name || emp.email} — purchases
                  </div>
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Doc</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Item</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Weight</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Paid</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Gross Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {emp.purchases.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-600">{format(new Date(p.purchaseDate), "MMM d, yyyy")}</td>
                          <td className="px-4 py-2 text-sm">
                            <Link href={`/purchases/${p.id}`} className="text-amber-600 hover:text-amber-700">
                              {p.purchaseNumber || "—"}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-700">
                            {p.inventoryItem?.itemCode ? `${p.inventoryItem.itemCode} · ` : ""}{p.description}
                          </td>
                          <td className="px-4 py-2 text-right text-sm text-gray-600">
                            {p.weight ? `${p.weight.toFixed(3)} ${unitLabels[p.weightUnit] || ""}` : "—"}
                          </td>
                          <td className="px-4 py-2 text-right text-sm text-gray-600">{money(p.pricePaid)}</td>
                          <td className={`px-4 py-2 text-right text-sm font-medium ${p.grossProfit == null ? "text-gray-300" : p.grossProfit >= 0 ? "text-green-700" : "text-red-600"}`}>
                            {p.grossProfit == null ? "—" : money(p.grossProfit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}
