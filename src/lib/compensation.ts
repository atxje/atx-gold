import { prisma } from "./prisma"
import { getSpotPrices, SpotPrices } from "./spot"

const GRAMS_PER_TROY_OZ = 31.1035

// Employee gross-profit comp rates. These are intentionally separate from the
// on-screen "melt" display rates in src/app/inventory/page.tsx.
//
// Gold scrap / gold jewelry: purity by karat × 98% of spot.
// Gold coins (net troy oz): full purity × 98% of spot.
const GOLD_PURITY: Record<string, number> = {
  "10K": 0.395,
  "14K": 0.565,
  "18K": 0.73,
  "21K": 0.875,
  "21K+": 0.875,
  "22K": 0.89,
  "24K": 0.98,
  "Mixed W/D": 0.565,
}
const GOLD_SPOT_FACTOR = 0.98

// Silver scrap: 91.5% purity × 85% of spot. Silver coins: $5 under spot per oz.
const SILVER_SCRAP_PURITY = 0.915
const SILVER_SCRAP_FACTOR = 0.85
const SILVER_COIN_UNDER_SPOT = 5

// Platinum scrap / jewelry: 88% purity × 90% of spot. Coins: full purity × 98% of spot.
const PLAT_SCRAP_PURITY = 0.88
const PLAT_SCRAP_FACTOR = 0.9
const PLAT_COIN_FACTOR = 0.98

export interface CompInput {
  metalType: string // GOLD | SILVER | PLATINUM | JEWELRY | WATCH | DIAMOND | ...
  weight: number
  weightUnit: string // GRAM | TROY_OZ
  subcategory?: string | null // karat for gold scrap, e.g. "14K"
  jewelryMetal?: string | null // for JEWELRY: "10K".."24K", "Plat", "Sterling"
}

// Market value of the metal at the comp rates. null = not compensated
// (watches, single diamonds, palladium, unrecognized metals).
export function compValue(input: CompInput, spot: SpotPrices): number | null {
  const { metalType, weight, weightUnit } = input
  if (!weight || weight <= 0) return null

  const goldPerGram = spot.gold / GRAMS_PER_TROY_OZ
  const silverPerGram = spot.silver / GRAMS_PER_TROY_OZ
  const platPerGram = spot.platinum / GRAMS_PER_TROY_OZ

  switch (metalType) {
    case "GOLD": {
      // Coins/bars are logged as net pure-gold troy oz → full purity × 98% spot
      if (weightUnit === "TROY_OZ") return weight * spot.gold * GOLD_SPOT_FACTOR
      // Scrap (gross grams): karat purity × 98% spot per gram
      const p = GOLD_PURITY[input.subcategory ?? ""]
      if (p === undefined) return null
      return weight * p * GOLD_SPOT_FACTOR * goldPerGram
    }
    case "SILVER": {
      if (weightUnit === "TROY_OZ") return weight * Math.max(0, spot.silver - SILVER_COIN_UNDER_SPOT)
      return weight * SILVER_SCRAP_PURITY * SILVER_SCRAP_FACTOR * silverPerGram
    }
    case "PLATINUM": {
      if (weightUnit === "TROY_OZ") return weight * spot.platinum * PLAT_COIN_FACTOR
      return weight * PLAT_SCRAP_PURITY * PLAT_SCRAP_FACTOR * platPerGram
    }
    case "JEWELRY": {
      const metal = input.jewelryMetal ?? ""
      if (metal === "Plat" || metal === "Platinum") {
        return weight * PLAT_SCRAP_PURITY * PLAT_SCRAP_FACTOR * platPerGram
      }
      if (metal === "Sterling" || metal === "Silver") {
        return weight * SILVER_SCRAP_PURITY * SILVER_SCRAP_FACTOR * silverPerGram
      }
      const p = GOLD_PURITY[metal]
      if (p === undefined) return null
      return weight * p * GOLD_SPOT_FACTOR * goldPerGram
    }
    default:
      return null // WATCH, DIAMOND, PALLADIUM, OTHER
  }
}

// Recompute and persist grossProfit for one purchase. Never throws — a spot
// fetch failure just leaves grossProfit unchanged (recomputable later).
export async function recalcPurchaseGrossProfit(purchaseId: string, spot?: SpotPrices): Promise<void> {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { inventoryItem: { include: { jewelryDetails: true } } },
    })
    if (!purchase) return

    const prices = spot ?? (await getSpotPrices())
    const value = compValue(
      {
        metalType: purchase.metalType,
        weight: purchase.weight,
        weightUnit: purchase.weightUnit,
        subcategory: purchase.subcategory,
        jewelryMetal: purchase.inventoryItem?.jewelryDetails?.metal ?? null,
      },
      prices
    )
    const grossProfit = value === null ? null : value - purchase.pricePaid
    await prisma.purchase.update({ where: { id: purchaseId }, data: { grossProfit } })
  } catch (error) {
    console.error("recalcPurchaseGrossProfit failed:", error)
  }
}

// Recompute gross profit for every purchase tied to an inventory item (used when
// jewelry metal, weight, or cost are edited after the fact).
export async function recalcGrossProfitForInventoryItem(inventoryItemId: string): Promise<void> {
  const purchases = await prisma.purchase.findMany({
    where: { inventoryItemId },
    select: { id: true },
  })
  if (purchases.length === 0) return
  let spot: SpotPrices | undefined
  try {
    spot = await getSpotPrices()
  } catch {
    return
  }
  for (const p of purchases) await recalcPurchaseGrossProfit(p.id, spot)
}

// ─── Employee compensation: 10% of monthly gross profit above a $50k floor ───

export const COMP_RATE = 0.1
export const MONTHLY_THRESHOLD = 50000

export interface MonthlyPurchase {
  id: string
  purchaseNumber: string | null
  purchaseDate: Date
  description: string
  metalType: string
  weight: number
  weightUnit: string
  pricePaid: number
  grossProfit: number | null
  itemCode: string | null
}

export interface MonthlyComp {
  totalGrossProfit: number
  totalComp: number
  threshold: number
  reached: boolean
  remainingToThreshold: number
  purchases: (MonthlyPurchase & { comp: number })[]
}

// Compensable gross profit at cumulative month-to-date total x.
function compensable(x: number): number {
  return Math.max(0, x - MONTHLY_THRESHOLD)
}

// Allocate each purchase a threshold-aware compensation, ordered chronologically,
// so the per-purchase comps telescope to 10% × max(0, monthlyGross − 50k).
export function allocateMonthlyComp(purchases: MonthlyPurchase[]): MonthlyComp {
  const ordered = [...purchases].sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime())
  let cum = 0
  let totalComp = 0
  const withComp = ordered.map((p) => {
    const gp = p.grossProfit ?? 0
    const before = cum
    cum += gp
    const comp = COMP_RATE * (compensable(cum) - compensable(before))
    totalComp += comp
    return { ...p, comp }
  })
  return {
    totalGrossProfit: cum,
    totalComp,
    threshold: MONTHLY_THRESHOLD,
    reached: cum >= MONTHLY_THRESHOLD,
    remainingToThreshold: Math.max(0, MONTHLY_THRESHOLD - cum),
    purchases: withComp,
  }
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function monthLabel(key: string): string {
  const [y, m] = key.split("-")
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`
}

function monthRangeUTC(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  return { start, end }
}

async function loadMonthPurchases(userId: string, start: Date, end: Date): Promise<MonthlyPurchase[]> {
  const rows = await prisma.purchase.findMany({
    where: { userId, purchaseDate: { gte: start, lt: end } },
    select: {
      id: true, purchaseNumber: true, purchaseDate: true, description: true,
      metalType: true, weight: true, weightUnit: true, pricePaid: true, grossProfit: true,
      inventoryItem: { select: { itemCode: true } },
    },
    orderBy: { purchaseDate: "asc" },
  })
  return rows.map((r) => ({ ...r, itemCode: r.inventoryItem?.itemCode ?? null }))
}

// Comp earned on specific purchase ids, evaluated within their calendar month so
// the $50k monthly threshold is respected. Used on the purchase document.
export async function compForPurchaseIds(
  userId: string,
  refDate: Date,
  ids: string[]
): Promise<Map<string, number>> {
  const { start, end } = monthRangeUTC(refDate)
  const purchases = await loadMonthPurchases(userId, start, end)
  const alloc = allocateMonthlyComp(purchases)
  const map = new Map<string, number>()
  const idSet = new Set(ids)
  for (const p of alloc.purchases) if (idSet.has(p.id)) map.set(p.id, p.comp)
  return map
}
