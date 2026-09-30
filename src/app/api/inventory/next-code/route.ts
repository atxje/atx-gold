import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { peekItemCodeNumber } from "@/lib/doc-numbers"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const prefix = searchParams.get("prefix")
  if (!prefix || !["D", "J", "W"].includes(prefix)) {
    return NextResponse.json({ error: "prefix must be D, J, or W" }, { status: 400 })
  }

  // Preview only — the real code is assigned when the purchase is saved
  const nextNum = await peekItemCodeNumber(prisma, prefix as "D" | "J" | "W")

  return NextResponse.json({ nextNum })
}
