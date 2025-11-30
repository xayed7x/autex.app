"use client"

import { useState, useEffect } from "react"
import { TopBar } from "@/components/dashboard/top-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { Search, Send, ArrowLeft, ExternalLink, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

type ConversationStatus = "IDLE" | "AWAITING_NAME" | "AWAITING_PHONE" | "AWAITING_ADDRESS" | "ORDER_COMPLETE"

interface Message {
  id: string
  sender: string
  message_text: string
  message_type: string
  created_at: string
  attachments?: any
}

interface Conversation {
  id: string
  customer_name: string
  customer_psid: string
  current_state: ConversationStatus
  last_message_at: string
  created_at: string
  context: any
  message_count: number
  last_message: Message | null
  messages?: Message[]
}

const statusIndicator: Record<string, string> = {
  IDLE: "bg-muted-foreground/30",
  AWAITING_NAME: "bg-yellow-500",
  AWAITING_PHONE: "bg-yellow-500",
  AWAITING_ADDRESS: "bg-yellow-500",
  ORDER_COMPLETE: "bg-green-500",
}

const statusLabels: Record<string, string> = {
  IDLE: "Idle",
  AWAITING_NAME: "Pending",
  AWAITING_PHONE: "Pending",
  AWAITING_ADDRESS: "Pending",
  ORDER_COMPLETE: "Completed",
}

export default function ConversationsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [newMessage, setNewMessage] = useState("")
  const [mobileView, setMobileView] = useState<"list" | "chat">("list")
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    fetchConversations()
  }, [statusFilter, searchQuery])

  const fetchConversations = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.append("status", statusFilter)
      if (searchQuery) params.append("search", searchQuery)

      const response = await fetch(`/api/conversations?${params}`)
      if (!response.ok) throw new Error("Failed to fetch conversations")
      
      const data = await response.json()
      setConversations(data.conversations || [])
      
      // Auto-select first conversation if none selected
      if (!selectedConversation && data.conversations?.length > 0) {
        handleSelectConversation(data.conversations[0])
      }
    } catch (error) {
      console.error("Error fetching conversations:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchConversationDetail = async (id: string) => {
    try {
      setDetailLoading(true)
      const response = await fetch(`/api/conversations/${id}`)
      if (!response.ok) throw new Error("Failed to fetch conversation detail")
      
      const data = await response.json()
      setSelectedConversation(data)
    } catch (error) {
      console.error("Error fetching conversation detail:", error)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleSelectConversation = async (conv: Conversation) => {
    setMobileView("chat")
    await fetchConversationDetail(conv.id)
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
    return date.toLocaleDateString()
  }

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  }

  const getOrderIdFromContext = (context: any) => {
    try {
      if (context?.order_id) return context.order_id
      return null
    } catch {
      return null
    }
  }

  return (
    <>
      <TopBar title="Conversations" />

      <div className="flex h-[calc(100vh-4rem)]">
        {/* Conversations List - Left Panel */}
        <div
          className={cn(
            "w-full lg:w-80 border-r border-border flex flex-col bg-background",
            mobileView === "chat" && "hidden lg:flex",
          )}
        >
          {/* Search and Filters */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search chats..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="w-full bg-muted/50">
                <TabsTrigger value="all" className="flex-1 text-xs">
                  All
                </TabsTrigger>
                <TabsTrigger value="IDLE" className="flex-1 text-xs">
                  Idle
                </TabsTrigger>
                <TabsTrigger value="AWAITING_NAME" className="flex-1 text-xs">
                  Pending
                </TabsTrigger>
                <TabsTrigger value="ORDER_COMPLETE" className="flex-1 text-xs">
                  Completed
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Conversation List */}
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <p className="text-sm text-muted-foreground">No conversations found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Conversations will appear here when customers message your Facebook page
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={cn(
                      "w-full p-4 text-left hover:bg-muted/50 transition-colors",
                      selectedConversation?.id === conv.id && "bg-sidebar-accent",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("h-2.5 w-2.5 rounded-full mt-1.5", statusIndicator[conv.current_state] || "bg-muted-foreground/30")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">
                            {conv.customer_name || "Unknown Customer"}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(conv.last_message_at)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {conv.last_message?.message_text || "No messages"}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Chat Panel - Right Panel */}
        <div className={cn("flex-1 flex flex-col bg-background", mobileView === "list" && "hidden lg:flex")}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-border flex items-center gap-4">
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileView("list")}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                  <h3 className="font-semibold">{selectedConversation.customer_name || "Unknown Customer"}</h3>
                  <p className="text-xs text-muted-foreground">
                    {statusLabels[selectedConversation.current_state] || selectedConversation.current_state}
                  </p>
                </div>
                {getOrderIdFromContext(selectedConversation.context) && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => router.push(`/dashboard/orders`)}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Order
                  </Button>
                )}
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {detailLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedConversation.messages && selectedConversation.messages.length > 0 ? (
                      selectedConversation.messages.map((message) => (
                        <div
                          key={message.id}
                          className={cn("flex", message.sender === "customer" ? "justify-end" : "justify-start")}
                        >
                          <div
                            className={cn(
                              "max-w-[70%] rounded-lg px-4 py-2",
                              message.sender === "customer" ? "bg-primary/10 text-foreground" : "bg-muted text-foreground",
                            )}
                          >
                            <p className="text-sm whitespace-pre-line">{message.message_text}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatMessageTime(message.created_at)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        No messages in this conversation
                      </div>
                    )}

                    {/* Order Created System Message */}
                    {getOrderIdFromContext(selectedConversation.context) && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="flex-1 h-px bg-border" />
                        <span>Order Created</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              {/* Chat Input - Disabled for now as this is read-only */}
              <div className="p-4 border-t border-border">
                <div className="flex gap-2">
                  <Input
                    placeholder="Manual messaging coming soon..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1"
                    disabled
                  />
                  <Button type="submit" size="icon" disabled>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Currently view-only. Customers receive automated responses via Facebook Messenger.
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                "Select a conversation to view messages"
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
