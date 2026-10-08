import { prisma } from "./prisma"
import { getSpotPrices, SpotPrices } from "./spot"
import {
  GRAMS_PER_TROY_OZ,
  GOLD_PURITY,
  karatPurity,
  SILVER_SCRAP_PURITY,
  silverCoinSpecial,
  PLAT_SCRAP_PURITY,
} from "./compensation"

// Buying-guideline defaults, mirrored by the BuyingGuidelines schema defaults
export const GUIDELINE_DEFAULTS = {
  maxPctMeltGoldPlat: 0.8,
  maxPctMeltSilverScrap: 0.6,
  maxUnderSpotGoldPlatCoins: 150,
  maxUnderSpotSilverCoins: 8,
  maxUnderSpotSilverJunk: 15,
}

export type GuidelineValues = typeof GUIDELINE_DEFAULTS

// Singleton guidelines row, falling back to defaults. Never throws.
export async function loadGuidelines(): Promise<GuidelineValues> {
  try {
    const row = await prisma.buyingGuidelines.findFirst()
    return row ?? GUIDELINE_DEFAULTS
  } catch {
    return GUIDELINE_DEFAULTS
  }
}

// Remove the admin-only overpay fields from a purchase-shaped object before
// returning it to a non-admin session.
export function stripOverpay<T extends object>(purchase: T): T {
  const rest = { ...purchase } as Record<string, unknown>
  delete rest.overpayFlag
  delete rest.overpayReason
  delete rest.overpaySpotSnapshot
  return rest as T
}

export interface OverpayInput {
  metalType: string
  weight: number
  weightUnit: string
  subcategory?: string | null
  jewelryMetal?: string | null
  pricePaid: number
}

export interface OverpayResult {
  flag: boolean
  reason: string | null
  spotSnapshot: number | null
}

const NOT_APPLICABLE: OverpayResult = { flag: false, reason: null, spotSnapshot: null }

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" })

// Same item classification as the gross-profit calc in compensation.ts:
// TROY_OZ weight = coin/bar logged as net fine troy oz; GRAM weight = scrap/
// jewelry at the karat/metal purity.
export function evaluateOverpay(
  input: OverpayInput,
  g: GuidelineValues,
  spot: SpotPrices
): OverpayResult {
  const { metalType, weight, weightUnit, pricePaid } = input
  if (!weight || weight <= 0 || !pricePaid || pricePaid <= 0) return NOT_APPLICABLE

  const pctRule = (purity: number, spotPrice: number, maxPct: number, metalLabel: string): OverpayResult => {
    const melt = (weight * purity * spotPrice) / GRAMS_PER_TROY_OZ
    if (melt <= 0) return NOT_APPLICABLE
    if (pricePaid <= maxPct * melt) return { flag: false, reason: null, spotSnapshot: spotPrice }
    const pct = Math.round((pricePaid / melt) * 100)
    return {
      flag: true,
      reason: `Paid ${money(pricePaid)} = ${pct}% of melt (${money(melt)}); guideline ${Math.round(maxPct * 100)}% @ ${metalLabel} spot ${money(spotPrice)}`,
      spotSnapshot: spotPrice,
    }
  }

  const coinRule = (spotPrice: number, underSpot: number, metalLabel: string): OverpayResult => {
    const perOz = pricePaid / weight // weight is net fine troy oz
    const limit = spotPrice - underSpot
    if (perOz <= limit) return { flag: false, reason: null, spotSnapshot: spotPrice }
    return {
      flag: true,
      reason: `Paid ${money(perOz)}/fine ozt; guideline max ${money(limit)} (${metalLabel} spot ${money(spotPrice)} − ${money(underSpot)})`,
      spotSnapshot: spotPrice,
    }
  }

  switch (metalType) {
    case "GOLD": {
      if (weightUnit === "TROY_OZ") return coinRule(spot.gold, g.maxUnderSpotGoldPlatCoins, "gold")
      const p = karatPurity(input.subcategory ?? "", GOLD_PURITY)
      if (p === undefined) return NOT_APPLICABLE
      return pctRule(p, spot.gold, g.maxPctMeltGoldPlat, "gold")
    }
    case "SILVER": {
      if (weightUnit === "TROY_OZ") {
        // Junk/90% subcategories (Peace/Morgan, US 90%/40%) get their own
        // threshold — same classification as SILVER_COIN_SPECIAL in comp
        const isJunk = silverCoinSpecial(input.subcategory) !== undefined
        return coinRule(
          spot.silver,
          isJunk ? g.maxUnderSpotSilverJunk : g.maxUnderSpotSilverCoins,
          "silver"
        )
      }
      return pctRule(SILVER_SCRAP_PURITY, spot.silver, g.maxPctMeltSilverScrap, "silver")
    }
    case "PLATINUM": {
      if (weightUnit === "TROY_OZ") return coinRule(spot.platinum, g.maxUnderSpotGoldPlatCoins, "platinum")
      return pctRule(PLAT_SCRAP_PURITY, spot.platinum, g.maxPctMeltGoldPlat, "platinum")
    }
    case "JEWELRY": {
      const metal = input.jewelryMetal ?? ""
      if (metal === "Plat" || metal === "Platinum") {
        return pctRule(PLAT_SCRAP_PURITY, spot.platinum, g.maxPctMeltGoldPlat, "platinum")
      }
      if (metal === "Sterling" || metal === "Silver") {
        return pctRule(SILVER_SCRAP_PURITY, spot.silver, g.maxPctMeltSilverScrap, "silver")
      }
      const p = GOLD_PURITY[metal]
      if (p === undefined) return NOT_APPLICABLE
      return pctRule(p, spot.gold, g.maxPctMeltGoldPlat, "gold")
    }
    default:
      return NOT_APPLICABLE // WATCH, DIAMOND, PALLADIUM, OTHER
  }
}

// Recompute and persist the overpay flag for one purchase. Informational only:
// never throws, never blocks a save. A spot-fetch failure leaves the row as-is.
export async function applyOverpayFlag(
  purchaseId: string,
  guidelines?: GuidelineValues,
  spot?: SpotPrices
): Promise<void> {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: { inventoryItem: { include: { jewelryDetails: true } } },
    })
    if (!purchase) return

    const g = guidelines ?? (await loadGuidelines())
    const prices = spot ?? (await getSpotPrices())

    const result = evaluateOverpay(
      {
        metalType: purchase.metalType,
        weight: purchase.weight,
        weightUnit: purchase.weightUnit,
        subcategory: purchase.subcategory,
        jewelryMetal: purchase.inventoryItem?.jewelryDetails?.metal ?? null,
        pricePaid: purchase.pricePaid,
      },
      g,
      prices
    )

    await prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        overpayFlag: result.flag,
        overpayReason: result.reason,
        overpaySpotSnapshot: result.spotSnapshot,
      },
    })
  } catch (error) {
    console.error("applyOverpayFlag failed:", error)
  }
}

// Recompute overpay flags for every purchase tied to an inventory item — used
// when jewelry metal is saved or edited after the purchase row was created.
export async function applyOverpayFlagForInventoryItem(inventoryItemId: string): Promise<void> {
  try {
    const purchases = await prisma.purchase.findMany({
      where: { inventoryItemId },
      select: { id: true },
    })
    if (purchases.length === 0) return
    const guidelines = await loadGuidelines()
    const spot = await getSpotPrices()
    for (const p of purchases) await applyOverpayFlag(p.id, guidelines, spot)
  } catch (error) {
    console.error("applyOverpayFlagForInventoryItem failed:", error)
  }
}
