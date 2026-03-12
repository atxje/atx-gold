import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getRapPrice } from "@/lib/rapaport"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const shape = searchParams.get("shape")
  const size = searchParams.get("size")
  const color = searchParams.get("color")
  const clarity = searchParams.get("clarity")

  if (!shape || !size || !color || !clarity) {
    return NextResponse.json(
      { error: "Missing required params: shape, size, color, clarity" },
      { status: 400 },
    )
  }

  const sizeNum = parseFloat(size)
  if (isNaN(sizeNum) || sizeNum <= 0) {
    return NextResponse.json({ error: "Invalid size" }, { status: 400 })
  }

  try {
    const price = await getRapPrice(shape, sizeNum, color, clarity)
    return NextResponse.json(price)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Rapaport API error"
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
