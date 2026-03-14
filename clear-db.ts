import { prisma } from './src/lib/prisma'

async function main() {
  await prisma.invoiceItem.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.memoItem.deleteMany()
  await prisma.memo.deleteMany()
  await prisma.mixTransferItem.deleteMany()
  await prisma.mixTransfer.deleteMany()
  await prisma.diamondDetails.deleteMany()
  await prisma.jewelryDetails.deleteMany()
  await prisma.purchase.deleteMany()
  await prisma.inventoryItem.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.lead.deleteMany()

  const counts = {
    inventoryItems: await prisma.inventoryItem.count(),
    invoices: await prisma.invoice.count(),
    memos: await prisma.memo.count(),
    purchases: await prisma.purchase.count(),
    leads: await prisma.lead.count(),
    customers: await prisma.customer.count(),
  }
  console.log('Done. Remaining:', JSON.stringify(counts))
}

main().catch(console.error).finally(() => prisma.$disconnect())
