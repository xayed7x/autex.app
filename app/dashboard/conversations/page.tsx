"use client"

import { useState, useEffect, useRef } from "react"
import { TopBar } from "@/components/dashboard/top-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Search, Send, ArrowLeft, ExternalLink, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RequireFacebookPage } from "@/components/dashboard/require-facebook-page"

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
  fb_page_id: number
  current_state: ConversationStatus
  last_message_at: string
  created_at: string
  context: any
  message_count: number
  last_message: Message | null
  messages?: Message[]
  customer_profile_pic_url?: string | null
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
  const [sendingMessage, setSendingMessage] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [selectedConversation?.messages, detailLoading])

  useEffect(() => {
    fetchConversations()
  }, [statusFilter, searchQuery])

  // Polling effect for real-time message updates
  useEffect(() => {
    if (selectedConversation) {
      // Start polling when a conversation is selected
      pollingIntervalRef.current = setInterval(() => {
        fetchConversationDetail(selectedConversation.id, true)
      }, 5000) // Poll every 5 seconds
    }

    // Cleanup: stop polling when conversation is deselected or component unmounts
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [selectedConversation?.id])

  const fetchConversations = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.append("status", statusFilter)
      if (searchQuery) params.append("search", searchQuery)

      const response = await fetch(`/api/conversations?${params}`)
      if (!response.ok) throw new Error("Failed to fetch conversations")
      
      const data = await response.json()
      const conversationsData = data.conversations || []
      

      setConversations(conversationsData)
      
      // Auto-select first conversation if none selected
      if (!selectedConversation && conversationsData.length > 0) {
        handleSelectConversation(conversationsData[0])
      }
    } catch (error) {
      console.error("Error fetching conversations:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchConversationDetail = async (id: string, silent = false) => {
    try {
      if (!silent) setDetailLoading(true)
      const response = await fetch(`/api/conversations/${id}`)
      if (!response.ok) throw new Error("Failed to fetch conversation detail")
      
      const data = await response.json()
      setSelectedConversation(data)
    } catch (error) {
      console.error("Error fetching conversation detail:", error)
    } finally {
      if (!silent) setDetailLoading(false)
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!newMessage.trim() || !selectedConversation || sendingMessage) {
      return
    }

    const messageText = newMessage.trim()
    const tempId = `temp-${Date.now()}`
    
    // Optimistic UI update
    const optimisticMessage: Message = {
      id: tempId,
      sender: 'human',
      message_text: messageText,
      message_type: 'text',
      created_at: new Date().toISOString(),
    }

    setSelectedConversation(prev => {
      if (!prev) return prev
      return {
        ...prev,
        messages: [...(prev.messages || []), optimisticMessage]
      }
    })

    setNewMessage('')
    setSendingMessage(true)

    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: messageText }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send message')
      }

      const data = await response.json()
      
      // Replace optimistic message with real message from server
      setSelectedConversation(prev => {
        if (!prev) return prev
        return {
          ...prev,
          messages: (prev.messages || []).map(msg => 
            msg.id === tempId ? data.message : msg
          )
        }
      })

      toast.success('Message sent successfully')
    } catch (error: any) {
      console.error('Error sending message:', error)
      
      // Remove optimistic message on error
      setSelectedConversation(prev => {
        if (!prev) return prev
        return {
          ...prev,
          messages: (prev.messages || []).filter(msg => msg.id !== tempId)
        }
      })
      
      // Restore message text so user can retry
      setNewMessage(messageText)
      toast.error(error.message || 'Failed to send message')
    } finally {
      setSendingMessage(false)
    }
  }

  const getSenderLabel = (sender: string) => {
    if (sender === 'human') return 'You'
    if (sender === 'bot') return 'Bot'
    return 'Customer'
  }

  const getSenderBgColor = (sender: string) => {
    if (sender === 'human') return 'bg-blue-500/10 text-foreground'
    if (sender === 'bot') return 'bg-muted text-foreground'
    return 'bg-primary/10 text-foreground'
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
    <RequireFacebookPage>
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
          <div className="flex-1 overflow-y-auto">
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
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={conv.customer_profile_pic_url || undefined} alt={conv.customer_name} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {(conv.customer_name || 'U').substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">
                            {conv.customer_name || "Unknown Customer"}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(conv.last_message_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className={cn("h-2 w-2 rounded-full flex-shrink-0", statusIndicator[conv.current_state] || "bg-muted-foreground/30")} />
                          <p className="text-xs text-muted-foreground truncate">
                            {conv.last_message?.message_text || "No messages"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Panel - Right Panel */}
        <div className={cn("flex-1 flex flex-col bg-background h-full overflow-hidden", mobileView === "list" && "hidden lg:flex")}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-border flex items-center gap-4 shrink-0 bg-background z-10">
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileView("list")}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Avatar className="h-10 w-10">
                  <AvatarImage 
                    src={selectedConversation.customer_profile_pic_url || undefined} 
                    alt={selectedConversation.customer_name} 
                  />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {(selectedConversation.customer_name || 'U').substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-semibold">
                    {selectedConversation.customer_name || "Unknown Customer"}
                  </h3>
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
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {detailLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="flex flex-col justify-end min-h-full">
                    <div className="space-y-4">
                      {selectedConversation.messages && selectedConversation.messages.length > 0 ? (
                        selectedConversation.messages.map((message) => (
                          <div
                            key={message.id}
                            className={cn("flex flex-col", message.sender === "customer" ? "items-end" : "items-start")}
                          >
                            <span className="text-[10px] text-muted-foreground mb-1 px-1">
                              {getSenderLabel(message.sender)}
                            </span>
                            <div
                              className={cn(
                                "max-w-[70%] rounded-lg px-4 py-2",
                                getSenderBgColor(message.sender),
                              )}
                            >
                              <p className="text-sm whitespace-pre-line">{message.message_text}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {formatMessageTime(message.created_at)}
                                {message.id.startsWith('temp-') && (
                                  <span className="ml-2 italic">Sending...</span>
                                )}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-10">
                          No messages in this conversation
                        </div>
                      )}

                      {/* Order Created System Message */}
                      {getOrderIdFromContext(selectedConversation.context) && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground my-4">
                          <div className="flex-1 h-px bg-border" />
                          <span>Order Created</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      
                      {/* Invisible element to scroll to */}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input - Manual Messaging */}
              <div className="p-4 border-t border-border">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1"
                    disabled={sendingMessage}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage(e)
                      }
                    }}
                  />
                  <Button 
                    type="submit" 
                    size="icon" 
                    disabled={sendingMessage || !newMessage.trim()}
                  >
                    {sendingMessage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground mt-2">
                  Messages are sent directly to the customer via Facebook Messenger. Press Enter to send.
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
    </RequireFacebookPage>
  )
}
