import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const JEWELRY_DEFAULTS = ["T&Co", "DY", "JA", "Cartier", "VCA"]
const WATCH_DEFAULTS = ["Rolex", "Cartier", "Omega", "Audemars Piguet", "Patek Philippe", "Breitling", "Tag Heuer", "IWC", "Panerai", "Tudor", "Hublot"]
const STONE_DEFAULTS = ["Diamond", "Sapphire", "Ruby", "Tanzanite", "Topaz"]

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Idempotent: only inserts defaults that aren't already present (per type),
  // so it can backfill a new type like STONE without touching existing brands.
  const rows = [
    ...JEWELRY_DEFAULTS.map((name, i) => ({ name, type: "JEWELRY", sortOrder: i })),
    ...WATCH_DEFAULTS.map((name, i) => ({ name, type: "WATCH", sortOrder: i })),
    ...STONE_DEFAULTS.map((name, i) => ({ name, type: "STONE", sortOrder: i })),
  ]
  const result = await prisma.brand.createMany({ data: rows, skipDuplicates: true })

  return NextResponse.json({ message: "Seeded", count: result.count })
}
