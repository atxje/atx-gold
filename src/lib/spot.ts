export interface SpotPrices {
  gold: number
  silver: number
  platinum: number
  timestamp: string
}

let cache: { data: SpotPrices; fetchedAt: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Shared spot-price fetch with a 5-minute cache. Used by the /api/spot-prices
// route and by server-side gross-profit calculation.
export async function getSpotPrices(): Promise<SpotPrices> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return cache.data

  const [goldRes, silverRes, platinumRes] = await Promise.all([
    fetch("https://api.gold-api.com/price/XAU"),
    fetch("https://api.gold-api.com/price/XAG"),
    fetch("https://api.gold-api.com/price/XPT"),
  ])

  if (!goldRes.ok || !silverRes.ok || !platinumRes.ok) {
    if (cache) return cache.data
    throw new Error("Failed to fetch spot prices")
  }

  const goldData = await goldRes.json()
  const silverData = await silverRes.json()
  const platinumData = await platinumRes.json()

  const data: SpotPrices = {
    gold: goldData.price,
    silver: silverData.price,
    platinum: platinumData.price,
    timestamp: new Date().toISOString(),
  }
  cache = { data, fetchedAt: Date.now() }
  return data
}
