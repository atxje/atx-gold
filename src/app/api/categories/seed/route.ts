import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const defaults = [
  { name: "Scrap Gold", metalType: "GOLD" as const, weightUnit: "GRAM" as const, subcategories: ["10K", "14K", "18K", "21K+", "24K"] },
  { name: "Scrap Silver", metalType: "SILVER" as const, weightUnit: "GRAM" as const, subcategories: ["Sterling Jewelry", "Silverware"] },
  { name: "Coins/Bars - Gold", metalType: "GOLD" as const, weightUnit: "TROY_OZ" as const, subcategories: ["Gold American Eagle", "Gold Maple", "Krugerrand", "PAMP Bar", "VALCAMBI Bar", "Credit Suisse Bar", "Centenario"] },
  { name: "Coins/Bars - Silver", metalType: "SILVER" as const, weightUnit: "TROY_OZ" as const, subcategories: ["Silver Eagle", "Silver Buffalo", "Silver Generics"] },
  { name: "Coins/Bars - Platinum", metalType: "PLATINUM" as const, weightUnit: "TROY_OZ" as const, subcategories: ["Platinum Eagle", "Platinum Maple", "Platinum Bar"] },
  { name: "Single Diamonds", metalType: "DIAMOND" as const, weightUnit: "CARAT" as const, subcategories: ["Round", "Princess", "Cushion", "Oval", "Emerald", "Pear", "Marquise", "Radiant", "Asscher", "Heart"] },
  { name: "Jewelry", metalType: "JEWELRY" as const, weightUnit: "GRAM" as const, subcategories: ["Ring", "Necklace", "Bracelet", "Earrings", "Pin/Brooch"] },
  { name: "Watches", metalType: "WATCH" as const, weightUnit: "GRAM" as const, subcategories: ["Wristwatch", "Pocket Watch"] },
]

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await prisma.stockCategory.count()
  if (existing > 0) return NextResponse.json({ message: "Categories already exist", count: existing })

  for (let i = 0; i < defaults.length; i++) {
    const d = defaults[i]
    await prisma.stockCategory.create({
      data: {
        name: d.name,
        metalType: d.metalType,
        weightUnit: d.weightUnit,
        sortOrder: i,
        subcategories: {
          create: d.subcategories.map((sub, j) => ({ name: sub, sortOrder: j })),
        },
      },
    })
  }

  return NextResponse.json({ message: "Seeded", count: defaults.length })
}
