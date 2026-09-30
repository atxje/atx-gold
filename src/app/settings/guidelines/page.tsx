"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"

interface Guidelines {
  maxPctMeltGoldPlat: number
  maxPctMeltSilverScrap: number
  maxUnderSpotGoldPlatCoins: number
  maxUnderSpotSilverCoins: number
  maxUnderSpotSilverJunk: number
}

const FIELDS: { key: keyof Guidelines; label: string; help: string; asPercent: boolean }[] = [
  {
    key: "maxPctMeltGoldPlat",
    label: "Gold / platinum scrap & jewelry — max % of melt",
    help: "Flag when the price paid exceeds this fraction of melt value.",
    asPercent: true,
  },
  {
    key: "maxPctMeltSilverScrap",
    label: "Silverware & scrap silver — max % of melt",
    help: "Flag when the price paid exceeds this fraction of melt value.",
    asPercent: true,
  },
  {
    key: "maxUnderSpotGoldPlatCoins",
    label: "Gold / platinum coins & bars — $ under spot per ozt",
    help: "Flag when paid more than (spot − this amount) per fine troy oz.",
    asPercent: false,
  },
  {
    key: "maxUnderSpotSilverCoins",
    label: "Silver bullion coins & bars (.999) — $ under spot per ozt",
    help: "Flag when paid more than (spot − this amount) per fine troy oz.",
    asPercent: false,
  },
  {
    key: "maxUnderSpotSilverJunk",
    label: "Junk / 90% silver (Peace & Morgan dollars, US 90% & 40% coins) — $ under spot per ozt",
    help: "Separate, deeper discount for junk silver. Flag when paid more than (spot − this amount) per fine troy oz.",
    asPercent: false,
  },
]

export default function GuidelinesSettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const isAdmin = session?.user?.role === "ADMIN"

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
    else if (status === "authenticated" && !isAdmin) router.push("/")
  }, [status, isAdmin, router])

  useEffect(() => {
    if (!isAdmin) return
    fetch("/api/settings/guidelines")
      .then(r => (r.ok ? r.json() : null))
      .then((g: Guidelines | null) => {
        if (g) {
          setValues({
            maxPctMeltGoldPlat: String(Math.round(g.maxPctMeltGoldPlat * 100)),
            maxPctMeltSilverScrap: String(Math.round(g.maxPctMeltSilverScrap * 100)),
            maxUnderSpotGoldPlatCoins: String(g.maxUnderSpotGoldPlatCoins),
            maxUnderSpotSilverCoins: String(g.maxUnderSpotSilverCoins),
            maxUnderSpotSilverJunk: String(g.maxUnderSpotSilverJunk),
          })
        }
        setLoading(false)
      })
  }, [isAdmin])

  if (status === "loading" || !isAdmin || loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError("")
    setSuccess("")
    setSaving(true)

    const body = {
      maxPctMeltGoldPlat: (parseFloat(values.maxPctMeltGoldPlat) || 0) / 100,
      maxPctMeltSilverScrap: (parseFloat(values.maxPctMeltSilverScrap) || 0) / 100,
      maxUnderSpotGoldPlatCoins: parseFloat(values.maxUnderSpotGoldPlatCoins) || 0,
      maxUnderSpotSilverCoins: parseFloat(values.maxUnderSpotSilverCoins) || 0,
      maxUnderSpotSilverJunk: parseFloat(values.maxUnderSpotSilverJunk) || 0,
    }

    try {
      const res = await fetch("/api/settings/guidelines", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Failed to save")
      } else {
        setSuccess("Guidelines saved")
      }
    } catch {
      setError("Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Buying Guidelines</h1>
        <p className="text-sm text-gray-500 mb-6">
          Purchases exceeding these limits are flagged for review. Flags are visible to admins only
          and never block a purchase from saving.
        </p>

        <form onSubmit={handleSave} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-5">
          {error && <div className="bg-red-50 text-red-500 p-3 rounded text-sm">{error}</div>}
          {success && <div className="bg-green-50 text-green-600 p-3 rounded text-sm">{success}</div>}

          {FIELDS.map(f => (
            <div key={f.key}>
              <label htmlFor={f.key} className="block text-sm font-medium text-gray-700">
                {f.label}
              </label>
              <div className="mt-1 flex items-center gap-2">
                {!f.asPercent && <span className="text-gray-500 text-sm">$</span>}
                <input
                  id={f.key}
                  type="number"
                  step={f.asPercent ? 1 : 0.01}
                  min={0}
                  value={values[f.key] ?? ""}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  required
                  className="block w-40 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-amber-400 focus:border-amber-400 text-sm"
                />
                {f.asPercent && <span className="text-gray-500 text-sm">%</span>}
              </div>
              <p className="mt-1 text-xs text-gray-400">{f.help}</p>
            </div>
          ))}

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save guidelines"}
          </button>
        </form>
      </div>
    </div>
  )
}
