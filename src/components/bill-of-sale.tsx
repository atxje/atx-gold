import { BUSINESS } from "@/lib/business"
import { formatPurchaseDate } from "@/lib/purchase-date"
import { BILL_OF_SALE_TITLE, SELLER_DISCLAIMER, FOOTER_DISCLAIMER } from "@/lib/bill-of-sale-text"

// Print-only bill of sale (hidden on screen via `hidden print:block`).
// Lists what was sold without per-item prices: each category shows its lines
// (type, description, qty, weight) and one amount; then the grand total.
// Used for quick tickets and for full purchases.

export interface BillOfSaleLine {
  key: string
  category: string
  type?: string | null
  description?: string | null
  quantity?: number | null
  weight?: number | null
  weightUnit?: string | null
}

export interface BillOfSaleProps {
  purchaseNumber: string | null
  purchaseDate: string
  recordedAt: string | null // when it was entered (for the time)
  seller: {
    name: string
    address?: string | null
    phone?: string | null
    email?: string | null
    idNumber?: string | null
  }
  buyerName?: string | null // employee who made the purchase
  lines: BillOfSaleLine[]
  categoryTotals: { category: string; amount: number | null }[] // null = no per-category amount
  total?: number // grand total; defaults to the sum of the category amounts
  payments: { method: string; amount: number }[]
}

const UNIT: Record<string, string> = { GRAM: "g", TROY_OZ: "ozt", CARAT: "ct" }

export const METAL_LABEL: Record<string, string> = {
  GOLD: "Gold", SILVER: "Silver", PLATINUM: "Platinum", PALLADIUM: "Palladium",
  DIAMOND: "Diamonds", JEWELRY: "Jewelry", WATCH: "Watches", OTHER: "Other",
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })

const fmtWeight = (w: number, unit: string) =>
  `${w.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${UNIT[unit] || unit}`

function formatTime(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short",
  })
}

export function BillOfSale(p: BillOfSaleProps) {
  // Categories in the order given, plus any that only appear on lines
  const order = [...p.categoryTotals.map(t => t.category)]
  for (const l of p.lines) if (!order.includes(l.category)) order.push(l.category)
  const groups = order.map(name => {
    const lines = p.lines.filter(l => l.category === name)
    const weights: Record<string, number> = {}
    for (const l of lines) if (l.weight != null && l.weight > 0) {
      const u = l.weightUnit || "GRAM"
      weights[u] = (weights[u] || 0) + l.weight
    }
    const amount = p.categoryTotals.find(t => t.category === name)?.amount ?? null
    return { name, lines, weights, amount }
  })
  const total = p.total ?? p.categoryTotals.reduce((s, t) => s + (t.amount ?? 0), 0)
  const paidTotal = p.payments.reduce((s, x) => s + (x.amount || 0), 0)
  const time = formatTime(p.recordedAt)

  const label = "text-[10px] font-semibold uppercase tracking-wide text-gray-500"
  const field = "border-b border-gray-300 min-h-[1.4rem] pb-0.5 text-[12px] text-gray-900"

  return (
    <div className="hidden print:block text-gray-900 text-[12px] leading-snug">
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-gray-900 pb-3">
        <div>
          <div className="text-lg font-bold">{BUSINESS.name}</div>
          <div>{BUSINESS.address}</div>
          <div>{BUSINESS.city}</div>
          <div>{BUSINESS.phone}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold uppercase tracking-wide">{BILL_OF_SALE_TITLE}</div>
          <div className="mt-1"><span className="text-gray-500">No.</span> <span className="font-semibold">{p.purchaseNumber || "—"}</span></div>
          <div><span className="text-gray-500">Date:</span> {formatPurchaseDate(p.purchaseDate, "MMMM d, yyyy")}</div>
          {time && <div><span className="text-gray-500">Time:</span> {time}</div>}
        </div>
      </div>

      {/* Seller */}
      <div className="mt-4">
        <div className="text-[11px] font-bold uppercase tracking-wide mb-2">Seller Information</div>
        <div className="grid grid-cols-6 gap-x-4 gap-y-2">
          <div className="col-span-4"><div className={label}>Name</div><div className={field}>{p.seller.name}</div></div>
          <div className="col-span-2"><div className={label}>DL / ID #</div><div className={field}>{p.seller.idNumber || ""}</div></div>
          <div className="col-span-6"><div className={label}>Address</div><div className={field}>{p.seller.address || ""}</div></div>
          <div className="col-span-3"><div className={label}>Phone</div><div className={field}>{p.seller.phone || ""}</div></div>
          <div className="col-span-3"><div className={label}>Email</div><div className={field}>{p.seller.email || ""}</div></div>
        </div>
      </div>

      {/* Items by category — one amount per category, no per-item prices */}
      <div className="mt-5">
        <div className="text-[11px] font-bold uppercase tracking-wide mb-1">Items Purchased</div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-900 text-left text-[10px] uppercase tracking-wide text-gray-600">
              <th className="py-1 pr-2 font-semibold w-[18%]">Type</th>
              <th className="py-1 pr-2 font-semibold">Description</th>
              <th className="py-1 pr-2 font-semibold text-right w-[8%]">Qty</th>
              <th className="py-1 pr-2 font-semibold text-right w-[15%]">Weight</th>
              <th className="py-1 font-semibold text-right w-[15%]">Amount</th>
            </tr>
          </thead>
          {groups.map(g => (
            <tbody key={g.name} className="break-inside-avoid">
              <tr>
                <td colSpan={5} className="pt-2.5 pb-1 font-bold">{g.name}</td>
              </tr>
              {g.lines.map(l => (
                <tr key={l.key} className="border-b border-gray-200">
                  <td className="py-1 pr-2 align-top">{l.type || "—"}</td>
                  <td className="py-1 pr-2 align-top">{l.description || ""}</td>
                  <td className="py-1 pr-2 align-top text-right">{l.quantity && l.quantity > 0 ? l.quantity : ""}</td>
                  <td className="py-1 pr-2 align-top text-right whitespace-nowrap">
                    {l.weight != null && l.weight > 0 ? fmtWeight(l.weight, l.weightUnit || "GRAM") : ""}
                  </td>
                  <td className="py-1 align-top" />
                </tr>
              ))}
              <tr className="border-b border-gray-400">
                <td colSpan={3} className="py-1 pr-2 text-right font-semibold text-gray-600">{g.amount != null || Object.keys(g.weights).length ? `${g.name} total` : ""}</td>
                <td className="py-1 pr-2 text-right font-semibold whitespace-nowrap">
                  {Object.entries(g.weights).map(([u, w]) => fmtWeight(w, u)).join(" + ")}
                </td>
                <td className="py-1 text-right font-semibold whitespace-nowrap">{g.amount != null ? money(g.amount) : ""}</td>
              </tr>
            </tbody>
          ))}
        </table>
      </div>

      {/* Disclaimer #1 */}
      {SELLER_DISCLAIMER.length > 0 && (
        <div className="mt-4 border border-gray-400 p-2.5 text-[10.5px] leading-snug space-y-1.5 break-inside-avoid">
          {SELLER_DISCLAIMER.map((t, n) => <p key={n}>{t}</p>)}
        </div>
      )}

      {/* Totals and payment */}
      <div className="mt-4 flex justify-end break-inside-avoid">
        <table className="w-[55%] border-collapse">
          <tbody>
            <tr className="border-b-2 border-gray-900">
              <td className="py-1.5 font-bold uppercase">Total Amount Paid</td>
              <td className="py-1.5 text-right text-base font-bold">{money(total)}</td>
            </tr>
            {p.payments.length > 0 ? p.payments.map(x => (
              <tr key={x.method} className="border-b border-gray-200">
                <td className="py-1 text-gray-600">Paid by {x.method}</td>
                <td className="py-1 text-right">{money(x.amount)}</td>
              </tr>
            )) : (
              <tr className="border-b border-gray-200">
                <td className="py-1 text-gray-600">Method of payment</td>
                <td className="py-1 text-right text-gray-400">not recorded</td>
              </tr>
            )}
            {p.payments.length > 0 && Math.abs(paidTotal - total) > 0.005 && (
              <tr><td colSpan={2} className="pt-1 text-right text-[10px] text-gray-500">
                Payments recorded total {money(paidTotal)}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Signatures */}
      <div className="mt-8 grid grid-cols-2 gap-10 break-inside-avoid">
        <div>
          <div className="border-b border-gray-900 h-9" />
          <div className="mt-1 flex justify-between text-[10px] text-gray-600">
            <span>Seller Signature</span><span>Date</span>
          </div>
        </div>
        <div>
          <div className="border-b border-gray-900 h-9 flex items-end pb-0.5">{p.buyerName || ""}</div>
          <div className="mt-1 text-[10px] text-gray-600">Purchased by ({BUSINESS.name})</div>
        </div>
      </div>

      {/* Disclaimer #2 */}
      {FOOTER_DISCLAIMER.length > 0 && (
        <div className="mt-5 text-[9.5px] leading-snug text-gray-700 space-y-1 break-inside-avoid">
          {FOOTER_DISCLAIMER.map((t, n) => <p key={n}>{t}</p>)}
        </div>
      )}
    </div>
  )
}

// Build bill-of-sale lines and category totals from full purchase rows
export function billOfSaleFromPurchase(items: {
  id: string
  description: string
  metalType?: string
  category?: string | null
  subcategory?: string | null
  quantity: number
  weight: number
  weightUnit: string
  pricePaid: number
  inventoryItem?: { itemCode: string | null } | null
}[]) {
  const catName = (i: (typeof items)[number]) => i.category || METAL_LABEL[i.metalType ?? ""] || "Other"
  const lines: BillOfSaleLine[] = items.map(i => ({
    key: i.id,
    category: catName(i),
    type: i.inventoryItem?.itemCode || i.subcategory || null,
    description: i.description,
    quantity: i.quantity,
    weight: i.weight,
    weightUnit: i.weightUnit,
  }))
  const categoryTotals: { category: string; amount: number }[] = []
  for (const i of items) {
    const name = catName(i)
    const t = categoryTotals.find(x => x.category === name)
    if (t) t.amount += i.pricePaid
    else categoryTotals.push({ category: name, amount: i.pricePaid })
  }
  return { lines, categoryTotals }
}
