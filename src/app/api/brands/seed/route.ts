import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const JEWELRY_DEFAULTS = ["T&Co", "DY", "JA", "Cartier", "VCA"]
const WATCH_DEFAULTS = ["Rolex", "Cartier", "Omega", "Audemars Piguet", "Patek Philippe", "Breitling", "Tag Heuer", "IWC", "Panerai", "Tudor", "Hublot"]

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await prisma.brand.count()
  if (existing > 0) return NextResponse.json({ message: "Brands already exist", count: existing })

  const rows = [
    ...JEWELRY_DEFAULTS.map((name, i) => ({ name, type: "JEWELRY", sortOrder: i })),
    ...WATCH_DEFAULTS.map((name, i) => ({ name, type: "WATCH", sortOrder: i })),
  ]
  await prisma.brand.createMany({ data: rows })

  return NextResponse.json({ message: "Seeded", count: rows.length })
}
