import { format } from "date-fns"

// purchaseDate convention: the value is a calendar date, not a timestamp.
// New/edited purchases are pinned to NOON UTC so the UTC calendar day matches
// the day the user picked in every US timezone. Existing rows (stored at
// midnight UTC) share the same UTC calendar day as the day that was picked,
// so all rendering, grouping, and filtering goes through the UTC day — never
// the viewer's local day.

// Parse a user-picked date for saving. Date-only strings are pinned to noon
// UTC; anything else (full ISO from older clients) keeps its instant.
export function parsePurchaseDate(input: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T12:00:00.000Z`)
  }
  return new Date(input)
}

// The stored value's UTC calendar day as a local-time Date, safe to hand to
// date-fns format() and local day/month math without shifting days.
export function purchaseDateAsLocalDay(value: string | Date): Date {
  const d = typeof value === "string" ? new Date(value) : value
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// Render the UTC calendar day with a date-fns format string.
export function formatPurchaseDate(value: string | Date, fmt = "MMM d, yyyy"): string {
  return format(purchaseDateAsLocalDay(value), fmt)
}

// "YYYY-MM-DD" of the UTC calendar day — for grouping keys and
// <input type="date"> values.
export function purchaseDateKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value
  return d.toISOString().split("T")[0]
}

// "YYYY-MM" of the UTC calendar day — matches monthKey() in compensation.ts.
export function purchaseMonthKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

// Today's date in the user's local timezone as "YYYY-MM-DD", for defaulting
// date inputs (toISOString() would give tomorrow's date in the US evening).
export function todayInputValue(): string {
  return format(new Date(), "yyyy-MM-dd")
}
