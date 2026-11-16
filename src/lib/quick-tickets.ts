// Shared by saving a new quick ticket and editing an open one: clean up the
// item lines and work out the per-category amounts and the total.

export interface TicketLine {
  categoryId: string | null
  category: string
  type: string | null
  quantity: number | null
  weight: number | null
  weightUnit: string
  description: string | null
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : null
}

export type ParsedTicket =
  | { error: string }
  | { error?: undefined; lines: TicketLine[]; categoryTotals: { category: string; amount: number | null }[]; total: number }

export function parseTicketBody(body: Record<string, unknown>): ParsedTicket {
  const lines: TicketLine[] = (Array.isArray(body.lines) ? body.lines : [])
    .filter((l: Record<string, unknown>) => l && typeof l.category === "string" && l.category.trim())
    .map((l: Record<string, unknown>) => ({
      categoryId: typeof l.categoryId === "string" ? l.categoryId : null,
      category: String(l.category).trim(),
      type: typeof l.type === "string" && l.type.trim() ? l.type.trim() : null,
      quantity: num(l.quantity) && num(l.quantity)! > 0 ? Math.round(num(l.quantity)!) : null,
      weight: num(l.weight) && num(l.weight)! > 0 ? num(l.weight) : null,
      weightUnit: typeof l.weightUnit === "string" ? l.weightUnit : "GRAM",
      description: typeof l.description === "string" && l.description.trim() ? l.description.trim() : null,
    }))
  if (lines.length === 0) return { error: "Add at least one item" }

  // Amounts: either one per category (total = their sum) or none, with just
  // a grand total. Categories without an amount are stored as null.
  const cats = [...new Set(lines.map(l => l.category))]
  const given: Record<string, number> = {}
  for (const t of (Array.isArray(body.categoryTotals) ? body.categoryTotals : []) as { category?: unknown; amount?: unknown }[]) {
    const a = num(t?.amount)
    if (typeof t?.category === "string" && a != null && a > 0) given[t.category] = a
  }
  const anyGiven = cats.some(c => given[c] != null)
  if (anyGiven && cats.some(c => given[c] == null)) {
    return { error: "Enter an amount for every category, or none and just the total" }
  }
  const categoryTotals = cats.map(c => ({ category: c, amount: anyGiven ? given[c] : null }))
  const total = anyGiven
    ? Math.round(cats.reduce((s, c) => s + given[c], 0) * 100) / 100
    : Math.round((num(body.total) ?? 0) * 100) / 100
  if (!(total > 0)) return { error: "Enter the total paid" }
  return { lines, categoryTotals, total }
}

export function paymentJson(body: Record<string, unknown>): string | null {
  return Array.isArray(body.paymentMethod) && body.paymentMethod.length ? JSON.stringify(body.paymentMethod) : null
}
