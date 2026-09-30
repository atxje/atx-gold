import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GUIDELINE_DEFAULTS } from "@/lib/overpay"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const row = await prisma.buyingGuidelines.findFirst()
  return NextResponse.json(row ?? GUIDELINE_DEFAULTS)
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await request.json()
  const fields = [
    "maxPctMeltGoldPlat",
    "maxPctMeltSilverScrap",
    "maxUnderSpotGoldPlatCoins",
    "maxUnderSpotSilverCoins",
    "maxUnderSpotSilverJunk",
  ] as const

  const data: Record<string, number | string> = {}
  for (const f of fields) {
    const v = Number(body[f])
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: `Invalid value for ${f}` }, { status: 400 })
    }
    data[f] = v
  }
  data.updatedBy = session.user.id

  const existing = await prisma.buyingGuidelines.findFirst()
  const row = existing
    ? await prisma.buyingGuidelines.update({ where: { id: existing.id }, data })
    : await prisma.buyingGuidelines.create({ data })

  return NextResponse.json(row)
}
