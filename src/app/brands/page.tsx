"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"

interface Brand {
  id: string
  name: string
  type: string
  sortOrder: number
}

const SECTIONS: { type: string; label: string; placeholder: string }[] = [
  { type: "JEWELRY", label: "Jewelry Brands", placeholder: "Add brand and press Enter" },
  { type: "WATCH", label: "Watch Brands", placeholder: "Add brand and press Enter" },
  { type: "STONE", label: "Main Stones", placeholder: "Add stone and press Enter" },
]

export default function BrandsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [newName, setNewName] = useState<Record<string, string>>({ JEWELRY: "", WATCH: "", STONE: "" })
  const [error, setError] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session) fetchBrands()
  }, [session])

  async function fetchBrands() {
    setLoading(true)
    const res = await fetch("/api/brands")
    if (res.ok) {
      const data: Brand[] = await res.json()
      // Seed/backfill if any section's defaults are missing (e.g. STONE added later)
      const missingType = SECTIONS.some(s => !data.some(b => b.type === s.type))
      if (missingType) {
        await fetch("/api/brands/seed", { method: "POST" })
        const res2 = await fetch("/api/brands")
        if (res2.ok) setBrands(await res2.json())
      } else {
        setBrands(data)
      }
    }
    setLoading(false)
  }

  async function addBrand(type: string) {
    const name = (newName[type] || "").trim()
    if (!name) return
    setError("")
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    })
    if (res.ok) {
      const created = await res.json()
      setBrands([...brands, created])
      setNewName({ ...newName, [type]: "" })
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error || `Failed to add brand (${res.status})`)
    }
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return
    setError("")
    const res = await fetch(`/api/brands/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    })
    if (res.ok) {
      const updated = await res.json()
      setBrands(brands.map(b => b.id === editingId ? updated : b))
      setEditingId(null)
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error || `Failed to update brand (${res.status})`)
    }
  }

  async function deleteBrand(id: string) {
    if (!confirm("Delete this brand?")) return
    const res = await fetch(`/api/brands/${id}`, { method: "DELETE" })
    if (res.ok) setBrands(brands.filter(b => b.id !== id))
  }

  if (status === "loading" || !session) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Brands &amp; Stones</h1>
        <p className="text-sm text-gray-500 mb-6">
          These appear in the Brand and Main Stone dropdowns on Insert Stock and New Purchase.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : (
          <div className="space-y-6">
            {SECTIONS.map(section => {
              const list = brands.filter(b => b.type === section.type)
              return (
                <div key={section.type} className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{section.label}</h3>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {list.map(b => (
                      <span key={b.id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-sm">
                        {editingId === b.id ? (
                          <>
                            <input value={editName} onChange={e => setEditName(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveEdit() } }}
                              autoFocus
                              className="border rounded px-2 py-0.5 text-sm w-28" />
                            <button onClick={saveEdit} className="text-blue-600 hover:text-blue-800 text-xs font-semibold">Save</button>
                            <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 text-xs">Cancel</button>
                          </>
                        ) : (
                          <>
                            <span className="text-gray-700">{b.name}</span>
                            <button onClick={() => { setEditingId(b.id); setEditName(b.name) }}
                              className="text-blue-500 hover:text-blue-700 text-xs">edit</button>
                            <button onClick={() => deleteBrand(b.id)}
                              className="text-red-400 hover:text-red-600 text-xs font-bold">x</button>
                          </>
                        )}
                      </span>
                    ))}
                    {list.length === 0 && (
                      <span className="text-sm text-gray-400 italic">No brands yet</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input value={newName[section.type]}
                      onChange={e => setNewName({ ...newName, [section.type]: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addBrand(section.type) } }}
                      className="border rounded px-3 py-1.5 text-sm flex-1" placeholder={section.placeholder} />
                    <button onClick={() => addBrand(section.type)}
                      className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Add</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
