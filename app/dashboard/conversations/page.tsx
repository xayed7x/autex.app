"use client"

import { useState, useEffect, useRef } from "react"
import { TopBar } from "@/components/dashboard/top-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Search, Send, ArrowLeft, ExternalLink, Trash2, AlertTriangle, RefreshCw, ChevronDown, Bot, User } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PremiumLoader } from "@/components/ui/premium/premium-loader"
import { createClient } from "@/lib/supabase/client"
import { useWorkspace } from "@/lib/workspace-provider"
import { RequireFacebookPage } from "@/components/dashboard/require-facebook-page"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CONVERSATION_STATES } from "@/lib/conversation/state-machine"

type ConversationStatus = "IDLE" | "AWAITING_NAME" | "AWAITING_PHONE" | "AWAITING_ADDRESS" | "ORDER_COMPLETE"

interface Message {
  id: string
  sender: string
  sender_type?: 'customer' | 'bot' | 'owner' | null
  message_text: string
  message_type: string
  created_at: string
  attachments?: any
  image_url?: string | null
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
  control_mode?: 'bot' | 'manual' | 'hybrid' | null
  last_manual_reply_at?: string | null
  last_manual_reply_by?: string | null
  bot_pause_until?: string | null
  // Manual flag fields for AI Director 2.0
  needs_manual_response?: boolean | null
  manual_flag_reason?: string | null
  manual_flagged_at?: string | null
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

const HYBRID_PAUSE_MINUTES = 30

const getControlModeBadge = (conv: Conversation) => {
  const mode = conv.control_mode || 'bot'
  const lastManualReplyAt = conv.last_manual_reply_at
  
  // Calculate countdown for hybrid mode
  let countdown: number | null = null
  if (mode === 'hybrid' && lastManualReplyAt) {
    const lastReplyTime = new Date(lastManualReplyAt).getTime()
    const resumeTime = lastReplyTime + (HYBRID_PAUSE_MINUTES * 60 * 1000)
    const now = Date.now()
    const remainingMs = resumeTime - now
    if (remainingMs > 0) {
      countdown = Math.ceil(remainingMs / (60 * 1000))
    }
  }
  
  switch (mode) {
    case 'bot':
      return {
        icon: '🤖',
        label: 'Bot',
        className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
        needsAttention: false,
      }
    case 'manual':
      return {
        icon: '👨‍💼',
        label: 'Manual',
        className: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
        needsAttention: true,
      }
    case 'hybrid':
      return {
        icon: '🔄',
        label: countdown ? `Hybrid (${countdown}m)` : 'Hybrid',
        className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
        needsAttention: false,
      }
    default:
      return {
        icon: '🤖',
        label: 'Bot',
        className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
        needsAttention: false,
      }
  }
}

// Message grouping helper
interface GroupedMessage extends Message {
  isFirst?: boolean
  isMiddle?: boolean
  isLast?: boolean
  isSingle?: boolean
}

const groupMessages = (messages: Message[]): GroupedMessage[] => {
  if (!messages || messages.length === 0) return []
  
  return messages.map((msg, index) => {
    const prev = messages[index - 1]
    const next = messages[index + 1]
    
    const getSenderId = (m: Message) => m.sender_type || m.sender
    
    const isSameAsPrev = prev && getSenderId(prev) === getSenderId(msg)
    const isSameAsNext = next && getSenderId(next) === getSenderId(msg)
    
    // Check time gap (2 minutes for grouping)
    const timeGapPrev = prev ? (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) : 0
    const timeGapNext = next ? (new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) : 0
    
    const groupThreshold = 120000 // 2 minutes
    
    const isFirst = !isSameAsPrev || timeGapPrev > groupThreshold
    const isLast = !isSameAsNext || timeGapNext > groupThreshold
    
    return {
      ...msg,
      isFirst: isFirst && !isLast,
      isMiddle: isSameAsPrev && isSameAsNext && timeGapPrev <= groupThreshold && timeGapNext <= groupThreshold,
      isLast: isLast && !isFirst,
      isSingle: isFirst && isLast
    }
  })
}

export default function ConversationsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [controlModeFilter, setControlModeFilter] = useState("all")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [newMessage, setNewMessage] = useState("")
  const [mobileView, setMobileView] = useState<"list" | "chat">("list")
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [pageBotEnabled, setPageBotEnabled] = useState<boolean | null>(null)
  const [currentPageId, setCurrentPageId] = useState<string | null>(null)
  const [enablingBot, setEnablingBot] = useState(false)
  const [changingState, setChangingState] = useState(false) // Loading state for state change
  const [resetDialogOpen, setResetDialogOpen] = useState(false) // Confirmation dialog for IDLE reset
  const [pendingState, setPendingState] = useState<string | null>(null) // State waiting for confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [thumbTop, setThumbTop] = useState(0)
  const [thumbHeight, setThumbHeight] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Needs Reply filter state
  const [needsReplyFilter, setNeedsReplyFilter] = useState(false)
  const { needsReplyCount, workspaceId } = useWorkspace()
  const selectedIdRef = useRef<string | null>(null)

  // Keep ref in sync with selected conversation for Real-time callbacks
  useEffect(() => {
    selectedIdRef.current = selectedConversation?.id || null
  }, [selectedConversation?.id])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    if (!scrollContainerRef.current) return
    const container = scrollContainerRef.current
    
    const updateThumb = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const height = Math.max((clientHeight / scrollHeight) * clientHeight, 40)
      const top = (scrollTop / scrollHeight) * clientHeight
      setThumbHeight(height)
      setThumbTop(top)
      
      const atBottom = scrollHeight - scrollTop - clientHeight < 100
      setIsAtBottom(atBottom)
      if (atBottom) setShowScrollButton(false)
    }
    
    container.addEventListener('scroll', updateThumb)
    window.addEventListener('resize', updateThumb)
    updateThumb()
    
    return () => {
      container.removeEventListener('scroll', updateThumb)
      window.removeEventListener('resize', updateThumb)
    }
  }, [selectedConversation?.messages])

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startY = e.clientY
    const startTop = thumbTop
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!scrollContainerRef.current) return
      const deltaY = moveEvent.clientY - startY
      const containerHeight = scrollContainerRef.current.clientHeight
      const scrollHeight = scrollContainerRef.current.scrollHeight
      
      const newTop = Math.min(Math.max(startTop + deltaY, 0), containerHeight - thumbHeight)
      const scrollRatio = newTop / containerHeight
      scrollContainerRef.current.scrollTop = scrollRatio * scrollHeight
    }
    
    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Handle URL query params for filter and deep-linking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    
    // Filter deep-linking
    if (params.get('filter') === 'needs_reply') {
      setNeedsReplyFilter(true)
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/conversations')
    }
    
    // Conversation deep-linking
    const conversationId = params.get('id')
    if (conversationId) {
      console.log('🔗 Deep-linking to conversation:', conversationId)
      setMobileView("chat")
      fetchConversationDetail(conversationId)
      // Clean up URL to prevent re-triggering if user refreshes
      window.history.replaceState({}, '', '/dashboard/conversations')
    }
  }, [])

  useEffect(() => {
    fetchConversations()
    fetchPageBotStatus()
  }, [statusFilter, searchQuery, needsReplyFilter])

  // Real-time Subscriptions
  useEffect(() => {
    if (!workspaceId) return
    
    const supabase = createClient()
    
    // 1. Subscribe to conversation updates (for list sorting and status)
    const convChannel = supabase
      .channel(`conversations-list-${workspaceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `workspace_id=eq.${workspaceId}`
      }, (payload) => {
        const updatedConv = payload.new as Conversation
        setConversations(prev => {
          const exists = prev.find(c => c.id === updatedConv.id)
          if (exists) {
            // Update existing and move to top if it's a new message
            const filtered = prev.filter(c => c.id !== updatedConv.id)
            return [{ ...exists, ...updatedConv }, ...filtered]
          } else {
            // New conversation
            return [updatedConv, ...prev]
          }
        })
      })
      .subscribe()

    // 2. Subscribe to messages (for real-time chat)
    // Note: We listen to all messages for this workspace implicitly by listening to 
    // messages where the conversation is in our conversations list.
    // However, to keep it simple and secure, we'll subscribe to messages for the selected conversation
    // and also listen for ANY message update to refresh the conversation list's "last message".
    const msgChannel = supabase
      .channel(`messages-global-${workspaceId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, async (payload) => {
        const newMessage = payload.new as Message
        
        // Update conversation list item's last message
        setConversations(prev => prev.map(conv => {
          if (conv.id === newMessage.conversation_id) {
            return {
              ...conv,
              last_message: newMessage,
              last_message_at: newMessage.created_at,
              message_count: (conv.message_count || 0) + 1
            }
          }
          return conv
        }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()))

        // If this message belongs to the selected conversation, append it
        if (selectedIdRef.current && newMessage.conversation_id === selectedIdRef.current) {
          setSelectedConversation(prev => {
            if (!prev) return prev
            // Avoid duplicates (e.g. from optimistic UI)
            if (prev.messages?.some(m => m.id === newMessage.id || m.id === `temp-${newMessage.created_at}`)) {
              return prev
            }
            return {
              ...prev,
              messages: [...(prev.messages || []), newMessage]
            }
          })
          
          // Auto-scroll if we are at bottom
          if (isAtBottom) {
            setTimeout(scrollToBottom, 50)
          } else if (newMessage.sender_type === 'owner' || newMessage.sender === 'human') {
            // Always scroll if WE sent the message
            setTimeout(scrollToBottom, 50)
          } else {
            setShowScrollButton(true)
          }
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(convChannel)
      supabase.removeChannel(msgChannel)
    }
  }, [workspaceId, selectedConversation?.id, isAtBottom])

  // Automatically scroll to bottom when switching conversations or new messages arrive
  useEffect(() => {
    if (selectedConversation) {
      // For initial load or switching conversations, jump instantly to bottom
      // This prevents the user from having to scroll down manually
      const jumpToBottom = () => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: "auto" })
        }
      }
      
      // Run once immediately
      jumpToBottom()
      
      // Run again after a tiny delay to ensure any images/carousels have calculated heights
      const timer = setTimeout(jumpToBottom, 100)
      return () => clearTimeout(timer)
    }
  }, [selectedConversation?.id, selectedConversation?.messages?.length])

  // Removed handleScroll as it's now integrated into the thumb update useEffect

  const fetchConversations = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.append("status", statusFilter)
      if (searchQuery) params.append("search", searchQuery)
      if (needsReplyFilter) params.append("needs_manual_response", "true")

      const response = await fetch(`/api/conversations?${params}`)
      if (!response.ok) throw new Error("Failed to fetch conversations")
      
      const data = await response.json()
      const conversationsData = data.conversations || []
      
      setConversations(conversationsData)
      
      // Clear selected conversation if list is empty
      if (conversationsData.length === 0) {
        setSelectedConversation(null)
      } 
      // Check if currently selected conversation is still in the filtered list
      else if (selectedConversation) {
        const stillExists = conversationsData.some((conv: Conversation) => conv.id === selectedConversation.id)
        if (!stillExists) {
          // Selected conversation is not in current filter, clear selection
          setSelectedConversation(null)
          // On mobile, this should arguably go back to list view, but simple null is safer for now
          setMobileView("list") 
        }
      }
      // Do NOT auto-select first conversation
      // User must manually select a conversation to view details
    } catch (error) {
      console.error("Error fetching conversations:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPageBotStatus = async () => {
    try {
      const response = await fetch('/api/facebook/pages')
      if (!response.ok) return
      
      const data = await response.json()
      if (data.pages && data.pages.length > 0) {
        const page = data.pages[0]
        setPageBotEnabled(page.bot_enabled)
        setCurrentPageId(String(page.id))
      }
    } catch (error) {
      console.error('Error fetching page bot status:', error)
    }
  }

  const handleEnableBot = async () => {
    if (!currentPageId) return
    
    try {
      setEnablingBot(true)
      const response = await fetch(`/api/facebook/pages/${currentPageId}/toggle-bot`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_enabled: true }),
      })

      if (!response.ok) throw new Error('Failed to enable bot')

      setPageBotEnabled(true)
      toast.success('🤖 Bot enabled for all conversations')
    } catch (error) {
      console.error('Error enabling bot:', error)
      toast.error('Failed to enable bot')
    } finally {
      setEnablingBot(false)
    }
  }

  // Handle manual state change by owner
  const handleStateChange = async (newState: string) => {
    if (!selectedConversation) return

    // Show styled confirmation for destructive reset
    const stateInfo = CONVERSATION_STATES.find(s => s.value === newState)
    if (stateInfo?.clearsCart) {
      setPendingState(newState)
      setResetDialogOpen(true)
      return // Wait for dialog confirmation
    }

    // Execute state change directly for non-destructive changes
    await executeStateChange(newState)
  }

  // Actually execute the state change (after confirmation if needed)
  const executeStateChange = async (newState: string) => {
    if (!selectedConversation) return

    const stateInfo = CONVERSATION_STATES.find(s => s.value === newState)
    setChangingState(true) // Start loading
    
    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newState }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to change state')
      }

      const data = await response.json()
      
      // Update local state
      setSelectedConversation(prev => prev ? {
        ...prev,
        current_state: newState as ConversationStatus,
        context: data.conversation.context,
        needs_manual_response: false,
        manual_flag_reason: null,
      } : null)

      // Show success toast with cleared fields info
      const clearedInfo = data.cleared?.length > 0 
        ? ` (Cleared: ${data.cleared.join(', ')})` 
        : ''
      toast.success(`🔧 State changed to ${stateInfo?.label || newState}${clearedInfo}`)

      // Refresh conversation list
      fetchConversations()
    } catch (error: any) {
      console.error('Error changing state:', error)
      toast.error(error.message || 'Failed to change state')
    } finally {
      setChangingState(false) // End loading
      setPendingState(null)
    }
  }

  const fetchConversationDetail = async (id: string, silent = false) => {
    try {
      if (!silent) setDetailLoading(true)
      const response = await fetch(`/api/conversations/${id}`)
      if (!response.ok) throw new Error("Failed to fetch conversation detail")
      
      const data = await response.json()
      
      // If this conversation was flagged, the server already cleared it in DB.
      // Locally reflect that immediately so the badge disappears.
      if (data.needs_manual_response) {
        data.needs_manual_response = false
        data.manual_flag_reason = null
        
        // Update the item in the main list too so the sidebar badge disappears
        setConversations(prev => prev.map(conv => {
          if (conv.id === id) {
            return { ...conv, needs_manual_response: false, manual_flag_reason: null }
          }
          return conv
        }))
        
        // Notify TopBar to refresh its badge count
        window.dispatchEvent(new CustomEvent('needsReplyCountChanged'))
      }
      
      setSelectedConversation(data)
    } catch (error) {
      console.error("Error fetching conversation detail:", error)
    } finally {
      if (!silent) setDetailLoading(false)
    }
  }

  const handleDeleteConversation = async () => {
    if (!selectedConversation) return
    
    setDeleting(true)
    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete conversation')
      }

      toast.success('Conversation deleted')
      setSelectedConversation(null)
      setMobileView('list')
      setDeleteDialogOpen(false)
      fetchConversations()
    } catch (error: any) {
      console.error('Error deleting conversation:', error)
      toast.error(error.message || 'Failed to delete conversation')
    } finally {
      setDeleting(false)
    }
  }

  const handleSelectConversation = async (conv: Conversation) => {
    setMobileView("chat")
    // Optimistically set the basic info so the header can show immediately
    setSelectedConversation(prev => ({
      ...conv,
      messages: prev?.id === conv.id ? prev.messages : [] // keep messages if same ID, else clear to avoid flash
    }))
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
      
      // Check if this was a flagged conversation - show special toast
      const wasFlagged = selectedConversation.needs_manual_response
      
      // Replace optimistic message with real message from server
      setSelectedConversation(prev => {
        if (!prev) return prev
        return {
          ...prev,
          messages: (prev.messages || []).map(msg => 
            msg.id === tempId ? data.message : msg
          ),
          // Clear the manual flag after owner replied
          needs_manual_response: false,
          manual_flag_reason: null,
          // Update control mode - now preserving current mode as per user request
          control_mode: data.control_mode || prev.control_mode,
        }
      })

      // Show appropriate toast message
      if (wasFlagged) {
        toast.success('✅ Message sent! Bot remains active')
        // Re-fetch conversations to update the local badge count
        fetchConversations()
        // Dispatch event to notify TopBar to refresh its badge
        window.dispatchEvent(new CustomEvent('needsReplyCountChanged'))
        // Turn off the needs reply filter so conversation stays visible
        if (needsReplyFilter) {
          setNeedsReplyFilter(false)
        }
      } else {
        toast.success('Message sent successfully')
      }
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

  const getSenderLabel = (message: Message) => {
    const senderType = message.sender_type || message.sender
    if (senderType === 'owner' || message.sender === 'page' || message.sender === 'human') {
      return '👨‍💼 You'
    }
    if (senderType === 'bot') {
      return '🤖 Bot'
    }
    return 'Customer'
  }

  const getSenderBgColor = (message: Message) => {
    const senderType = message.sender_type || message.sender
    // Owner messages (from dashboard or Messenger app)
    if (senderType === 'owner' || message.sender === 'page' || message.sender === 'human') {
      return 'bg-green-100 dark:bg-green-900/30 text-foreground'
    }
    // Bot messages
    if (senderType === 'bot') {
      return 'bg-blue-100 dark:bg-blue-900/30 text-foreground opacity-95'
    }
    // Customer messages
    return 'bg-gray-100 dark:bg-gray-800 text-foreground'
  }

  const isRightAligned = (message: Message) => {
    const senderType = message.sender_type || message.sender
    // Customer messages align left, everything else (bot, owner, page) aligns right
    return senderType !== 'customer' && message.sender !== 'customer'
  }

  const showMessengerBadge = (message: Message) => {
    // Show badge if owner message came from Messenger (not dashboard)
    // Dashboard messages use sender='human', Messenger app uses sender='page' with sender_type='owner'
    return message.sender_type === 'owner' && message.sender === 'page'
  }

  const getOrderIdFromContext = (context: any) => {
    try {
      if (context?.order_id) return context.order_id
      return null
    } catch {
      return null
    }
  }

  if (loading) {
    return <PremiumLoader />
  }

  return (
    <RequireFacebookPage>
      <TopBar title="Conversations" />

      {/* Global Bot Disabled Warning Banner */}
      {pageBotEnabled === false && (
        <Alert className="mx-4 mt-4 border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="font-semibold text-red-700 dark:text-red-400">⚠️ Bot is Disabled for All Conversations</span>
              <p className="text-sm text-red-600 dark:text-red-300 mt-0.5">
                You're in manual-only mode. The bot will not respond to any customer messages.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleEnableBot}
              disabled={enablingBot}
              className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap relative"
            >
              {enablingBot ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  Enabling...
                </div>
              ) : (
                <><Power className="h-4 w-4 mr-2" /> Enable Bot</>
              )}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex h-[calc(100dvh-4rem)] lg:h-[calc(100vh-4rem)] overflow-hidden">
        {/* Conversations List - Left Panel */}
        {/* Conversations List - Left Panel */}
        <div
          className={cn(
            "w-full lg:w-[350px] border-r border-zinc-200 dark:border-white/10 flex flex-col bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-xl transition-colors duration-300",
            mobileView === "chat" && "hidden lg:flex",
          )}
        >
          {/* Search and Filters - Improved Separation */}
          <div className="p-4 space-y-3 bg-white dark:bg-zinc-900/20 border-b border-zinc-200 dark:border-white/5 shadow-sm z-10">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 group-focus-within:text-zinc-600 dark:group-focus-within:text-white transition-colors" />
              <Input
                placeholder="Search chats..."
                className="pl-9 bg-zinc-50 dark:bg-black/20 border-zinc-200 dark:border-white/10 focus:border-zinc-400 dark:focus:border-white/20 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 rounded-lg h-10 transition-all shadow-inner dark:shadow-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
             <div className="flex gap-1 bg-zinc-100 dark:bg-black/20 p-1 rounded-lg border border-zinc-200 dark:border-white/5">
               {['all', 'IDLE', 'AWAITING_NAME', 'ORDER_COMPLETE'].map(status => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "flex-1 py-1.5 text-[10px] font-medium rounded-md uppercase tracking-wide transition-all",
                      statusFilter === status 
                        ? "bg-white text-zinc-900 shadow-sm border border-zinc-200 dark:bg-white/10 dark:text-white dark:shadow-sm dark:border-white/5" 
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-white/5"
                    )}
                  >
                    {status === 'all' ? 'All' : statusLabels[status] || status}
                  </button>
               ))}
            </div>
            
            {/* Control Mode Filter & Needs Reply */}
            <div className="flex gap-2">
               <div className="flex-1 flex gap-1 bg-zinc-200/50 dark:bg-black/20 p-1 rounded-lg border border-zinc-200 dark:border-white/5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                 {['all', 'bot', 'manual', 'hybrid'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setControlModeFilter(mode)}
                      className={cn(
                        "flex-1 items-center justify-center py-1.5 px-0.5 text-[9px] font-bold rounded-md uppercase tracking-tight transition-all whitespace-nowrap",
                        controlModeFilter === mode 
                          ? "bg-white text-zinc-900 shadow-sm border border-zinc-200 dark:bg-white/10 dark:text-white dark:border-white/5" 
                          : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-white/5"
                      )}
                    >
                      {mode === 'all' ? 'All' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                 ))}
               </div>

                <Button
                  variant={needsReplyFilter ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNeedsReplyFilter(!needsReplyFilter)}
                  className={cn(
                    "flex-shrink-0 px-3 h-9 border-none font-bold text-xs tracking-wide transition-all",
                    needsReplyFilter 
                      ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20" 
                      : "bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20 dark:hover:bg-orange-500/20"
                  )}
                >
                  <span className="hidden sm:inline">Needs Reply</span>
                  <span className="sm:hidden">Reply</span>
                  {needsReplyCount > 0 && (
                    <span className={cn(
                      "ml-1.5 px-1.5 py-0.5 text-[9px] rounded-full font-bold",
                      needsReplyFilter ? "bg-white/20 text-white" : "bg-orange-200 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400"
                    )}>
                      {needsReplyCount}
                    </span>
                  )}
                </Button>
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center h-full opacity-50">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center mb-4">
                   <Search className="w-6 h-6 text-zinc-400 dark:text-white/20" />
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">No conversations found</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1 max-w-[200px]">
                  Adjust filters or wait for new messages
                </p>
              </div>
            ) : (
              <div>
                {conversations
                  .filter(conv => controlModeFilter === 'all' || (conv.control_mode || 'bot') === controlModeFilter)
                  .map((conv) => {
                    const badge = getControlModeBadge(conv)
                    const isSelected = selectedConversation?.id === conv.id;
                    return (
                        <button
                          key={conv.id}
                          onClick={() => handleSelectConversation(conv)}
                          className={cn(
                            "w-full p-3 text-left transition-all duration-300 rounded-xl border group relative overflow-hidden cursor-pointer",
                            isSelected 
                              ? "bg-white border-zinc-200/60 shadow-[0_2px_12px_rgba(0,0,0,0.08)] dark:bg-white/10 dark:border-white/10 dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)]" 
                              : "bg-transparent border-transparent hover:bg-white hover:border-zinc-200/50 hover:shadow-sm dark:hover:bg-white/5 dark:hover:border-white/5"
                          )}
                        >
                         {/* Selection Glow Indicator - Refined for Light Mode */}
                         {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-900 shadow-[0_0_10px_rgba(0,0,0,0.2)] dark:bg-white dark:shadow-[0_0_10px_white]" />}

                        <div className="flex items-start gap-3 pl-2">
                          <div className="relative">
                            <Avatar className={cn("h-12 w-12 border shadow-sm transition-all duration-300", isSelected ? "border-zinc-300 dark:border-white/20 scale-105" : "border-zinc-100 dark:border-white/5")}>
                              <AvatarImage src={conv.customer_profile_pic_url || undefined} alt={conv.customer_name} />
                              <AvatarFallback className="bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 text-xs font-bold">
                                {(conv.customer_name || 'U').substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {/* Status Dot */}
                            <div className={cn(
                                "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#121212]",
                                statusIndicator[conv.current_state] || "bg-zinc-500"
                            )} />
                          </div>

                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className={cn("font-bold text-sm truncate", isSelected ? "text-zinc-900 dark:text-white" : "text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white")}>
                                {conv.customer_name || "Unknown Customer"}
                              </span>
                              <span className={cn("text-[10px] whitespace-nowrap font-medium", isSelected ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-400 dark:text-zinc-600")}>
                                {formatTime(conv.last_message_at)}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className={cn("text-xs truncate max-w-[140px]", isSelected ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-500")}>
                                {conv.last_message?.sender === 'page' || conv.last_message?.sender_type === 'bot' ? 'You: ' : ''}
                                {conv.last_message?.message_text || "No messages"}
                              </p>
                              
                              {/* Control Mode Mini Badge */}
                              <span className={cn(
                                  "ml-auto text-[9px] px-1.5 py-[1px] rounded flex-shrink-0 uppercase tracking-wider font-bold border",
                                  badge.className.replace('bg-', 'bg-transparent text-').replace('border-', 'border-')
                                )}>
                                  {badge.label.split(' ')[0]}
                              </span>
                            </div>

                            {/* Alert Indicators - Only show if not in Bot/Hybrid mode */}
                            {conv.control_mode !== 'bot' && conv.control_mode !== 'hybrid' && (badge.needsAttention || conv.needs_manual_response) && (
                              <div className="flex items-center gap-1 mt-1.5 animate-pulse">
                                <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 border",
                                    isSelected 
                                    ? "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/20 dark:text-orange-200 dark:border-orange-500/30" 
                                    : "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20"
                                )}>
                                   <AlertTriangle className="w-2.5 h-2.5" /> Action Required
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Chat Panel - Right Panel */}
        <div className={cn("flex-1 flex flex-col bg-zinc-50/50 dark:bg-[#050505] h-full overflow-hidden relative", mobileView === "list" && "hidden lg:flex")}>
          {selectedConversation ? (
            <>
              {/* Background Gradient Effect */}
              <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03] dark:opacity-[0.02]" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-white/0 dark:from-zinc-900/10 dark:to-black pointer-events-none" />

              {/* Chat Header */}
              <div className="p-2 sm:p-4 flex items-center gap-2 sm:gap-4 shrink-0 z-10 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200 dark:border-white/5 shadow-sm transition-all duration-300">
                <Button variant="ghost" size="icon" className="lg:hidden text-zinc-500 dark:text-zinc-400 h-8 w-8" onClick={() => setMobileView("list")}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                
                <div className="relative">
                  <Avatar className="h-8 w-8 border border-zinc-200 dark:border-white/10 shadow-inner">
                    <AvatarImage 
                      src={selectedConversation.customer_profile_pic_url || undefined} 
                      alt={selectedConversation.customer_name} 
                    />
                    <AvatarFallback className="bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold">
                      {(selectedConversation.customer_name || 'U').substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn(
                      "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white dark:border-[#121212]",
                      statusIndicator[selectedConversation.current_state] || "bg-zinc-500"
                  )} />
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <h3 className="font-bold text-base text-zinc-900 dark:text-white tracking-tight truncate max-w-[150px]">
                    {selectedConversation.customer_name || "Unknown"}
                  </h3>
                  
                  {/* Bot Mode Selector - Compact Version */}
                  <Select
                    value={selectedConversation.control_mode || 'bot'}
                    onValueChange={async (mode) => {
                      try {
                        const res = await fetch(`/api/conversations/${selectedConversation.id}/control-mode`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ control_mode: mode }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setSelectedConversation(prev => {
                            if (!prev) return prev
                            const isClearingFlag = mode === 'bot' || mode === 'hybrid'
                            return {
                              ...prev,
                              control_mode: mode,
                              last_manual_reply_at: mode === 'bot' ? null : prev.last_manual_reply_at,
                              needs_manual_response: isClearingFlag ? false : prev.needs_manual_response,
                              manual_flag_reason: isClearingFlag ? null : prev.manual_flag_reason,
                            }
                          })

                          setConversations(prev => prev.map(conv => {
                            if (conv.id === selectedConversation.id) {
                              const isClearingFlag = mode === 'bot' || mode === 'hybrid'
                              return {
                                ...conv,
                                control_mode: mode,
                                needs_manual_response: isClearingFlag ? false : conv.needs_manual_response,
                                manual_flag_reason: isClearingFlag ? null : conv.manual_flag_reason,
                              }
                            }
                            return conv
                          }))

                          if (mode === 'bot' || mode === 'hybrid') {
                            window.dispatchEvent(new CustomEvent('needsReplyCountChanged'))
                          }
                          toast.success(`Mode: ${mode.toUpperCase()}`);
                        }
                      } catch (e) { toast.error("Failed to update mode"); }
                    }}
                  >
                    <SelectTrigger className="h-6 w-auto border-none bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 px-2 py-0 text-[10px] font-black uppercase tracking-tighter transition-all rounded-md focus:ring-0">
                       <div className="flex items-center gap-1">
                          {selectedConversation.control_mode === 'manual' ? <User className="h-2.5 w-2.5 text-orange-500" /> : <Bot className="h-2.5 w-2.5 text-green-500" />}
                          <SelectValue placeholder="Mode" />
                       </div>
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-white/10">
                      <SelectItem value="bot"><div className="flex items-center gap-2 text-xs"><Bot className="h-3 w-3 text-green-500" /> AI Bot</div></SelectItem>
                      <SelectItem value="manual"><div className="flex items-center gap-2 text-xs"><User className="h-3 w-3 text-orange-500" /> Manual</div></SelectItem>
                      <SelectItem value="hybrid"><div className="flex items-center gap-2 text-xs"><RefreshCw className="h-3 w-3 text-blue-500" /> Hybrid</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {getOrderIdFromContext(selectedConversation.context) && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 dark:hover:bg-emerald-500/20"
                    onClick={() => router.push(`/dashboard/orders`)}
                  >
                    <ExternalLink className="h-3 w-3 mr-2" />
                    View Order
                  </Button>
                )}
                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors h-8 w-8"
                    onClick={() => setDeleteDialogOpen(true)}
                    title="Delete conversation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the conversation with <strong>{selectedConversation.customer_name}</strong> and all its messages. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDeleteConversation}
                        disabled={deleting}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        {deleting ? 'Deleting...' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {/* Manual Flag Banner */}
              {selectedConversation.needs_manual_response && (
                <Alert className="mx-4 mt-2 border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800">
                  <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-500" />
                  <AlertDescription className="text-sm">
                    <span className="font-semibold text-orange-800 dark:text-orange-400">
                      🔴 AI Flagged This Conversation
                    </span>
                    <p className="text-orange-700 dark:text-orange-300 mt-0.5">
                      {selectedConversation.manual_flag_reason || 'The AI could not answer this question. Please reply manually.'}
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {/* Control Panel */}

              {/* Messages Container */}
              <div 
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto p-4 scrollbar-hide relative"
                style={{ scrollBehavior: isDragging ? 'auto' : 'smooth' }}
              >
                {/* Custom Scrollbar Rail & Thumb */}
                <div className="absolute right-1 top-0 bottom-0 w-1.5 z-40 group/scrollbar">
                  <div 
                    className={cn(
                      "absolute right-0 w-1.5 rounded-full bg-zinc-300/50 dark:bg-zinc-700/50 transition-opacity duration-300 cursor-grab active:cursor-grabbing",
                      isDragging ? "opacity-100 w-2" : "opacity-0 group-hover/scrollbar:opacity-100"
                    )}
                    style={{ 
                      top: `${thumbTop}px`, 
                      height: `${thumbHeight}px` 
                    }}
                    onMouseDown={handleThumbMouseDown}
                  />
                </div>
                
                {detailLoading ? (
                  <div className="flex flex-col items-center justify-center h-full w-full py-20">
                     <div className="relative h-16 w-16">
                        <div className="absolute inset-0 rounded-full border-4 border-zinc-100 dark:border-white/5" />
                        <div className="absolute inset-0 rounded-full border-4 border-zinc-900 dark:border-white border-t-transparent animate-spin" />
                     </div>
                     <p className="mt-4 text-xs font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest animate-pulse">
                        Syncing Messages...
                     </p>
                  </div>
                ) : (
                  <div className="flex flex-col justify-end min-h-full pb-44 sm:pb-32">
                    <div className="space-y-1">
                      {selectedConversation.messages && selectedConversation.messages.length > 0 ? (
                        groupMessages(selectedConversation.messages).map((message) => {
                          const isRight = isRightAligned(message);
                          const senderLabel = getSenderLabel(message);
                          const isBot = senderLabel.includes("Bot");
                          const isOwner = senderLabel.includes("You");
                          
                          // Corner logic for grouping
                          const bubbleCorners = cn(
                            "rounded-2xl",
                            isRight ? (
                              message.isFirst ? "rounded-br-sm" :
                              message.isMiddle ? "rounded-tr-sm rounded-br-sm" :
                              message.isLast ? "rounded-tr-sm" :
                              ""
                            ) : (
                              message.isFirst ? "rounded-bl-sm" :
                              message.isMiddle ? "rounded-tl-sm rounded-bl-sm" :
                              message.isLast ? "rounded-tl-sm" :
                              ""
                            )
                          );

                          return (
                          <div
                            key={message.id}
                            className={cn("flex flex-col group", isRight ? "items-end" : "items-start", message.isMiddle || message.isLast ? "mt-0.5" : "mt-4")}
                          >
                            {(message.isFirst || message.isSingle) && (
                              <div className={cn("flex items-center gap-2 mb-1 px-1 opacity-60 group-hover:opacity-100 transition-opacity", isRight ? "flex-row-reverse" : "")}>
                                <span className={cn("text-[10px] font-bold tracking-wider uppercase", isRight ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-500")}>
                                  {isBot ? '🤖 AI Assistant' : isOwner ? '👨‍💼 You' : selectedConversation.customer_name}
                                </span>
                                <span className="text-[9px] text-zinc-400 dark:text-zinc-600">
                                  {formatMessageTime(message.created_at)}
                                </span>
                                {showMessengerBadge(message) && (
                                  <span className="text-[9px] bg-[#0084FF]/10 text-[#0084FF] px-1.5 py-[1px] rounded flex items-center gap-1 font-bold">
                                    Messenger
                                  </span>
                                )}
                              </div>
                            )}
                            
                            <div
                              className={cn(
                                "max-w-[75%] px-4 py-2.5 shadow-sm text-sm relative transition-all duration-200",
                                bubbleCorners,
                                // Style Logic Refined for Messenger Look:
                                isBot ? 
                                  "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-white/10 shadow-sm" : 
                                isOwner ? 
                                  "bg-[#0084FF] text-white border-none shadow-md" :
                                  "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-none backdrop-blur-md"
                              )}
                            >
                               {/* Render image from image_url column (if not already in attachments) */}
                               {(message as any).image_url && (!message.attachments || !Array.isArray(message.attachments) || !message.attachments.some((a: any) => a.payload?.url === (message as any).image_url)) && (
                                 <div className="mb-2 overflow-hidden rounded-lg">
                                   <a 
                                      href={(message as any).image_url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="block group/img"
                                    >
                                      <img 
                                        src={(message as any).image_url} 
                                        alt="Attachment"
                                        className="max-w-full max-h-64 object-contain transition-transform duration-500 group-hover/img:scale-105"
                                      />
                                    </a>
                                 </div>
                               )}

                               {/* Render image attachments */}
                               {message.attachments && Array.isArray(message.attachments) && message.attachments.length > 0 && (
                                 <div className="space-y-2 mb-2">
                                   {message.attachments
                                     .filter((att: any) => att.type === 'image' && att.payload?.url)
                                     .map((att: any, idx: number) => (
                                       <a 
                                         key={idx} 
                                         href={att.payload.url} 
                                         target="_blank" 
                                         rel="noopener noreferrer"
                                         className="block group/img overflow-hidden rounded-lg"
                                       >
                                         <img 
                                           src={att.payload.url} 
                                           alt={`Attachment ${idx + 1}`}
                                           className="max-w-full max-h-64 object-contain transition-transform duration-500 group-hover/img:scale-105"
                                           onError={(e) => {
                                             (e.target as HTMLImageElement).style.display = 'none'
                                           }}
                                         />
                                       </a>
                                     ))
                                   }
                                   
                                   {/* Render audio attachments */}
                                   {message.attachments
                                     .filter((att: any) => att.type === 'audio' && att.payload?.url)
                                     .map((att: any, idx: number) => (
                                       <div key={idx} className="bg-black/5 dark:bg-white/5 p-2 rounded-lg flex flex-col gap-1">
                                         <span className="text-[10px] font-bold opacity-60">🎤 VOICE MESSAGE</span>
                                         <audio src={att.payload.url} controls className="h-8 w-full max-w-[240px]" />
                                       </div>
                                     ))
                                   }
                                 </div>
                               )}

                               {/* Render generic templates (Carousels/Cards) */}
                               {message.attachments && Array.isArray(message.attachments) && message.attachments.some((att: any) => att.type === 'template' && att.payload?.template_type === 'generic') && (
                                 <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-hide snap-x w-full max-w-[300px] sm:max-w-md">
                                   {message.attachments
                                     .filter((att: any) => att.type === 'template' && att.payload?.template_type === 'generic')
                                     .flatMap((att: any) => att.payload.elements || [])
                                     .map((el: any, idx: number) => (
                                       <div key={idx} className="min-w-[180px] max-w-[180px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl overflow-hidden snap-start shadow-sm flex flex-col">
                                         {el.image_url && (
                                           <div className="relative h-28 w-full bg-zinc-100 dark:bg-white/5">
                                             <img src={el.image_url} alt={el.title} className="w-full h-full object-cover" />
                                           </div>
                                         )}
                                         <div className="p-3 flex-1 flex flex-col">
                                           <h4 className="font-bold text-xs line-clamp-1 mb-1">{el.title}</h4>
                                           {el.subtitle && <p className="text-[10px] text-zinc-500 line-clamp-2 leading-tight">{el.subtitle}</p>}
                                           {el.buttons && Array.isArray(el.buttons) && el.buttons.length > 0 && (
                                             <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-white/5 space-y-1">
                                               {el.buttons.map((btn: any, bIdx: number) => (
                                                 <div key={bIdx} className="text-[9px] font-bold text-center py-1 rounded bg-zinc-50 dark:bg-white/5 text-zinc-600 dark:text-zinc-400">
                                                   {btn.title}
                                                 </div>
                                               ))}
                                             </div>
                                           )}
                                         </div>
                                       </div>
                                     ))
                                   }
                                 </div>
                               )}
                              
                              {/* Render text message */}
                              {message.message_text && (
                                <p className={cn("leading-relaxed whitespace-pre-line text-[15px]", isBot ? "font-normal" : "font-normal")}>
                                  {message.message_text}
                                </p>
                              )}
                              
                              {/* Status Indicators for Send */}
                              {message.id.startsWith('temp-') && (
                                <span className="absolute bottom-1 right-2 w-2 h-2 rounded-full border-2 border-current border-t-transparent animate-spin opacity-50" />
                              )}
                            </div>
                          </div>
                        )})
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 opacity-40">
                          <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-white/5 flex items-center justify-center mb-4">
                             <div className="w-3 h-3 bg-zinc-300 dark:bg-white rounded-full animate-bounce" />
                          </div>
                          <p className="text-zinc-500 text-sm">No messages yet. Start the conversation!</p>
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

                {/* Scroll to Bottom Button */}
                {showScrollButton && (
                  <Button
                    size="icon"
                    className="fixed bottom-32 right-8 z-30 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black shadow-xl animate-bounce"
                    onClick={() => {
                      scrollToBottom()
                      setShowScrollButton(false)
                    }}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </Button>
                )}
              </div>

              {/* Chat Input - Floating Capsule (Fixed at bottom, above mobile nav) */}
              <div className="p-4 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-black dark:via-black/80 dark:to-transparent absolute bottom-16 lg:bottom-0 left-0 right-0 z-20">
                <div className="max-w-3xl mx-auto bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-200 dark:border-white/10 rounded-full p-2 shadow-2xl shadow-zinc-200/50 dark:shadow-black/50 flex items-center gap-2 relative">
                   <form onSubmit={handleSendMessage} className="flex-1 flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="flex-1 bg-transparent border-none text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0 px-4 h-10"
                      disabled={sendingMessage}
                      autoComplete="off"
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
                      className={cn(
                        "h-10 w-10 rounded-full transition-all duration-300 shadow-md",
                        newMessage.trim() 
                          ? "bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-black dark:hover:bg-white/90 scale-100" 
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 scale-90"
                      )}
                      disabled={sendingMessage || !newMessage.trim()}
                    >
                      {sendingMessage ? (
                        <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </form>
                </div>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-600 text-center mt-2 opacity-70">
                   Press Enter to send via Messenger
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground bg-white dark:bg-[#050505]">
              {loading ? (
                <div className="relative h-12 w-full">
                  <PremiumLoader className="bg-transparent" />
                </div>
              ) : (
                "Select a conversation to view messages"
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reset State Confirmation Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Reset Conversation?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              This will clear:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>🛒 Cart items</li>
                <li>👤 Customer name</li>
                <li>📱 Phone number</li>
                <li>📍 Address</li>
              </ul>
              <p className="mt-3 font-medium">
                The customer will need to start their order from scratch.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingState(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setResetDialogOpen(false)
                if (pendingState) executeStateChange(pendingState)
              }}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Reset to Idle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RequireFacebookPage>
  )
}
