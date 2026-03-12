"use client"

import { useEffect, useState, useRef, use } from "react"
import Link from "next/link"
import { format } from "date-fns"

interface Message {
  id: string
  direction: "INBOUND" | "OUTBOUND"
  content: string
  sentAt: string
}

interface Lead {
  id: string
  name: string
  phone: string | null
  email: string | null
  status: string
}

interface Conversation {
  id: string
  status: "ACTIVE" | "COMPLETED" | "PAUSED"
  startedAt: string
  lead: Lead
  messages: Message[]
}

export default function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchConversation()
  }, [id])

  useEffect(() => {
    scrollToBottom()
  }, [conversation?.messages])

  async function fetchConversation() {
    try {
      const res = await fetch(`/api/conversations/${id}`)
      if (res.ok) {
        const data = await res.json()
        setConversation(data)
      }
    } catch (error) {
      console.error("Error fetching conversation:", error)
    } finally {
      setLoading(false)
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() || !conversation) return

    setSending(true)
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: conversation.lead.id,
          message: message.trim(),
        }),
      })

      if (res.ok) {
        setMessage("")
        // Refresh conversation to show new message
        fetchConversation()
      }
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setSending(false)
    }
  }

  async function updateStatus(status: string) {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      fetchConversation()
    } catch (error) {
      console.error("Error updating status:", error)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900">
            Conversation not found
          </h3>
          <Link href="/conversations" className="text-blue-600 hover:underline">
            Back to messages
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-4 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/conversations"
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">
                {conversation.lead.name}
              </h1>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {conversation.lead.phone}
              {conversation.lead.email && ` | ${conversation.lead.email}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/leads/${conversation.lead.id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              View Lead
            </Link>
            <select
              value={conversation.status}
              onChange={(e) => updateStatus(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="h-96 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {conversation.messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No messages yet
            </div>
          ) : (
            conversation.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.direction === "OUTBOUND" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-xs sm:max-w-md px-4 py-2 rounded-lg ${
                    msg.direction === "OUTBOUND"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-900 border border-gray-200"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p
                    className={`text-xs mt-1 ${
                      msg.direction === "OUTBOUND"
                        ? "text-blue-200"
                        : "text-gray-400"
                    }`}
                  >
                    {format(new Date(msg.sentAt), "MMM d, h:mm a")}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {conversation.status === "ACTIVE" && (
          <form onSubmit={handleSend} className="border-t p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          </form>
        )}

        {conversation.status !== "ACTIVE" && (
          <div className="border-t p-4 text-center text-gray-500 text-sm">
            This conversation is {conversation.status.toLowerCase()}.{" "}
            <button
              onClick={() => updateStatus("ACTIVE")}
              className="text-blue-600 hover:underline"
            >
              Reactivate
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
