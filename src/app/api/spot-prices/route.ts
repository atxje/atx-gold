import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getSpotPrices } from "@/lib/spot"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    return NextResponse.json(await getSpotPrices())
  } catch (error) {
    console.error("Spot price fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch spot prices" }, { status: 502 })
  }
}
