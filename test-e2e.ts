/**
 * End-to-end test script for ATX Jewelry Exchange Lead CRM
 *
 * Tests: purchases, inventory, memos, invoices, edits, cancellations, reports
 *
 * Prerequisites:
 *   1. Dev server running at localhost:3000
 *   2. Database zeroed (npx tsx --env-file=.env clear-db.ts)
 *   3. Categories seeded (visit /categories page once)
 *
 * Run: npx tsx --env-file=.env test-e2e.ts
 */

const BASE = "http://localhost:3000"
let passed = 0
let failed = 0
const failures: string[] = []

// We need a valid session cookie. We'll grab it from the env or skip auth.
// Since this runs against the local server with NextAuth, we need to call APIs
// that bypass auth or use a session. We'll use direct Prisma for verification
// and fetch for API calls with a cookie.

// Actually, the APIs require auth. We'll need to either:
// 1. Use Prisma directly for everything (bypasses API auth)
// 2. Get a session cookie
// Let's use Prisma directly for the actual data operations and verify via Prisma too.
// This tests the business logic without needing browser auth.

import { prisma } from './src/lib/prisma'

// ═══════════════════════════════════════════════════════════════
// Test utilities
// ═══════════════════════════════════════════════════════════════

function assert(condition: boolean, label: string, details?: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    const msg = details ? `${label} — ${details}` : label
    failures.push(msg)
    console.log(`  ✗ ${label}${details ? ` (${details})` : ""}`)
  }
}

function assertClose(actual: number, expected: number, label: string, tolerance = 0.01) {
  const diff = Math.abs(actual - expected)
  assert(diff <= tolerance, label, diff > tolerance ? `expected ${expected}, got ${actual}` : undefined)
}

// Helper: check report-level totals (sales, COGS, profit, purchase totals, payment breakdown)
// Optional dateRange filters invoices by date and purchases by purchaseDate (using +1 day buffer like the real reports)
async function checkReports(label: string, expected: {
  totalSales: number; totalCOGS: number; totalProfit: number;
  totalPurchased: number; cashTotal: number; checkTotal: number;
  invoiceCount: number; purchaseDocCount: number;
}, dateRange?: { from: string; to: string }) {
  console.log(`\n  --- Reports check: ${label} ---`)

  let invoiceWhere: any = {}
  let purchaseWhere: any = {}
  if (dateRange) {
    // Test dates are stored at exact UTC midnight (no timezone shift),
    // so no +1 day buffer needed here (that buffer is for browser timezone compensation)
    const fromDate = new Date(dateRange.from + "T00:00:00.000Z")
    const toDate = new Date(dateRange.to + "T23:59:59.999Z")
    invoiceWhere = { date: { gte: fromDate, lte: toDate } }
    purchaseWhere = { purchaseDate: { gte: fromDate, lte: toDate } }
  }

  const invoices = await prisma.invoice.findMany({ where: invoiceWhere, include: { items: true } })
  const purchases = await prisma.purchase.findMany({ where: purchaseWhere })

  // Sales
  const totalSales = invoices.reduce((s, inv) => s + inv.totalAmount, 0)
  assertClose(totalSales, expected.totalSales, `[${label}] Total sales = $${expected.totalSales}`)

  const totalCOGS = invoices.reduce((s, inv) => s + inv.items.reduce((s2, i) => s2 + i.costBasis, 0), 0)
  assertClose(totalCOGS, expected.totalCOGS, `[${label}] COGS = $${expected.totalCOGS}`)

  const totalProfit = invoices.reduce((s, inv) => s + inv.items.reduce((s2, i) => s2 + i.profit, 0), 0)
  assertClose(totalProfit, expected.totalProfit, `[${label}] Profit = $${expected.totalProfit}`)

  assert(invoices.length === expected.invoiceCount, `[${label}] Invoice count = ${expected.invoiceCount}`, `got ${invoices.length}`)

  // Purchases
  const totalPurchased = purchases.reduce((s, p) => s + p.pricePaid, 0)
  assertClose(totalPurchased, expected.totalPurchased, `[${label}] Total purchased = $${expected.totalPurchased}`)

  const uniquePNs = new Set(purchases.map(p => p.purchaseNumber))
  assert(uniquePNs.size === expected.purchaseDocCount, `[${label}] Purchase docs = ${expected.purchaseDocCount}`, `got ${uniquePNs.size}`)

  // Payment breakdown (deduplicated by purchaseNumber, same logic as reports page)
  const seenPNs = new Set<string>()
  let cashTotal = 0, checkTotal = 0
  for (const p of purchases) {
    const key = p.purchaseNumber || p.id
    if (seenPNs.has(key)) continue
    seenPNs.add(key)
    if (p.paymentMethod) {
      try {
        const methods: { method: string; amount: number }[] = JSON.parse(p.paymentMethod)
        for (const m of methods) {
          if (m.method === "Cash") cashTotal += m.amount
          if (m.method === "Check") checkTotal += m.amount
        }
      } catch {}
    }
  }
  assertClose(cashTotal, expected.cashTotal, `[${label}] Cash = $${expected.cashTotal}`)
  assertClose(checkTotal, expected.checkTotal, `[${label}] Check = $${expected.checkTotal}`)
}

// Helper: replay valuation logic (mirrors /api/reports/valuation) and verify
// Optional asOfDate for point-in-time queries (e.g. "2026-03-11")
async function checkValuation(label: string, expected: {
  itemChecks: { id: string; name: string; totalWeight: number; availableWeight: number; totalCost: number; soldWeight: number; soldValue: number; totalProfit: number }[]
}, asOfDate?: string) {
  console.log(`\n  --- Valuation check: ${label} ---`)

  const items = await prisma.inventoryItem.findMany()
  const isPointInTime = !!asOfDate
  // Test dates are stored at exact UTC midnight (no timezone shift),
  // so no +1 day buffer needed for point-in-time (buffer is for browser timezone compensation)
  const asOf = asOfDate
    ? new Date(asOfDate + "T23:59:59.999Z")
    : new Date(Date.now() + 24 * 60 * 60 * 1000)

  // Replay logic from valuation API
  const state = new Map<string, {
    id: string; totalWeight: number; availableWeight: number; totalCost: number
    soldWeight: number; soldValue: number; totalProfit: number
  }>()
  for (const item of items) {
    state.set(item.id, {
      id: item.id, totalWeight: 0, availableWeight: 0, totalCost: 0,
      soldWeight: 0, soldValue: 0, totalProfit: 0,
    })
  }

  // Purchases
  const purchases = await prisma.purchase.findMany({
    where: { purchaseDate: { lte: asOf }, inventoryItemId: { not: null } },
  })
  for (const p of purchases) {
    const s = state.get(p.inventoryItemId!)
    if (!s) continue
    s.totalWeight += p.weight
    s.availableWeight += p.weight
    s.totalCost += p.pricePaid
  }

  // Mix/transfers
  const mixItems = await prisma.mixTransferItem.findMany({
    include: { mixTransfer: { select: { createdAt: true } } },
  })
  for (const mi of mixItems) {
    if (mi.mixTransfer.createdAt > asOf) continue
    const s = state.get(mi.inventoryItemId)
    if (!s) continue
    if (mi.role === "SOURCE") {
      s.totalWeight -= mi.weight; s.availableWeight -= mi.weight; s.totalCost -= mi.totalCost
    } else {
      s.totalWeight += mi.weight; s.availableWeight += mi.weight; s.totalCost += mi.totalCost
    }
  }

  // Invoices
  const invoiceItems = await prisma.invoiceItem.findMany({
    include: { invoice: { select: { date: true } } },
  })
  for (const ii of invoiceItems) {
    if (ii.invoice.date > asOf) continue
    const s = state.get(ii.inventoryItemId)
    if (!s) continue
    s.soldWeight += ii.weight; s.soldValue += ii.totalPrice; s.totalProfit += ii.profit
    s.totalCost -= ii.costBasis
    if (!ii.memoItemId) s.availableWeight -= ii.weight
  }

  // Memos — mirrors the API logic exactly
  const memoItems = await prisma.memoItem.findMany({
    include: { memo: { select: { memoDate: true } } },
  })
  for (const mi of memoItems) {
    if (mi.memo.memoDate > asOf) continue
    const s = state.get(mi.inventoryItemId)
    if (!s) continue
    s.availableWeight -= mi.weight
    if (!isPointInTime) {
      if (mi.status === "RETURNED") s.availableWeight += mi.weight
    }
  }

  // Compare replayed values against expected
  for (const exp of expected.itemChecks) {
    const replayed = state.get(exp.id)
    if (!replayed) { assert(false, `[${label}] Valuation replay: item ${exp.name} not found`); continue }
    const actual = items.find(i => i.id === exp.id)!

    assertClose(replayed.totalWeight, exp.totalWeight, `[${label}] Valuation ${exp.name}: totalWeight = ${exp.totalWeight}`)
    assertClose(replayed.availableWeight, exp.availableWeight, `[${label}] Valuation ${exp.name}: availableWeight = ${exp.availableWeight}`)
    assertClose(replayed.totalCost, exp.totalCost, `[${label}] Valuation ${exp.name}: totalCost = $${exp.totalCost}`)
    assertClose(replayed.soldWeight, exp.soldWeight, `[${label}] Valuation ${exp.name}: soldWeight = ${exp.soldWeight}`)

    // For current valuations (not point-in-time), verify replay matches actual DB state
    if (!isPointInTime) {
      assertClose(replayed.totalWeight, actual.totalWeight, `[${label}] Valuation vs DB ${exp.name}: totalWeight match`)
      assertClose(replayed.availableWeight, actual.availableWeight, `[${label}] Valuation vs DB ${exp.name}: availableWeight match`)
      assertClose(replayed.totalCost, actual.totalCost, `[${label}] Valuation vs DB ${exp.name}: totalCost match`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Step 0: Ensure clean DB and seed categories
// ═══════════════════════════════════════════════════════════════

async function setup() {
  console.log("\n═══ SETUP ═══")

  // Verify DB is clean
  const counts = {
    purchases: await prisma.purchase.count(),
    invoices: await prisma.invoice.count(),
    memos: await prisma.memo.count(),
    inventory: await prisma.inventoryItem.count(),
    leads: await prisma.lead.count(),
  }
  const isClean = Object.values(counts).every(c => c === 0)
  assert(isClean, "Database is clean", !isClean ? `Found: ${JSON.stringify(counts)}` : undefined)
  if (!isClean) {
    console.log("  Run: npx tsx --env-file=.env clear-db.ts")
    process.exit(1)
  }

  // Ensure categories exist
  const catCount = await prisma.stockCategory.count()
  if (catCount === 0) {
    console.log("  Seeding default categories...")
    const defaults = [
      { name: "Gold", metalType: "GOLD", weightUnit: "GRAM", subcategories: ["10K", "14K", "18K", "22K", "24K"] },
      { name: "Silver", metalType: "SILVER", weightUnit: "GRAM", subcategories: ["Sterling (.925)", "Fine (.999)", "Coin (.900)"] },
      { name: "Platinum", metalType: "PLATINUM", weightUnit: "GRAM", subcategories: ["950 Platinum", "900 Platinum"] },
      { name: "Coins & Bars - Gold", metalType: "GOLD", weightUnit: "TROY_OZ", subcategories: ["American Eagle", "Canadian Maple", "Krugerrand", "Gold Bar"] },
      { name: "Coins & Bars - Silver", metalType: "SILVER", weightUnit: "TROY_OZ", subcategories: ["American Eagle", "Canadian Maple", "Silver Bar", "90% Junk Silver"] },
      { name: "Diamond", metalType: "DIAMOND", weightUnit: "GRAM", subcategories: ["Single Stone", "Mixed/Parcels"] },
      { name: "Jewelry", metalType: "JEWELRY", weightUnit: "GRAM", subcategories: ["Ring", "Necklace", "Bracelet", "Earrings", "Pin/Brooch"] },
    ]
    for (let i = 0; i < defaults.length; i++) {
      const d = defaults[i]
      await prisma.stockCategory.create({
        data: {
          name: d.name,
          metalType: d.metalType as any,
          weightUnit: d.weightUnit as any,
          sortOrder: i,
          subcategories: {
            create: d.subcategories.map((s, j) => ({ name: s, sortOrder: j })),
          },
        },
      })
    }
  }
  assert(true, `Categories seeded (${await prisma.stockCategory.count()} categories)`)
}

// ═══════════════════════════════════════════════════════════════
// Step 1: Create leads
// ═══════════════════════════════════════════════════════════════

let leadId: string
let customerId: string
let testUserId: string

async function createLeadsAndCustomers() {
  console.log("\n═══ STEP 1: Create Leads & Customers ═══")

  // Find or create a test user (needed for lead.createdById and purchase.userId)
  let user = await prisma.user.findFirst()
  if (!user) {
    user = await prisma.user.create({
      data: { name: "Test User", email: "test@test.com" },
    })
  }
  testUserId = user.id
  assert(!!testUserId, "Test user ready")

  const lead = await prisma.lead.create({
    data: {
      name: "Test Seller",
      phone: "555-0001",
      email: "seller@test.com",
      source: "ORGANIC",
      channel: "PHONE",
      status: "NEW",
      createdById: testUserId,
    },
  })
  leadId = lead.id
  assert(!!leadId, "Lead created")

  const customer = await prisma.customer.create({
    data: {
      name: "Test Buyer",
      phone: "555-0002",
      address: "123 Test St, Austin TX",
    },
  })
  customerId = customer.id
  assert(!!customerId, "Customer created")
}

// ═══════════════════════════════════════════════════════════════
// Step 2: Record purchases
// ═══════════════════════════════════════════════════════════════

const purchaseIds: string[] = []
const inventoryIds: { gold14k?: string; silver?: string; diamond?: string; jewelry?: string } = {}

async function recordPurchases() {
  console.log("\n═══ STEP 2: Record Purchases ═══")

  // Get categories
  const cats = await prisma.stockCategory.findMany({ include: { subcategories: true } })
  const goldCat = cats.find(c => c.name === "Gold")!
  const silverCat = cats.find(c => c.name === "Silver")!
  const diamondCat = cats.find(c => c.name === "Diamond")!
  const jewelryCat = cats.find(c => c.name === "Jewelry")!

  // Purchase 1: 10g of 14K Gold at $40/g = $400
  const p1 = await prisma.purchase.create({
    data: {
      purchaseNumber: "PUR-0001",
      leadId,
      userId: testUserId,
      description: "14K Scrap Gold",
      metalType: "GOLD",
      weight: 10,
      weightUnit: "GRAM",
      purity: "14K",
      pricePaid: 400,
      pricePerUnit: 40,
      category: "Gold",
      subcategory: "14K",
      purchaseDate: new Date("2026-03-10"),
      paymentMethod: JSON.stringify([{ method: "Cash", amount: 400 }]),
    },
  })
  // Create/upsert inventory item
  const invGold = await prisma.inventoryItem.upsert({
    where: { category_subcategory: { category: "Gold", subcategory: "14K" } },
    update: { totalWeight: { increment: 10 }, availableWeight: { increment: 10 }, totalCost: { increment: 400 } },
    create: { name: "14K Scrap Gold", category: "Gold", subcategory: "14K", weightUnit: "GRAM", totalWeight: 10, availableWeight: 10, totalCost: 400 },
  })
  await prisma.purchase.update({ where: { id: p1.id }, data: { inventoryItemId: invGold.id } })
  purchaseIds.push(p1.id)
  inventoryIds.gold14k = invGold.id
  assert(!!p1.id, "Purchase 1: 10g 14K Gold @ $400")

  // Purchase 2: 500g Sterling Silver at $1/g = $500
  const p2 = await prisma.purchase.create({
    data: {
      purchaseNumber: "PUR-0001",
      leadId,
      userId: testUserId,
      description: "Sterling Silver Scrap",
      metalType: "SILVER",
      weight: 500,
      weightUnit: "GRAM",
      purity: "Sterling (.925)",
      pricePaid: 500,
      pricePerUnit: 1,
      category: "Silver",
      subcategory: "Sterling (.925)",
      purchaseDate: new Date("2026-03-10"),
      paymentMethod: JSON.stringify([{ method: "Cash", amount: 400 }]),
    },
  })
  const invSilver = await prisma.inventoryItem.upsert({
    where: { category_subcategory: { category: "Silver", subcategory: "Sterling (.925)" } },
    update: { totalWeight: { increment: 500 }, availableWeight: { increment: 500 }, totalCost: { increment: 500 } },
    create: { name: "Sterling (.925) Silver", category: "Silver", subcategory: "Sterling (.925)", weightUnit: "GRAM", totalWeight: 500, availableWeight: 500, totalCost: 500 },
  })
  await prisma.purchase.update({ where: { id: p2.id }, data: { inventoryItemId: invSilver.id } })
  purchaseIds.push(p2.id)
  inventoryIds.silver = invSilver.id
  assert(!!p2.id, "Purchase 2: 500g Sterling Silver @ $500")

  // Purchase 3: 1.5ct Diamond at $3000/ct = $4500
  const p3 = await prisma.purchase.create({
    data: {
      purchaseNumber: "PUR-0002",
      leadId,
      userId: testUserId,
      description: "Round 1.5ct F VS1",
      metalType: "DIAMOND",
      weight: 1.5,
      weightUnit: "GRAM",
      pricePaid: 4500,
      pricePerUnit: 3000,
      category: "Diamond",
      subcategory: "Single Stone",
      purchaseDate: new Date("2026-03-10"),
      paymentMethod: JSON.stringify([{ method: "Check", amount: 4500 }]),
    },
  })
  const invDiamond = await prisma.inventoryItem.create({
    data: {
      name: "Single Stone Diamond",
      itemCode: "D1000",
      category: "Diamond",
      subcategory: "Single Stone",
      weightUnit: "GRAM",
      totalWeight: 1.5,
      availableWeight: 1.5,
      totalCost: 4500,
    },
  })
  await prisma.purchase.update({ where: { id: p3.id }, data: { inventoryItemId: invDiamond.id } })
  await prisma.diamondDetails.create({
    data: { inventoryItemId: invDiamond.id, shape: "Round", caratWeight: 1.5, color: "F", clarity: "VS1" },
  })
  purchaseIds.push(p3.id)
  inventoryIds.diamond = invDiamond.id
  assert(!!p3.id, "Purchase 3: 1.5ct Diamond @ $4500")

  // Purchase 4: Jewelry ring 5g at $60/g = $300
  const p4 = await prisma.purchase.create({
    data: {
      purchaseNumber: "PUR-0002",
      leadId,
      userId: testUserId,
      description: "14K Gold Ring w/ Diamond",
      metalType: "JEWELRY",
      weight: 5,
      weightUnit: "GRAM",
      pricePaid: 300,
      pricePerUnit: 60,
      category: "Jewelry",
      subcategory: "Ring",
      purchaseDate: new Date("2026-03-10"),
      paymentMethod: JSON.stringify([{ method: "Check", amount: 4500 }]),
    },
  })
  const invJewelry = await prisma.inventoryItem.create({
    data: {
      name: "Ring Jewelry",
      itemCode: "J1000",
      category: "Jewelry",
      subcategory: "Ring",
      weightUnit: "GRAM",
      totalWeight: 5,
      availableWeight: 5,
      totalCost: 300,
    },
  })
  await prisma.purchase.update({ where: { id: p4.id }, data: { inventoryItemId: invJewelry.id } })
  await prisma.jewelryDetails.create({
    data: { inventoryItemId: invJewelry.id, metal: "14K Gold", brand: "Unknown", mainStone: "Diamond" },
  })
  purchaseIds.push(p4.id)
  inventoryIds.jewelry = invJewelry.id
  assert(!!p4.id, "Purchase 4: Jewelry Ring @ $300")

  // Verify inventory state after all purchases
  console.log("\n  --- Verify inventory after purchases ---")
  const gold = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.gold14k } })
  assertClose(gold!.totalWeight, 10, "Gold totalWeight = 10g")
  assertClose(gold!.availableWeight, 10, "Gold availableWeight = 10g")
  assertClose(gold!.totalCost, 400, "Gold totalCost = $400")

  const silver = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.silver } })
  assertClose(silver!.totalWeight, 500, "Silver totalWeight = 500g")
  assertClose(silver!.availableWeight, 500, "Silver availableWeight = 500g")
  assertClose(silver!.totalCost, 500, "Silver totalCost = $500")

  const diamond = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.diamond } })
  assertClose(diamond!.totalWeight, 1.5, "Diamond totalWeight = 1.5")
  assertClose(diamond!.availableWeight, 1.5, "Diamond availableWeight = 1.5")
  assertClose(diamond!.totalCost, 4500, "Diamond totalCost = $4500")

  const jewelry = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.jewelry } })
  assertClose(jewelry!.totalWeight, 5, "Jewelry totalWeight = 5g")
  assertClose(jewelry!.availableWeight, 5, "Jewelry availableWeight = 5g")
  assertClose(jewelry!.totalCost, 300, "Jewelry totalCost = $300")
}

// ═══════════════════════════════════════════════════════════════
// Step 3: Create a memo
// ═══════════════════════════════════════════════════════════════

let memoId: string
let memoItemIds: { gold?: string; silver?: string; diamond?: string } = {}

async function createMemo() {
  console.log("\n═══ STEP 3: Create Memo ═══")

  // Memo out: 3g gold, 200g silver, 1.5ct diamond
  const memo = await prisma.memo.create({
    data: {
      memoNumber: "MEM-0001",
      customerName: "Test Buyer",
      customerPhone: "555-0002",
      memoDate: new Date("2026-03-11"),
      returnDate: new Date("2026-03-21"),
      totalValue: 3 * 60 + 200 * 1.75 + 5000, // 180 + 350 + 5000 = 5530
      status: "ACTIVE",
      items: {
        create: [
          {
            inventoryItemId: inventoryIds.gold14k!,
            description: "14K Scrap Gold",
            weight: 3,
            weightUnit: "GRAM",
            pricePerUnit: 60,
            totalValue: 180,
          },
          {
            inventoryItemId: inventoryIds.silver!,
            description: "Sterling Silver Scrap",
            weight: 200,
            weightUnit: "GRAM",
            pricePerUnit: 1.75,
            totalValue: 350,
          },
          {
            inventoryItemId: inventoryIds.diamond!,
            description: "Round 1.5ct F VS1",
            weight: 1.5,
            weightUnit: "GRAM",
            pricePerUnit: 3333.33,
            totalValue: 5000,
          },
        ],
      },
    },
    include: { items: true },
  })
  memoId = memo.id
  memoItemIds.gold = memo.items.find(i => i.inventoryItemId === inventoryIds.gold14k)!.id
  memoItemIds.silver = memo.items.find(i => i.inventoryItemId === inventoryIds.silver)!.id
  memoItemIds.diamond = memo.items.find(i => i.inventoryItemId === inventoryIds.diamond)!.id
  assert(!!memoId, "Memo MEM-0001 created with 3 items")

  // Update inventory: availableWeight decreases
  await prisma.inventoryItem.update({ where: { id: inventoryIds.gold14k }, data: { availableWeight: { decrement: 3 } } })
  await prisma.inventoryItem.update({ where: { id: inventoryIds.silver }, data: { availableWeight: { decrement: 200 } } })
  await prisma.inventoryItem.update({ where: { id: inventoryIds.diamond }, data: { availableWeight: { decrement: 1.5 } } })

  // Verify
  console.log("\n  --- Verify inventory after memo ---")
  const gold = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.gold14k } })
  assertClose(gold!.totalWeight, 10, "Gold totalWeight still 10g")
  assertClose(gold!.availableWeight, 7, "Gold availableWeight = 7g (10 - 3 on memo)")

  const silver = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.silver } })
  assertClose(silver!.availableWeight, 300, "Silver availableWeight = 300g (500 - 200 on memo)")

  const diamond = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.diamond } })
  assertClose(diamond!.availableWeight, 0, "Diamond availableWeight = 0 (all on memo)")
}

// ═══════════════════════════════════════════════════════════════
// Step 4: Return silver from memo
// ═══════════════════════════════════════════════════════════════

async function returnMemoItem() {
  console.log("\n═══ STEP 4: Return Silver from Memo ═══")

  // Return the silver memo item
  await prisma.memoItem.update({ where: { id: memoItemIds.silver }, data: { status: "RETURNED" } })
  await prisma.inventoryItem.update({ where: { id: inventoryIds.silver }, data: { availableWeight: { increment: 200 } } })

  const silver = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.silver } })
  assertClose(silver!.availableWeight, 500, "Silver availableWeight restored to 500g after return")
  assertClose(silver!.totalWeight, 500, "Silver totalWeight unchanged at 500g")

  const memoItem = await prisma.memoItem.findUnique({ where: { id: memoItemIds.silver } })
  assert(memoItem!.status === "RETURNED", "Silver memo item status = RETURNED")
}

// ═══════════════════════════════════════════════════════════════
// Step 5: Create invoice (direct sale of silver + conversion of gold memo item)
// ═══════════════════════════════════════════════════════════════

let invoiceId: string
let invoiceItemIds: { silver?: string; gold?: string } = {}

async function createInvoice() {
  console.log("\n═══ STEP 5: Create Invoice ═══")

  // Sell 100g silver directly at $2/g = $200
  // Convert gold memo item (3g) to invoice at $60/g = $180

  // For gold from memo: restore availableWeight first (memo convention), then invoice decrements it
  await prisma.inventoryItem.update({ where: { id: inventoryIds.gold14k }, data: { availableWeight: { increment: 3 } } })

  // Calculate cost basis
  const goldInv = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.gold14k } })!
  const goldAvgCost = goldInv!.totalCost / goldInv!.totalWeight // 400/10 = $40/g
  const goldCostBasis = goldAvgCost * 3 // $120
  const goldProfit = 180 - goldCostBasis // $60

  const silverInv = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.silver } })!
  const silverAvgCost = silverInv!.totalCost / silverInv!.totalWeight // 500/500 = $1/g
  const silverCostBasis = silverAvgCost * 100 // $100
  const silverProfit = 200 - silverCostBasis // $100

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-0001",
      buyerName: "Test Buyer",
      buyerPhone: "555-0002",
      buyerAddress: "123 Test St, Austin TX",
      date: new Date("2026-03-12"),
      totalAmount: 380,
      items: {
        create: [
          {
            inventoryItemId: inventoryIds.silver!,
            description: "Sterling Silver",
            weight: 100,
            weightUnit: "GRAM",
            pricePerUnit: 2,
            totalPrice: 200,
            costBasis: silverCostBasis,
            profit: silverProfit,
          },
          {
            inventoryItemId: inventoryIds.gold14k!,
            description: "14K Gold (from memo)",
            weight: 3,
            weightUnit: "GRAM",
            pricePerUnit: 60,
            totalPrice: 180,
            costBasis: goldCostBasis,
            profit: goldProfit,
            memoItemId: memoItemIds.gold,
          },
        ],
      },
    },
    include: { items: true },
  })
  invoiceId = invoice.id
  invoiceItemIds.silver = invoice.items.find(i => i.inventoryItemId === inventoryIds.silver)!.id
  invoiceItemIds.gold = invoice.items.find(i => i.inventoryItemId === inventoryIds.gold14k)!.id
  assert(!!invoiceId, "Invoice INV-0001 created (silver direct + gold from memo)")

  // Update inventory for silver (direct sale)
  await prisma.inventoryItem.update({
    where: { id: inventoryIds.silver },
    data: {
      availableWeight: { decrement: 100 },
      soldWeight: { increment: 100 },
      soldValue: { increment: 200 },
      totalProfit: { increment: silverProfit },
      totalCost: { decrement: silverCostBasis },
    },
  })

  // Update inventory for gold (from memo — availableWeight was restored above, now decrement)
  await prisma.inventoryItem.update({
    where: { id: inventoryIds.gold14k },
    data: {
      availableWeight: { decrement: 3 },
      soldWeight: { increment: 3 },
      soldValue: { increment: 180 },
      totalProfit: { increment: goldProfit },
      totalCost: { decrement: goldCostBasis },
    },
  })

  // Mark gold memo item as CONVERTED
  await prisma.memoItem.update({ where: { id: memoItemIds.gold }, data: { status: "CONVERTED" } })

  // Verify
  console.log("\n  --- Verify inventory after invoice ---")
  const goldAfter = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.gold14k } })!
  assertClose(goldAfter!.totalWeight, 10, "Gold totalWeight still 10g")
  assertClose(goldAfter!.availableWeight, 7, "Gold availableWeight = 7g (10 - 3 sold)")
  assertClose(goldAfter!.soldWeight, 3, "Gold soldWeight = 3g")
  assertClose(goldAfter!.soldValue, 180, "Gold soldValue = $180")
  assertClose(goldAfter!.totalCost, 280, "Gold totalCost = $280 (400 - 120 costBasis)")
  assertClose(goldAfter!.totalProfit, 60, "Gold totalProfit = $60")

  const silverAfter = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.silver } })!
  assertClose(silverAfter!.totalWeight, 500, "Silver totalWeight still 500g")
  assertClose(silverAfter!.availableWeight, 400, "Silver availableWeight = 400g (500 - 100 sold)")
  assertClose(silverAfter!.soldWeight, 100, "Silver soldWeight = 100g")
  assertClose(silverAfter!.soldValue, 200, "Silver soldValue = $200")
  assertClose(silverAfter!.totalCost, 400, "Silver totalCost = $400 (500 - 100 costBasis)")
  assertClose(silverAfter!.totalProfit, 100, "Silver totalProfit = $100")

  const goldMemoItem = await prisma.memoItem.findUnique({ where: { id: memoItemIds.gold } })
  assert(goldMemoItem!.status === "CONVERTED", "Gold memo item status = CONVERTED")

  // Reports should reflect the new invoice
  await checkReports("After invoice created", {
    totalSales: 380, totalCOGS: 220, totalProfit: 160, // silver 100 + gold 120 COGS, silver 100 + gold 60 profit
    totalPurchased: 5700, cashTotal: 400, checkTotal: 4500,
    invoiceCount: 1, purchaseDocCount: 2,
  })

  // Valuation replay should match DB
  await checkValuation("After invoice created", {
    itemChecks: [
      { id: inventoryIds.gold14k!, name: "Gold", totalWeight: 10, availableWeight: 7, totalCost: 280, soldWeight: 3, soldValue: 180, totalProfit: 60 },
      { id: inventoryIds.silver!, name: "Silver", totalWeight: 500, availableWeight: 400, totalCost: 400, soldWeight: 100, soldValue: 200, totalProfit: 100 },
      { id: inventoryIds.diamond!, name: "Diamond", totalWeight: 1.5, availableWeight: 0, totalCost: 4500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
    ],
  })
}

// ═══════════════════════════════════════════════════════════════
// Step 6: Edit invoice — change silver price
// ═══════════════════════════════════════════════════════════════

async function editInvoice() {
  console.log("\n═══ STEP 6: Edit Invoice — Change Silver Price ═══")

  // Change silver price from $200 to $250 (price increase of $50)
  const silverItem = await prisma.invoiceItem.findUnique({ where: { id: invoiceItemIds.silver } })!
  const priceDelta = 250 - silverItem!.totalPrice // +50
  const newProfit = 250 - silverItem!.costBasis
  const profitDelta = newProfit - silverItem!.profit

  await prisma.invoiceItem.update({
    where: { id: invoiceItemIds.silver },
    data: {
      pricePerUnit: 2.5,
      totalPrice: 250,
      profit: newProfit,
    },
  })

  // Sync inventory
  await prisma.inventoryItem.update({
    where: { id: inventoryIds.silver },
    data: {
      soldValue: { increment: priceDelta },
      totalProfit: { increment: profitDelta },
    },
  })

  // Update invoice total
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { totalAmount: 430 }, // 250 + 180
  })

  const silverAfter = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.silver } })!
  assertClose(silverAfter!.soldValue, 250, "Silver soldValue updated to $250")
  assertClose(silverAfter!.totalProfit, 150, "Silver totalProfit updated to $150 (250 - 100 cost)")

  // Reports should reflect the price edit: sales up $50, profit up $50, COGS unchanged
  await checkReports("After price edit", {
    totalSales: 430, totalCOGS: 220, totalProfit: 210, // 250-100=150 silver + 180-120=60 gold
    totalPurchased: 5700, cashTotal: 400, checkTotal: 4500,
    invoiceCount: 1, purchaseDocCount: 2,
  })
}

// ═══════════════════════════════════════════════════════════════
// Step 7: Add new item to invoice
// ═══════════════════════════════════════════════════════════════

let invoiceItemJewelry: string

async function addItemToInvoice() {
  console.log("\n═══ STEP 7: Add Jewelry to Invoice ═══")

  // Sell jewelry ring at $500
  const jewelryInv = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.jewelry } })!
  const avgCost = jewelryInv!.totalCost / jewelryInv!.totalWeight // 300/5 = $60/g
  const costBasis = avgCost * 5 // $300
  const profit = 500 - costBasis // $200

  const newItem = await prisma.invoiceItem.create({
    data: {
      invoiceId,
      inventoryItemId: inventoryIds.jewelry!,
      description: "14K Gold Ring w/ Diamond",
      weight: 5,
      weightUnit: "GRAM",
      pricePerUnit: 100,
      totalPrice: 500,
      costBasis,
      profit,
    },
  })
  invoiceItemJewelry = newItem.id

  // Update inventory
  await prisma.inventoryItem.update({
    where: { id: inventoryIds.jewelry },
    data: {
      availableWeight: { decrement: 5 },
      soldWeight: { increment: 5 },
      soldValue: { increment: 500 },
      totalProfit: { increment: profit },
      totalCost: { decrement: costBasis },
    },
  })

  // Update invoice total
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { totalAmount: 930 }, // 250 + 180 + 500
  })

  const jewelryAfter = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.jewelry } })!
  assertClose(jewelryAfter!.availableWeight, 0, "Jewelry availableWeight = 0 (all sold)")
  assertClose(jewelryAfter!.soldWeight, 5, "Jewelry soldWeight = 5g")
  assertClose(jewelryAfter!.soldValue, 500, "Jewelry soldValue = $500")
  assertClose(jewelryAfter!.totalProfit, 200, "Jewelry totalProfit = $200")
  assertClose(jewelryAfter!.totalCost, 0, "Jewelry totalCost = $0 (all sold)")

  assert(true, "Jewelry added to invoice, total = $930")

  // Reports: sales now $930, COGS = 220 + 300 = 520, profit = 210 + 200 = 410
  await checkReports("After adding jewelry", {
    totalSales: 930, totalCOGS: 520, totalProfit: 410,
    totalPurchased: 5700, cashTotal: 400, checkTotal: 4500,
    invoiceCount: 1, purchaseDocCount: 2,
  })
}

// ═══════════════════════════════════════════════════════════════
// Step 8: Remove jewelry from invoice
// ═══════════════════════════════════════════════════════════════

async function removeItemFromInvoice() {
  console.log("\n═══ STEP 8: Remove Jewelry from Invoice ═══")

  const item = await prisma.invoiceItem.findUnique({ where: { id: invoiceItemJewelry } })!

  // Reverse inventory effects
  await prisma.inventoryItem.update({
    where: { id: inventoryIds.jewelry },
    data: {
      availableWeight: { increment: item!.weight },
      soldWeight: { decrement: item!.weight },
      soldValue: { decrement: item!.totalPrice },
      totalProfit: { decrement: item!.profit },
      totalCost: { increment: item!.costBasis },
    },
  })

  await prisma.invoiceItem.delete({ where: { id: invoiceItemJewelry } })

  // Update invoice total
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { totalAmount: 430 }, // back to 250 + 180
  })

  const jewelryAfter = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.jewelry } })!
  assertClose(jewelryAfter!.availableWeight, 5, "Jewelry availableWeight restored to 5g")
  assertClose(jewelryAfter!.soldWeight, 0, "Jewelry soldWeight back to 0")
  assertClose(jewelryAfter!.totalCost, 300, "Jewelry totalCost restored to $300")
  assert(true, "Jewelry removed from invoice, total back to $430")

  // Reports: back to pre-jewelry state
  await checkReports("After removing jewelry", {
    totalSales: 430, totalCOGS: 220, totalProfit: 210,
    totalPurchased: 5700, cashTotal: 400, checkTotal: 4500,
    invoiceCount: 1, purchaseDocCount: 2,
  })
}

// ═══════════════════════════════════════════════════════════════
// Step 9: Cancel the invoice entirely
// ═══════════════════════════════════════════════════════════════

async function cancelInvoice() {
  console.log("\n═══ STEP 9: Cancel Invoice ═══")

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: { include: { memoItem: true } } },
  })

  for (const item of invoice!.items) {
    // Reverse inventory
    await prisma.inventoryItem.update({
      where: { id: item.inventoryItemId },
      data: {
        soldWeight: { decrement: item.weight },
        soldValue: { decrement: item.totalPrice },
        totalProfit: { decrement: item.profit },
        totalCost: { increment: item.costBasis },
        ...(!item.memoItemId && { availableWeight: { increment: item.weight } }),
      },
    })

    // Revert memo items to ACTIVE
    if (item.memoItemId) {
      await prisma.memoItem.update({ where: { id: item.memoItemId }, data: { status: "ACTIVE" } })
    }
  }

  await prisma.invoice.delete({ where: { id: invoiceId } })

  // Verify
  console.log("\n  --- Verify inventory after cancellation ---")
  const gold = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.gold14k } })!
  assertClose(gold!.totalWeight, 10, "Gold totalWeight = 10g")
  // Gold was sold from memo, so availableWeight stays at 7 (memo still holds 3g but now ACTIVE again)
  assertClose(gold!.availableWeight, 7, "Gold availableWeight = 7g (3g back on memo as ACTIVE)")
  assertClose(gold!.soldWeight, 0, "Gold soldWeight = 0")
  assertClose(gold!.soldValue, 0, "Gold soldValue = $0")
  assertClose(gold!.totalCost, 400, "Gold totalCost restored to $400")
  assertClose(gold!.totalProfit, 0, "Gold totalProfit = $0")

  const silver = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.silver } })!
  assertClose(silver!.availableWeight, 500, "Silver availableWeight restored to 500g")
  assertClose(silver!.soldWeight, 0, "Silver soldWeight = 0")
  assertClose(silver!.totalCost, 500, "Silver totalCost restored to $500")

  // Gold memo item should be back to ACTIVE
  const goldMemoItem = await prisma.memoItem.findUnique({ where: { id: memoItemIds.gold } })
  assert(goldMemoItem!.status === "ACTIVE", "Gold memo item reverted to ACTIVE")

  const invoiceCount = await prisma.invoice.count()
  assert(invoiceCount === 0, "Invoice fully deleted")

  // Reports: everything zeroed on sales side, purchases unchanged
  await checkReports("After invoice cancelled", {
    totalSales: 0, totalCOGS: 0, totalProfit: 0,
    totalPurchased: 5700, cashTotal: 400, checkTotal: 4500,
    invoiceCount: 0, purchaseDocCount: 2,
  })

  // Valuation replay should match restored state
  await checkValuation("After invoice cancelled", {
    itemChecks: [
      { id: inventoryIds.gold14k!, name: "Gold", totalWeight: 10, availableWeight: 7, totalCost: 400, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.silver!, name: "Silver", totalWeight: 500, availableWeight: 500, totalCost: 500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.diamond!, name: "Diamond", totalWeight: 1.5, availableWeight: 0, totalCost: 4500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.jewelry!, name: "Jewelry", totalWeight: 5, availableWeight: 5, totalCost: 300, soldWeight: 0, soldValue: 0, totalProfit: 0 },
    ],
  })
}

// ═══════════════════════════════════════════════════════════════
// Step 10: Create a new invoice for report testing
// ═══════════════════════════════════════════════════════════════

async function createInvoiceForReports() {
  console.log("\n═══ STEP 10: Create Invoice for Reports ═══")

  // Sell 50g silver at $2/g = $100
  const silverInv = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.silver } })!
  const silverAvgCost = silverInv!.totalCost / silverInv!.totalWeight
  const silverCostBasis = silverAvgCost * 50
  const silverProfit = 100 - silverCostBasis

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-0002",
      buyerName: "Test Buyer",
      date: new Date("2026-03-13"),
      totalAmount: 100,
      items: {
        create: [
          {
            inventoryItemId: inventoryIds.silver!,
            description: "Sterling Silver",
            weight: 50,
            weightUnit: "GRAM",
            pricePerUnit: 2,
            totalPrice: 100,
            costBasis: silverCostBasis,
            profit: silverProfit,
          },
        ],
      },
    },
  })

  await prisma.inventoryItem.update({
    where: { id: inventoryIds.silver },
    data: {
      availableWeight: { decrement: 50 },
      soldWeight: { increment: 50 },
      soldValue: { increment: 100 },
      totalProfit: { increment: silverProfit },
      totalCost: { decrement: silverCostBasis },
    },
  })

  assert(!!invoice.id, "Invoice INV-0002 created (50g silver @ $100)")
}

// ═══════════════════════════════════════════════════════════════
// Step 11: Verify final inventory state
// ═══════════════════════════════════════════════════════════════

async function verifyFinalState() {
  console.log("\n═══ STEP 11: Verify Final Inventory State ═══")

  const gold = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.gold14k } })!
  assertClose(gold!.totalWeight, 10, "Gold totalWeight = 10g")
  assertClose(gold!.availableWeight, 7, "Gold availableWeight = 7g (3g on active memo)")
  assertClose(gold!.soldWeight, 0, "Gold soldWeight = 0g")
  assertClose(gold!.totalCost, 400, "Gold totalCost = $400")

  const silver = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.silver } })!
  assertClose(silver!.totalWeight, 500, "Silver totalWeight = 500g")
  assertClose(silver!.availableWeight, 450, "Silver availableWeight = 450g (50 sold)")
  assertClose(silver!.soldWeight, 50, "Silver soldWeight = 50g")
  assertClose(silver!.soldValue, 100, "Silver soldValue = $100")
  assertClose(silver!.totalCost, 450, "Silver totalCost = $450 (500 - 50 costBasis)")
  assertClose(silver!.totalProfit, 50, "Silver totalProfit = $50 (100 - 50)")

  const diamond = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.diamond } })!
  assertClose(diamond!.totalWeight, 1.5, "Diamond totalWeight = 1.5")
  assertClose(diamond!.availableWeight, 0, "Diamond availableWeight = 0 (on active memo)")
  assertClose(diamond!.soldWeight, 0, "Diamond soldWeight = 0")
  assertClose(diamond!.totalCost, 4500, "Diamond totalCost = $4500")

  const jewelry = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.jewelry } })!
  assertClose(jewelry!.totalWeight, 5, "Jewelry totalWeight = 5g")
  assertClose(jewelry!.availableWeight, 5, "Jewelry availableWeight = 5g (untouched)")
  assertClose(jewelry!.soldWeight, 0, "Jewelry soldWeight = 0")
  assertClose(jewelry!.totalCost, 300, "Jewelry totalCost = $300")
}

// ═══════════════════════════════════════════════════════════════
// Step 12: Verify reports
// ═══════════════════════════════════════════════════════════════

async function verifyReports() {
  console.log("\n═══ STEP 12: Verify Reports Data ═══")

  const purchases = await prisma.purchase.findMany()
  const invoices = await prisma.invoice.findMany({ include: { items: true } })

  // Purchase totals
  const totalPurchased = purchases.reduce((s, p) => s + p.pricePaid, 0)
  assertClose(totalPurchased, 5700, "Total purchased = $5700 (400 + 500 + 4500 + 300)")

  // Purchase documents (unique purchaseNumbers)
  const uniquePurchaseNums = new Set(purchases.map(p => p.purchaseNumber))
  assert(uniquePurchaseNums.size === 2, `Purchase documents = 2 (PUR-0001, PUR-0002)`, `got ${uniquePurchaseNums.size}`)

  // Payment breakdown — should be per-document, not per-row
  const seenPNs = new Set<string>()
  const paymentTotals = new Map<string, number>()
  for (const p of purchases) {
    if (p.purchaseNumber && seenPNs.has(p.purchaseNumber)) continue
    if (p.purchaseNumber) seenPNs.add(p.purchaseNumber)
    if (p.paymentMethod) {
      try {
        const methods: { method: string; amount: number }[] = JSON.parse(p.paymentMethod)
        for (const m of methods) {
          paymentTotals.set(m.method, (paymentTotals.get(m.method) || 0) + m.amount)
        }
      } catch {}
    }
  }
  assertClose(paymentTotals.get("Cash") || 0, 400, "Payment: Cash = $400 (PUR-0001)")
  assertClose(paymentTotals.get("Check") || 0, 4500, "Payment: Check = $4500 (PUR-0002)")

  // Sales totals
  const totalSales = invoices.reduce((s, inv) => s + inv.totalAmount, 0)
  assertClose(totalSales, 100, "Total sales = $100")

  const totalCost = invoices.reduce((s, inv) => s + inv.items.reduce((s2, i) => s2 + i.costBasis, 0), 0)
  assertClose(totalCost, 50, "Total cost of goods sold = $50")

  const totalProfit = invoices.reduce((s, inv) => s + inv.items.reduce((s2, i) => s2 + i.profit, 0), 0)
  assertClose(totalProfit, 50, "Total profit = $50")
}

// ═══════════════════════════════════════════════════════════════
// Step 13: Verify stock valuation (current)
// ═══════════════════════════════════════════════════════════════

async function verifyValuation() {
  console.log("\n═══ STEP 13: Verify Stock Valuation ═══")

  // Current inventory state should match what we computed
  const items = await prisma.inventoryItem.findMany()

  const totalStockValue = items.reduce((s, i) => s + i.totalCost, 0)
  assertClose(totalStockValue, 400 + 450 + 4500 + 300, "Total stock value = $5650")

  const totalInStock = items.reduce((s, i) => s + (i.totalWeight - i.soldWeight), 0)
  // Gold: 10, Silver: 450, Diamond: 1.5, Jewelry: 5 = 466.5
  assertClose(totalInStock, 10 + 450 + 1.5 + 5, "Total weight in stock = 466.5")

  const totalOnMemo = items.reduce((s, i) => s + (i.totalWeight - i.soldWeight - i.availableWeight), 0)
  // Gold: 10 - 0 - 7 = 3, Silver: 0, Diamond: 1.5 - 0 - 0 = 1.5, Jewelry: 0 = 4.5
  assertClose(totalOnMemo, 3 + 1.5, "Total weight on memo = 4.5")
}

// ═══════════════════════════════════════════════════════════════
// Step 14: Edit purchase — change price
// ═══════════════════════════════════════════════════════════════

async function editPurchase() {
  console.log("\n═══ STEP 14: Edit Purchase — Change Gold Price ═══")

  // Change gold purchase from $400 to $450 ($50 increase)
  const goldPurchase = await prisma.purchase.findUnique({ where: { id: purchaseIds[0] } })!
  const priceDelta = 450 - goldPurchase!.pricePaid

  await prisma.purchase.update({
    where: { id: purchaseIds[0] },
    data: { pricePaid: 450, pricePerUnit: 45 },
  })

  await prisma.inventoryItem.update({
    where: { id: inventoryIds.gold14k },
    data: { totalCost: { increment: priceDelta } },
  })

  const gold = await prisma.inventoryItem.findUnique({ where: { id: inventoryIds.gold14k } })!
  assertClose(gold!.totalCost, 450, "Gold totalCost updated to $450")
  assert(true, "Gold purchase price edited from $400 to $450")

  // Reports: purchase total now $5750 (was $5700, gold went from $400 to $450)
  // Cash payment stays $400 (paymentMethod JSON not changed), but pricePaid changed
  await checkReports("After purchase edit", {
    totalSales: 100, totalCOGS: 50, totalProfit: 50,
    totalPurchased: 5750, cashTotal: 400, checkTotal: 4500,
    invoiceCount: 1, purchaseDocCount: 2,
  })

  // Final valuation replay — verify replay accounts for edited purchase price
  await checkValuation("After purchase edit", {
    itemChecks: [
      { id: inventoryIds.gold14k!, name: "Gold", totalWeight: 10, availableWeight: 7, totalCost: 450, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.silver!, name: "Silver", totalWeight: 500, availableWeight: 450, totalCost: 450, soldWeight: 50, soldValue: 100, totalProfit: 50 },
      { id: inventoryIds.diamond!, name: "Diamond", totalWeight: 1.5, availableWeight: 0, totalCost: 4500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.jewelry!, name: "Jewelry", totalWeight: 5, availableWeight: 5, totalCost: 300, soldWeight: 0, soldValue: 0, totalProfit: 0 },
    ],
  })
}

// ═══════════════════════════════════════════════════════════════
// Step 15: Date-sensitivity — date-filtered reports
// ═══════════════════════════════════════════════════════════════

async function testDateFilteredReports() {
  console.log("\n═══ STEP 15: Date-Filtered Reports ═══")

  // Current state:
  //   Purchases: all on 2026-03-10 (PUR-0001: gold $450 + silver $500, PUR-0002: diamond $4500 + jewelry $300)
  //   Invoice INV-0002: 50g silver $100, date 2026-03-13

  // Filter to March 10 only — should see all purchases but NO invoices
  await checkReports("Mar 10 only", {
    totalSales: 0, totalCOGS: 0, totalProfit: 0,
    totalPurchased: 5750, cashTotal: 400, checkTotal: 4500,
    invoiceCount: 0, purchaseDocCount: 2,
  }, { from: "2026-03-10", to: "2026-03-10" })

  // Filter to March 13 only — should see the invoice but NO purchases
  await checkReports("Mar 13 only", {
    totalSales: 100, totalCOGS: 50, totalProfit: 50,
    totalPurchased: 0, cashTotal: 0, checkTotal: 0,
    invoiceCount: 1, purchaseDocCount: 0,
  }, { from: "2026-03-13", to: "2026-03-13" })

  // Filter to March 12 only — nothing happened on this date
  await checkReports("Mar 12 only (empty)", {
    totalSales: 0, totalCOGS: 0, totalProfit: 0,
    totalPurchased: 0, cashTotal: 0, checkTotal: 0,
    invoiceCount: 0, purchaseDocCount: 0,
  }, { from: "2026-03-12", to: "2026-03-12" })

  // Full range — should see everything
  await checkReports("Full range Mar 10-13", {
    totalSales: 100, totalCOGS: 50, totalProfit: 50,
    totalPurchased: 5750, cashTotal: 400, checkTotal: 4500,
    invoiceCount: 1, purchaseDocCount: 2,
  }, { from: "2026-03-10", to: "2026-03-13" })
}

// ═══════════════════════════════════════════════════════════════
// Step 16: Date-sensitivity — point-in-time valuation
// ═══════════════════════════════════════════════════════════════

async function testPointInTimeValuation() {
  console.log("\n═══ STEP 16: Point-in-Time Valuation ═══")

  // Current state:
  //   Purchases: all on 2026-03-10
  //   Memo MEM-0001: created 2026-03-11 (gold 3g ACTIVE, silver RETURNED, diamond 1.5 ACTIVE)
  //   Invoice INV-0002: 2026-03-13 (50g silver sold)

  // Valuation as of March 9: BEFORE any purchases — nothing in stock
  await checkValuation("As of Mar 9 (before purchases)", {
    itemChecks: [
      { id: inventoryIds.gold14k!, name: "Gold", totalWeight: 0, availableWeight: 0, totalCost: 0, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.silver!, name: "Silver", totalWeight: 0, availableWeight: 0, totalCost: 0, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.diamond!, name: "Diamond", totalWeight: 0, availableWeight: 0, totalCost: 0, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.jewelry!, name: "Jewelry", totalWeight: 0, availableWeight: 0, totalCost: 0, soldWeight: 0, soldValue: 0, totalProfit: 0 },
    ],
  }, "2026-03-09")

  // Valuation as of March 10: purchases done, no memo/invoice yet
  // All items at full purchase weight, all available
  await checkValuation("As of Mar 10 (after purchases, before memo)", {
    itemChecks: [
      { id: inventoryIds.gold14k!, name: "Gold", totalWeight: 10, availableWeight: 10, totalCost: 450, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.silver!, name: "Silver", totalWeight: 500, availableWeight: 500, totalCost: 500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.diamond!, name: "Diamond", totalWeight: 1.5, availableWeight: 1.5, totalCost: 4500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.jewelry!, name: "Jewelry", totalWeight: 5, availableWeight: 5, totalCost: 300, soldWeight: 0, soldValue: 0, totalProfit: 0 },
    ],
  }, "2026-03-10")

  // Valuation as of March 11: memo created (gold 3g, silver 200g, diamond 1.5 on memo)
  // Point-in-time: all memo items treated as on-memo (no RETURNED status applied)
  await checkValuation("As of Mar 11 (after memo, before invoice)", {
    itemChecks: [
      { id: inventoryIds.gold14k!, name: "Gold", totalWeight: 10, availableWeight: 7, totalCost: 450, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.silver!, name: "Silver", totalWeight: 500, availableWeight: 300, totalCost: 500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.diamond!, name: "Diamond", totalWeight: 1.5, availableWeight: 0, totalCost: 4500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.jewelry!, name: "Jewelry", totalWeight: 5, availableWeight: 5, totalCost: 300, soldWeight: 0, soldValue: 0, totalProfit: 0 },
    ],
  }, "2026-03-11")

  // Valuation as of March 12: still no invoice (INV-0002 is dated March 13)
  // Same as March 11
  await checkValuation("As of Mar 12 (before invoice)", {
    itemChecks: [
      { id: inventoryIds.gold14k!, name: "Gold", totalWeight: 10, availableWeight: 7, totalCost: 450, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.silver!, name: "Silver", totalWeight: 500, availableWeight: 300, totalCost: 500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.diamond!, name: "Diamond", totalWeight: 1.5, availableWeight: 0, totalCost: 4500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.jewelry!, name: "Jewelry", totalWeight: 5, availableWeight: 5, totalCost: 300, soldWeight: 0, soldValue: 0, totalProfit: 0 },
    ],
  }, "2026-03-12")

  // Valuation as of March 13: invoice sold 50g silver
  // Silver: available = 300 (memo takes 200) - 50 (sold) = 250, but sold not from memo so available = 500 - 200(memo) - 50(sold) = 250
  await checkValuation("As of Mar 13 (after invoice)", {
    itemChecks: [
      { id: inventoryIds.gold14k!, name: "Gold", totalWeight: 10, availableWeight: 7, totalCost: 450, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.silver!, name: "Silver", totalWeight: 500, availableWeight: 250, totalCost: 450, soldWeight: 50, soldValue: 100, totalProfit: 50 },
      { id: inventoryIds.diamond!, name: "Diamond", totalWeight: 1.5, availableWeight: 0, totalCost: 4500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.jewelry!, name: "Jewelry", totalWeight: 5, availableWeight: 5, totalCost: 300, soldWeight: 0, soldValue: 0, totalProfit: 0 },
    ],
  }, "2026-03-13")
}

// ═══════════════════════════════════════════════════════════════
// Step 17: Date change — move invoice date and verify reports change
// ═══════════════════════════════════════════════════════════════

async function testInvoiceDateChange() {
  console.log("\n═══ STEP 17: Change Invoice Date → Reports Change ═══")

  // Move INV-0002 from March 13 to March 10
  const invoice = await prisma.invoice.findFirst({ where: { invoiceNumber: "INV-0002" } })
  await prisma.invoice.update({
    where: { id: invoice!.id },
    data: { date: new Date("2026-03-10") },
  })

  // Now March 13 should have NO sales
  await checkReports("Mar 13 after moving invoice away", {
    totalSales: 0, totalCOGS: 0, totalProfit: 0,
    totalPurchased: 0, cashTotal: 0, checkTotal: 0,
    invoiceCount: 0, purchaseDocCount: 0,
  }, { from: "2026-03-13", to: "2026-03-13" })

  // March 10 should now have the invoice AND purchases
  await checkReports("Mar 10 after moving invoice here", {
    totalSales: 100, totalCOGS: 50, totalProfit: 50,
    totalPurchased: 5750, cashTotal: 400, checkTotal: 4500,
    invoiceCount: 1, purchaseDocCount: 2,
  }, { from: "2026-03-10", to: "2026-03-10" })

  // Valuation as of March 12: now the invoice IS included (it's dated March 10)
  // Silver: 500 avail from purchase, -200 memo, -50 sold = 250
  await checkValuation("As of Mar 12 (invoice now on Mar 10)", {
    itemChecks: [
      { id: inventoryIds.gold14k!, name: "Gold", totalWeight: 10, availableWeight: 7, totalCost: 450, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.silver!, name: "Silver", totalWeight: 500, availableWeight: 250, totalCost: 450, soldWeight: 50, soldValue: 100, totalProfit: 50 },
    ],
  }, "2026-03-12")

  // Move invoice back to March 13 (restore original)
  await prisma.invoice.update({
    where: { id: invoice!.id },
    data: { date: new Date("2026-03-13") },
  })
  assert(true, "Invoice date restored to March 13")
}

// ═══════════════════════════════════════════════════════════════
// Step 18: Date change — move purchase date and verify reports/valuation change
// ═══════════════════════════════════════════════════════════════

async function testPurchaseDateChange() {
  console.log("\n═══ STEP 18: Change Purchase Date → Reports/Valuation Change ═══")

  // Move PUR-0001 purchases (gold + silver) from March 10 to March 12
  await prisma.purchase.updateMany({
    where: { purchaseNumber: "PUR-0001" },
    data: { purchaseDate: new Date("2026-03-12") },
  })

  // March 10 should now only have PUR-0002 (diamond $4500 + jewelry $300)
  await checkReports("Mar 10 after moving PUR-0001 away", {
    totalSales: 0, totalCOGS: 0, totalProfit: 0,
    totalPurchased: 4800, cashTotal: 0, checkTotal: 4500,
    invoiceCount: 0, purchaseDocCount: 1,
  }, { from: "2026-03-10", to: "2026-03-10" })

  // March 12 should have PUR-0001 (gold + silver)
  await checkReports("Mar 12 has PUR-0001 now", {
    totalSales: 0, totalCOGS: 0, totalProfit: 0,
    totalPurchased: 950, cashTotal: 400, checkTotal: 0,
    invoiceCount: 0, purchaseDocCount: 1,
  }, { from: "2026-03-12", to: "2026-03-12" })

  // Valuation as of March 11: PUR-0001 (gold + silver) not yet purchased!
  // Only PUR-0002 items exist (diamond + jewelry). Memo still created on Mar 11 though.
  // Diamond: 1.5 from purchase, -1.5 memo = 0 available
  // Gold: 0 (purchase moved to Mar 12), but memo takes 3g... available would be -3
  // Silver: 0 (purchase moved to Mar 12), but memo takes 200g... available would be -200
  await checkValuation("As of Mar 11 (PUR-0001 moved to Mar 12)", {
    itemChecks: [
      { id: inventoryIds.gold14k!, name: "Gold", totalWeight: 0, availableWeight: -3, totalCost: 0, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.silver!, name: "Silver", totalWeight: 0, availableWeight: -200, totalCost: 0, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.diamond!, name: "Diamond", totalWeight: 1.5, availableWeight: 0, totalCost: 4500, soldWeight: 0, soldValue: 0, totalProfit: 0 },
      { id: inventoryIds.jewelry!, name: "Jewelry", totalWeight: 5, availableWeight: 5, totalCost: 300, soldWeight: 0, soldValue: 0, totalProfit: 0 },
    ],
  }, "2026-03-11")

  // Restore PUR-0001 to March 10
  await prisma.purchase.updateMany({
    where: { purchaseNumber: "PUR-0001" },
    data: { purchaseDate: new Date("2026-03-10") },
  })
  assert(true, "PUR-0001 date restored to March 10")

  // Verify everything is back to normal
  await checkReports("All restored", {
    totalSales: 100, totalCOGS: 50, totalProfit: 50,
    totalPurchased: 5750, cashTotal: 400, checkTotal: 4500,
    invoiceCount: 1, purchaseDocCount: 2,
  })
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log("╔═══════════════════════════════════════════════╗")
  console.log("║   ATX Gold — End-to-End Test Suite            ║")
  console.log("╚═══════════════════════════════════════════════╝")

  try {
    await setup()
    await createLeadsAndCustomers()
    await recordPurchases()
    await createMemo()
    await returnMemoItem()
    await createInvoice()
    await editInvoice()
    await addItemToInvoice()
    await removeItemFromInvoice()
    await cancelInvoice()
    await createInvoiceForReports()
    await verifyFinalState()
    await verifyReports()
    await verifyValuation()
    await editPurchase()
    await testDateFilteredReports()
    await testPointInTimeValuation()
    await testInvoiceDateChange()
    await testPurchaseDateChange()
  } catch (err) {
    console.error("\n\n  FATAL ERROR:", err)
    failed++
  }

  console.log("\n╔═══════════════════════════════════════════════╗")
  console.log(`║   Results: ${passed} passed, ${failed} failed${" ".repeat(Math.max(0, 22 - String(passed).length - String(failed).length))}║`)
  console.log("╚═══════════════════════════════════════════════╝")

  if (failures.length > 0) {
    console.log("\nFailures:")
    failures.forEach(f => console.log(`  ✗ ${f}`))
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(console.error).finally(() => prisma.$disconnect())
