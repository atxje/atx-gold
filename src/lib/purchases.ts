import type { Prisma } from "@/generated/prisma/client"
import { MetalType, WeightUnit } from "@/generated/prisma/client"
import { nextItemCode } from "./doc-numbers"

type Tx = Prisma.TransactionClient

// One line of a purchase document, as sent by the Record Purchase form.
export interface PurchaseLineInput {
  description: string
  metalType: string
  weight: number | string
  weightUnit?: string
  purity?: string | null
  pricePaid: number | string
  pricePerUnit?: number | string | null
  quantity?: number | string | null
  category?: string | null
  subcategory?: string | null
  diamondData?: Record<string, unknown> | null
  jewelryData?: Record<string, unknown> | null
  watchData?: Record<string, unknown> | null
}

export interface PurchaseHeader {
  purchaseNumber: string
  leadId: string
  userId: string
  purchaseDate: Date
  notes: string | null
  paymentMethod: string | null // JSON string
}

export class PurchaseInputError extends Error {}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : NaN
}

export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    GOLD_JEWELRY: "Gold Jewelry",
    SILVER: "Silver",
    COINS_SILVER: "Silver Coins/Bars",
    COINS_GOLD: "Gold Coins/Bars",
  }
  return labels[category] || category
}

// Only the known detail columns are written, so a stray field from the client
// can't break (or sneak into) the insert.
const DIAMOND_FIELDS = [
  "shape", "caratWeight", "color", "clarity", "lab", "certNumber", "cutGrade", "polish",
  "symmetry", "fluorescence", "measurements", "costPerCarat", "rapPrice", "rapDiscount", "notes",
] as const
const JEWELRY_FIELDS = ["metal", "brand", "mainStone", "costPerGram", "description"] as const
const WATCH_FIELDS = [
  "brand", "referenceNumber", "serialNumber", "caseMetal", "caseSizeMM", "box", "paperwork", "description",
] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(src: Record<string, unknown>, keys: readonly string[]): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}
  for (const k of keys) if (k in src) out[k] = src[k]
  return out
}

export function pickDiamond(d: Record<string, unknown>) { return pick(d, DIAMOND_FIELDS) }
export function pickJewelry(d: Record<string, unknown>) { return pick(d, JEWELRY_FIELDS) }
export function pickWatch(d: Record<string, unknown>) { return pick(d, WATCH_FIELDS) }

/**
 * Write one purchase line inside a transaction: stock it into inventory (new
 * coded item for diamonds/jewelry/watches, or add to the pooled category item),
 * save its diamond/jewelry/watch details, and create the Purchase row.
 * Throws on bad input or DB error so the whole transaction rolls back.
 */
export async function createPurchaseLine(
  tx: Tx,
  header: PurchaseHeader,
  line: PurchaseLineInput
): Promise<{ id: string; inventoryItemId: string | null; itemCode: string | null }> {
  const weight = num(line.weight)
  const pricePaid = num(line.pricePaid)
  const quantity = parseInt(String(line.quantity ?? "")) || 0
  const pricePerUnitRaw = line.pricePerUnit == null || line.pricePerUnit === "" ? null : num(line.pricePerUnit)

  if (!line.description || !line.metalType) {
    throw new PurchaseInputError("Each item needs a description and metal type")
  }
  if (!Object.values(MetalType).includes(line.metalType as MetalType)) {
    throw new PurchaseInputError(`Unknown metal type: ${line.metalType}`)
  }
  if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(pricePaid) || pricePaid < 0) {
    throw new PurchaseInputError(`"${line.description}": weight and price must be valid numbers`)
  }

  const metalType = line.metalType as MetalType
  const weightUnit = (Object.values(WeightUnit) as string[]).includes(line.weightUnit ?? "")
    ? (line.weightUnit as WeightUnit)
    : WeightUnit.GRAM
  const category = line.category || null
  const subcategory = line.subcategory || (metalType === "WATCH" ? "Watch" : null)

  let inventoryItemId: string | null = null
  let itemCode: string | null = null

  if (category && subcategory) {
    const isUniqueItem = metalType === "DIAMOND" || metalType === "JEWELRY" || metalType === "WATCH"
    if (isUniqueItem) {
      const prefix = metalType === "DIAMOND" ? "D" : metalType === "WATCH" ? "W" : "J"
      itemCode = await nextItemCode(tx, prefix)
      const item = await tx.inventoryItem.create({
        data: {
          itemCode,
          category,
          subcategory: itemCode, // item code keeps (category, subcategory) unique
          name: `${itemCode} – ${subcategory}`,
          weightUnit,
          totalWeight: weight,
          availableWeight: weight,
          totalCost: pricePaid,
          quantity,
        },
      })
      inventoryItemId = item.id

      if (line.diamondData) {
        await tx.diamondDetails.create({ data: { inventoryItemId, ...pickDiamond(line.diamondData) } })
      }
      if (line.jewelryData) {
        await tx.jewelryDetails.create({ data: { inventoryItemId, ...pickJewelry(line.jewelryData) } })
      }
      if (line.watchData) {
        await tx.watchDetails.create({ data: { inventoryItemId, ...pickWatch(line.watchData) } })
      }
    } else {
      const item = await tx.inventoryItem.upsert({
        where: { category_subcategory: { category, subcategory } },
        update: {
          totalWeight: { increment: weight },
          availableWeight: { increment: weight },
          totalCost: { increment: pricePaid },
          quantity: { increment: quantity },
        },
        create: {
          category,
          subcategory,
          name: `${subcategory} ${getCategoryLabel(category)}`,
          weightUnit,
          totalWeight: weight,
          availableWeight: weight,
          totalCost: pricePaid,
          quantity,
        },
      })
      inventoryItemId = item.id
    }
  }

  const purchase = await tx.purchase.create({
    data: {
      purchaseNumber: header.purchaseNumber,
      leadId: header.leadId,
      userId: header.userId,
      description: line.description,
      metalType,
      weight,
      weightUnit,
      purity: line.purity ?? null,
      pricePaid,
      pricePerUnit: pricePerUnitRaw != null && Number.isFinite(pricePerUnitRaw) ? pricePerUnitRaw : null,
      quantity,
      category,
      subcategory,
      inventoryItemId,
      purchaseDate: header.purchaseDate,
      notes: header.notes,
      paymentMethod: header.paymentMethod,
    },
    select: { id: true },
  })

  return { id: purchase.id, inventoryItemId, itemCode }
}
