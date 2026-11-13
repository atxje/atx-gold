// Reasons an admin can give when correcting an item's weight or piece count
export const ADJUSTMENT_REASONS = [
  { code: "NOT_GOLD", label: "Not gold / failed test" },
  { code: "LOST", label: "Lost or missing" },
  { code: "WEIGHING", label: "Weighing correction" },
  { code: "ENTRY_MISTAKE", label: "Entry mistake" },
  { code: "OTHER", label: "Other (explain in the note)" },
] as const

export type AdjustmentReasonCode = (typeof ADJUSTMENT_REASONS)[number]["code"]

export function adjustmentReasonLabel(code: string): string {
  return ADJUSTMENT_REASONS.find(r => r.code === code)?.label ?? code
}
