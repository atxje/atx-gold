import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const conversations = await prisma.smsConversation.findMany({
      include: {
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        messages: {
          orderBy: { sentAt: "desc" },
          take: 1, // Get last message for preview
        },
      },
      orderBy: { startedAt: "desc" },
    })

    // Transform to include last message preview
    const conversationsWithPreview = conversations.map((conv) => ({
      id: conv.id,
      leadId: conv.leadId,
      leadName: conv.lead.name,
      leadPhone: conv.lead.phone,
      status: conv.status,
      startedAt: conv.startedAt,
      lastMessage: conv.messages[0]?.content || null,
      lastMessageAt: conv.messages[0]?.sentAt || conv.startedAt,
      lastMessageDirection: conv.messages[0]?.direction || null,
    }))

    return NextResponse.json(conversationsWithPreview)
  } catch (error) {
    console.error("Error fetching conversations:", error)
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    )
  }
}
