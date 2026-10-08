// US 90% silver coins (pre-1965 halves, quarters, dimes) are bought by count.
// Their weight is logged as NET troy oz of silver: 0.715 t oz per $1 face value.
//   half dollar ($0.50) → 0.3575 t oz   quarter ($0.25) → 0.17875 t oz
//   dime ($0.10)        → 0.0715 t oz

export const SILVER_OZT_PER_DOLLAR_FACE = 0.715

export const NINETY_PCT_COIN_TYPES = ["90% Half Dollars", "90% Quarters", "90% Dimes"] as const

// Face value of one coin for a 90% coin subcategory (matched loosely, so
// "90% Half Dollar", "90% half dollars" etc. all work), or null if not one.
export function ninetyPctFaceValue(subcategory: string | null | undefined): number | null {
  const s = (subcategory ?? "").toLowerCase()
  if (!s.includes("90")) return null
  if (s.includes("half")) return 0.5
  if (s.includes("quarter")) return 0.25
  if (s.includes("dime")) return 0.1
  return null
}

// Net troy oz of silver for a count of 90% coins, or null if not a 90% coin type
export function ninetyPctNetOzt(subcategory: string | null | undefined, quantity: number): number | null {
  const face = ninetyPctFaceValue(subcategory)
  if (face == null || !(quantity > 0)) return null
  return Math.round(quantity * face * SILVER_OZT_PER_DOLLAR_FACE * 100000) / 100000
}
