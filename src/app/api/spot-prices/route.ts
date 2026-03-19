import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

interface SpotPrices {
  gold: number
  silver: number
  timestamp: string
}

let cache: { data: SpotPrices; fetchedAt: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Return cached if fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cache.data)
  }

  try {
    const [goldRes, silverRes] = await Promise.all([
      fetch("https://api.gold-api.com/price/XAU"),
      fetch("https://api.gold-api.com/price/XAG"),
    ])

    if (!goldRes.ok || !silverRes.ok) {
      throw new Error("Failed to fetch spot prices")
    }

    const goldData = await goldRes.json()
    const silverData = await silverRes.json()

    const result: SpotPrices = {
      gold: goldData.price,
      silver: silverData.price,
      timestamp: new Date().toISOString(),
    }

    cache = { data: result, fetchedAt: Date.now() }
    return NextResponse.json(result)
  } catch (error) {
    console.error("Spot price fetch error:", error)
    // Return stale cache if available
    if (cache) return NextResponse.json(cache.data)
    return NextResponse.json({ error: "Failed to fetch spot prices" }, { status: 502 })
  }
}
