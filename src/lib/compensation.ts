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
