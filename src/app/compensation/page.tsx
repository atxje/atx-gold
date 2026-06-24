"use client"

import { useEffect, useState } from "react"
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
  comp: number
  itemCode: string | null
}

interface MonthRow {
  key: string
  label: string
  totalGrossProfit: number
  totalComp: number
  threshold: number
  reached: boolean
  remainingToThreshold: number
  purchases: PurchaseRow[]
}

interface Employee {
  userId: string
  name: string | null
  email: string
  months: MonthRow[]
}

const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })

function MonthCard({ m }: { m: MonthRow }) {
  const pct = Math.min(100, (m.totalGrossProfit / m.threshold) * 100)
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">{m.label}</h3>
          <div className="text-right">
            <div className="text-xs text-gray-400">Compensation earned</div>
            <div className={`text-xl font-bold ${m.totalComp > 0 ? "text-green-700" : "text-gray-400"}`}>
              {money(m.totalComp)}
            </div>
          </div>
        </div>

        {/* Threshold meter */}
        <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${m.reached ? "bg-green-500" : "bg-amber-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-xs">
          <span className="text-gray-600">
            Gross profit <span className="font-semibold text-gray-800">{money(m.totalGrossProfit)}</span>
            <span className="text-gray-400"> / {money(m.threshold)}</span>
          </span>
          {m.reached ? (
            <span className="text-green-700 font-medium">Threshold reached — earning 10%</span>
          ) : (
            <span className="text-amber-600 font-medium">{money(m.remainingToThreshold)} to go before 10% starts</span>
          )}
        </div>
      </div>

      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Date</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Doc</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Item</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Paid</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Gross Profit</th>
            <th className="text-right px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Comp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {m.purchases.map((p) => (
            <tr key={p.id} className="hover:bg-amber-50/40">
              <td className="px-5 py-2 text-sm text-gray-600 whitespace-nowrap">
                <Link href={`/purchases/${p.id}`} className="block">
                  {format(new Date(p.purchaseDate), "MMM d")}
                </Link>
              </td>
              <td className="px-3 py-2 text-sm">
                <Link href={`/purchases/${p.id}`} className="text-amber-600 hover:text-amber-700">
                  {p.purchaseNumber || "—"}
                </Link>
              </td>
              <td className="px-3 py-2 text-sm text-gray-700">
                <Link href={`/purchases/${p.id}`} className="block">
                  {p.itemCode ? `${p.itemCode} · ` : ""}{p.description}
                </Link>
              </td>
              <td className="px-3 py-2 text-right text-sm text-gray-600">{money(p.pricePaid)}</td>
              <td className="px-3 py-2 text-right text-sm text-gray-600">
                {p.grossProfit == null ? "—" : money(p.grossProfit)}
              </td>
              <td className={`px-5 py-2 text-right text-sm font-medium ${p.comp > 0 ? "text-green-700" : "text-gray-300"}`}>
                {money(p.comp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CompensationPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [role, setRole] = useState<string>("ADMIN")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (!session) return
    fetch("/api/reports/compensation")
      .then((r) => (r.ok ? r.json() : { role: "ADMIN", employees: [] }))
      .then((data) => {
        setRole(data.role || "ADMIN")
        setEmployees(data.employees || [])
        setSelected(data.employees?.[0]?.userId ?? null)
        setLoading(false)
      })
  }, [session])

  if (status === "loading" || !session)
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  const isAdmin = role === "ADMIN"
  const current = employees.find((e) => e.userId === selected) || employees[0] || null

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {isAdmin ? "Employee Compensation" : "My Compensation"}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          10% of gross profit, paid on the amount above {money(50000)} of gross profit in a calendar month.
        </p>

        {/* Employee selector (admin only) */}
        {isAdmin && employees.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {employees.map((e) => (
              <button
                key={e.userId}
                onClick={() => setSelected(e.userId)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                  current?.userId === e.userId
                    ? "bg-amber-100 text-amber-800 border-amber-300"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {e.name || e.email}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-12">Loading…</div>
        ) : !current || current.months.length === 0 ? (
          <div className="text-center text-gray-400 py-12">No purchases recorded yet.</div>
        ) : (
          <div className="space-y-6">
            {isAdmin && <div className="text-sm font-medium text-gray-700">{current.name || current.email}</div>}
            {current.months.map((m) => (
              <MonthCard key={m.key} m={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
