"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { format } from "date-fns"

interface DocumentRow {
  id: string
  purchaseNumber: string | null
  purchaseDate: string
  itemCount: number
  label: string
  comp: number
}

interface MonthRow {
  key: string
  label: string
  totalGrossProfit: number
  totalComp: number
  guarantee: number
  payout: number
  guaranteeApplied: boolean
  documents: DocumentRow[]
}

interface Employee {
  userId: string
  name: string | null
  email: string
  months: MonthRow[]
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })

function MonthCard({ m }: { m: MonthRow }) {
  const router = useRouter()
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{m.label}</h3>
          <div className="text-right">
            <div className="text-xs text-gray-400">Compensation</div>
            <div className="text-2xl font-bold text-green-700">{money(m.payout)}</div>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-gray-500">
            10% of gross profit (<span className="font-medium text-gray-700">{money(m.totalGrossProfit)}</span>) = {money(m.totalComp)}
          </span>
          {m.guaranteeApplied ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
              Guaranteed minimum {money(m.guarantee)} applied
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
              Above {money(m.guarantee)} guarantee
            </span>
          )}
        </div>
      </div>

      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Date</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Document</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Items</th>
            <th className="text-right px-5 py-2 text-xs font-semibold text-gray-500 uppercase">Compensation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {m.documents.length === 0 && (
            <tr>
              <td colSpan={4} className="px-5 py-4 text-center text-sm text-gray-400">
                No purchases yet this month — guaranteed minimum applies.
              </td>
            </tr>
          )}
          {m.documents.map((d) => (
            <tr
              key={d.id}
              onClick={() => router.push(`/purchases/${d.id}`)}
              className="hover:bg-amber-50/40 cursor-pointer"
            >
              <td className="px-5 py-2 text-sm text-gray-600 whitespace-nowrap">{format(new Date(d.purchaseDate), "MMM d")}</td>
              <td className="px-3 py-2 text-sm font-medium text-amber-600">{d.purchaseNumber || "—"}</td>
              <td className="px-3 py-2 text-sm text-gray-700">{d.label}</td>
              <td className={`px-5 py-2 text-right text-sm font-medium ${d.comp > 0 ? "text-green-700" : d.comp < 0 ? "text-red-600" : "text-gray-300"}`}>
                {money(d.comp)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 border-t border-gray-200">
          <tr>
            <td colSpan={3} className="px-5 py-2 text-sm font-semibold text-gray-700">Total (10%)</td>
            <td className="px-5 py-2 text-right text-sm font-bold text-gray-800">{money(m.totalComp)}</td>
          </tr>
        </tfoot>
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
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {isAdmin ? "Employee Compensation" : "My Compensation"}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          10% of gross profit, with a guaranteed minimum of {money(5000)} per month.
        </p>

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
