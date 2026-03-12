"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"

interface Customer {
  id: string
  name: string
  address: string | null
  phone: string | null
  contactPerson: string | null
  salesTax: boolean
}

const empty = { name: "", address: "", phone: "", contactPerson: "", salesTax: false }

export default function CustomersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(empty)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (session) fetchCustomers()
  }, [session])

  async function fetchCustomers() {
    setLoading(true)
    const res = await fetch("/api/customers")
    if (res.ok) setCustomers(await res.json())
    setLoading(false)
  }

  function startAdd() {
    setEditingId(null)
    setForm(empty)
    setError("")
    setShowForm(true)
  }

  function startEdit(c: Customer) {
    setEditingId(c.id)
    setForm({ name: c.name, address: c.address || "", phone: c.phone || "", contactPerson: c.contactPerson || "", salesTax: c.salesTax })
    setError("")
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(empty)
    setError("")
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required"); return }
    setSaving(true)
    setError("")
    try {
      const url = editingId ? `/api/customers/${editingId}` : "/api/customers"
      const method = editingId ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save")
      await fetchCustomers()
      cancelForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this customer?")) return
    setDeleting(id)
    try {
      await fetch(`/api/customers/${id}`, { method: "DELETE" })
      setCustomers(customers.filter(c => c.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  if (status === "loading" || !session) return <div className="min-h-screen flex items-center justify-center">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <button onClick={startAdd} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
            + Add Customer
          </button>
        </div>

        {/* Add / Edit Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">{editingId ? "Edit Customer" : "New Customer"}</h2>
            {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm mb-4">{error}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700">Business Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Contact Person</label>
                <input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700">Address</label>
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.salesTax} onChange={e => setForm({ ...form, salesTax: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm font-medium text-gray-700">Charges Sales Tax</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={cancelForm} className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving..." : editingId ? "Save Changes" : "Add Customer"}
              </button>
            </div>
          </div>
        )}

        {/* Customers List */}
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : customers.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No customers yet. <button onClick={startAdd} className="text-blue-600 hover:underline">Add your first customer</button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sales Tax</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {customers.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{c.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{c.contactPerson || "—"}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{c.phone || "—"}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{c.address || "—"}</td>
                    <td className="px-6 py-4 text-center">
                      {c.salesTax
                        ? <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Yes</span>
                        : <span className="text-gray-300 text-xs">No</span>}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <button onClick={() => startEdit(c)} className="text-blue-600 hover:text-blue-800 mr-4">Edit</button>
                      <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50">
                        {deleting === c.id ? "..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
