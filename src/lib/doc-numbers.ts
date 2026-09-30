import type { Prisma } from "@/generated/prisma/client"

// Race-safe document numbering.
//
// Every generator here must be called inside prisma.$transaction(async (tx) => …).
// It first takes a Postgres transaction-scoped advisory lock for that kind of
// number, so two saves happening at the same moment queue up instead of both
// reading the same "last number" and issuing a duplicate. The lock is released
// automatically when the transaction commits or rolls back.
//
// The next number is the numeric maximum of existing numbers + 1, so ordering
// keeps working past 9999 (a text sort would put "INV-9999" after "INV-10000").

type Tx = Prisma.TransactionClient

// Arbitrary fixed lock ids, one per document family
const LOCKS = {
  purchase: 730_101,
  invoice: 730_102,
  memo: 730_103,
  itemCode: 730_104,
} as const

async function lock(tx: Tx, id: number): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${id}::bigint)`
}

const pad = (n: number) => String(n).padStart(4, "0")

// Escape a literal prefix for use inside a POSIX regex
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")

/** PUR-0001, PUR-0002, … — one number per purchase document (shared by its lines). */
export async function nextPurchaseNumber(tx: Tx): Promise<string> {
  await lock(tx, LOCKS.purchase)
  const pattern = "^PUR-[0-9]+$"
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("purchaseNumber" FROM '[0-9]+$') AS INTEGER)) AS "max"
    FROM "Purchase" WHERE "purchaseNumber" ~ ${pattern}`
  const max = Number(rows[0]?.max ?? 0)
  return `PUR-${pad(max + 1)}`
}

/** INV-0001 for sales, TRN-0001 for transfers. */
export async function nextInvoiceNumber(tx: Tx, prefix: "INV-" | "TRN-"): Promise<string> {
  await lock(tx, LOCKS.invoice)
  const pattern = `^${reEscape(prefix)}[0-9]+$`
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("invoiceNumber" FROM '[0-9]+$') AS INTEGER)) AS "max"
    FROM "Invoice" WHERE "invoiceNumber" ~ ${pattern}`
  const max = Number(rows[0]?.max ?? 0)
  return `${prefix}${pad(max + 1)}`
}

/** MEM-0001, MEM-0002, … */
export async function nextMemoNumber(tx: Tx): Promise<string> {
  await lock(tx, LOCKS.memo)
  const pattern = "^MEM-[0-9]+$"
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("memoNumber" FROM '[0-9]+$') AS INTEGER)) AS "max"
    FROM "Memo" WHERE "memoNumber" ~ ${pattern}`
  const max = Number(rows[0]?.max ?? 0)
  return `MEM-${pad(max + 1)}`
}

/** Unique stock codes: D1000 (diamonds), J1000 (jewelry), W1000 (watches). */
export async function nextItemCode(tx: Tx, prefix: "D" | "J" | "W"): Promise<string> {
  await lock(tx, LOCKS.itemCode)
  const pattern = `^${prefix}[0-9]+$`
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("itemCode" FROM '[0-9]+$') AS INTEGER)) AS "max"
    FROM "InventoryItem" WHERE "itemCode" ~ ${pattern}`
  const max = Number(rows[0]?.max ?? 0)
  return `${prefix}${pad(max > 0 ? max + 1 : 1000)}`
}

/** Preview only (no lock, may be taken by the time the form is saved). */
export async function peekItemCodeNumber(
  db: Pick<Tx, "$queryRaw">,
  prefix: "D" | "J" | "W"
): Promise<number> {
  const pattern = `^${prefix}[0-9]+$`
  const rows = await db.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("itemCode" FROM '[0-9]+$') AS INTEGER)) AS "max"
    FROM "InventoryItem" WHERE "itemCode" ~ ${pattern}`
  const max = Number(rows[0]?.max ?? 0)
  return max > 0 ? max + 1 : 1000
}

/** Longer limits than Prisma's 5s default: multi-item documents do many round trips. */
export const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const
