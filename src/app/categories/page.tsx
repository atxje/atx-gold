"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"

interface Subcategory {
  id: string
  name: string
  sortOrder: number
}

interface Category {
  id: string
  name: string
  metalType: string
  weightUnit: string
  sortOrder: number
  subcategories: Subcategory[]
}

const metalTypes = ["GOLD", "SILVER", "PLATINUM", "PALLADIUM", "DIAMOND", "JEWELRY", "WATCH", "OTHER"]
const weightUnits = [
  { value: "GRAM", label: "Grams (g)" },
  { value: "TROY_OZ", label: "Troy Oz (oz)" },
  { value: "CARAT", label: "Carats (ct)" },
]
const metalLabels: Record<string, string> = { GOLD: "Gold", SILVER: "Silver", PLATINUM: "Platinum", PALLADIUM: "Palladium", DIAMOND: "Diamond", JEWELRY: "Jewelry", WATCH: "Watch", OTHER: "Other" }
const unitLabels: Record<string, string> = { GRAM: "g", TROY_OZ: "oz", CARAT: "ct" }

export default function CategoriesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editMetal, setEditMetal] = useState("GOLD")
  const [editUnit, setEditUnit] = useState("GRAM")
  const [editSubs, setEditSubs] = useState<string[]>([])
  const [newSubName, setNewSubName] = useState("")
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState("")
  const [addMetal, setAddMetal] = useState("GOLD")
  const [addUnit, setAddUnit] = useState("GRAM")
  const [addSubs, setAddSubs] = useState<string[]>([])
  const [addSubInput, setAddSubInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session) fetchCategories()
  }, [session])

  async function fetchCategories() {
    setLoading(true)
    const res = await fetch("/api/categories")
    if (res.ok) {
      const data = await res.json()
      setCategories(data)
      // Auto-seed if empty
      if (data.length === 0) {
        await fetch("/api/categories/seed", { method: "POST" })
        const res2 = await fetch("/api/categories")
        if (res2.ok) setCategories(await res2.json())
      }
    }
    setLoading(false)
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditMetal(cat.metalType)
    setEditUnit(cat.weightUnit)
    setEditSubs(cat.subcategories.map(s => s.name))
    setNewSubName("")
  }

  function cancelEdit() {
    setEditingId(null)
    setNewSubName("")
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return
    setSaving(true)
    const res = await fetch(`/api/categories/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, metalType: editMetal, weightUnit: editUnit, subcategories: editSubs }),
    })
    if (res.ok) {
      const updated = await res.json()
      setCategories(categories.map(c => c.id === editingId ? updated : c))
      setEditingId(null)
    }
    setSaving(false)
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category and all its subcategories?")) return
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" })
    if (res.ok) setCategories(categories.filter(c => c.id !== id))
  }

  async function addCategory() {
    if (!addName.trim()) return
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName, metalType: addMetal, weightUnit: addUnit, subcategories: addSubs }),
      })
      if (res.ok) {
        const created = await res.json()
        setCategories([...categories, created])
        setShowAdd(false)
        setAddName("")
        setAddMetal("GOLD")
        setAddUnit("GRAM")
        setAddSubs([])
        setAddSubInput("")
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error || `Failed to create category (${res.status})`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    }
    setSaving(false)
  }

  function addEditSub() {
    const name = newSubName.trim()
    if (!name || editSubs.includes(name)) return
    setEditSubs([...editSubs, name])
    setNewSubName("")
  }

  function removeEditSub(i: number) {
    setEditSubs(editSubs.filter((_, idx) => idx !== i))
  }

  function addNewSub() {
    const name = addSubInput.trim()
    if (!name || addSubs.includes(name)) return
    setAddSubs([...addSubs, name])
    setAddSubInput("")
  }

  function removeNewSub(i: number) {
    setAddSubs(addSubs.filter((_, idx) => idx !== i))
  }

  if (status === "loading" || !session) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Stock Categories</h1>
          <button onClick={() => { setShowAdd(true); setAddName(""); setAddSubs([]) }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
            + Add Category
          </button>
        </div>

        {/* Add new category form */}
        {showAdd && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">New Category</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input value={addName} onChange={e => setAddName(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. Scrap Gold" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Metal Type</label>
                <select value={addMetal} onChange={e => setAddMetal(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm">
                  {metalTypes.map(m => <option key={m} value={m}>{metalLabels[m]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weight Unit</label>
                <select value={addUnit} onChange={e => setAddUnit(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm">
                  {weightUnits.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Subcategories</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {addSubs.map((sub, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm">
                    {sub}
                    <button onClick={() => removeNewSub(i)} className="text-red-400 hover:text-red-600 text-xs font-bold">x</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={addSubInput} onChange={e => setAddSubInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNewSub() } }}
                  className="border rounded px-3 py-1.5 text-sm flex-1" placeholder="Type subcategory name and press Enter" />
                <button onClick={addNewSub}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">Add</button>
              </div>
            </div>
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
            )}
            <div className="flex gap-2">
              <button onClick={addCategory} disabled={saving || !addName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving..." : "Create Category"}
              </button>
              <button onClick={() => setShowAdd(false)}
                className="px-4 py-2 border border-gray-300 text-gray-600 rounded text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : categories.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No categories yet. Click &quot;+ Add Category&quot; to create one.
          </div>
        ) : (
          <div className="space-y-4">
            {categories.map(cat => (
              <div key={cat.id} className="bg-white rounded-lg shadow">
                {editingId === cat.id ? (
                  /* Edit mode */
                  <div className="p-6">
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input value={editName} onChange={e => setEditName(e.target.value)}
                          className="w-full border rounded px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Metal Type</label>
                        <select value={editMetal} onChange={e => setEditMetal(e.target.value)}
                          className="w-full border rounded px-3 py-2 text-sm">
                          {metalTypes.map(m => <option key={m} value={m}>{metalLabels[m]}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Weight Unit</label>
                        <select value={editUnit} onChange={e => setEditUnit(e.target.value)}
                          className="w-full border rounded px-3 py-2 text-sm">
                          {weightUnits.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subcategories</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {editSubs.map((sub, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm">
                            {sub}
                            <button onClick={() => removeEditSub(i)} className="text-red-400 hover:text-red-600 text-xs font-bold">x</button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={newSubName} onChange={e => setNewSubName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addEditSub() } }}
                          className="border rounded px-3 py-1.5 text-sm flex-1" placeholder="Add subcategory..." />
                        <button onClick={addEditSub}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">Add</button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} disabled={saving}
                        className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button onClick={cancelEdit}
                        className="px-4 py-2 border border-gray-300 text-gray-600 rounded text-sm hover:bg-gray-50">Cancel</button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div className="p-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{cat.name}</h3>
                        <div className="flex gap-3 mt-1">
                          <span className="text-sm text-gray-500">{metalLabels[cat.metalType]}</span>
                          <span className="text-sm text-gray-400">|</span>
                          <span className="text-sm text-gray-500">Weight: {unitLabels[cat.weightUnit]}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(cat)}
                          className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded">Edit</button>
                        <button onClick={() => deleteCategory(cat.id)}
                          className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded">Delete</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {cat.subcategories.map(sub => (
                        <span key={sub.id} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                          {sub.name}
                        </span>
                      ))}
                      {cat.subcategories.length === 0 && (
                        <span className="text-sm text-gray-400 italic">No subcategories</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
