"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Search,
  RefreshCw,
  Loader2,
  ChevronRight,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Conversation {
  id: string
  customerName: string
  state: string
  messageCount: number
  lastMessageAt: string
  hasOrder: boolean
}

interface WorkspaceInfo {
  id: string
  name: string
}

export default function WorkspaceConversationsPage() {
  const params = useParams()
  const workspaceId = params.id as string
  
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [outcomeFilter, setOutcomeFilter] = useState("all")

  useEffect(() => {
    if (workspaceId) {
      fetchData()
      
      // Real-time polling (every 5 seconds)
      const interval = setInterval(() => {
        fetchData(false, true) // isRefresh=false, isSilent=true
      }, 5000)
      
      return () => clearInterval(interval)
    }
  }, [workspaceId])

  const fetchData = async (isRefresh = false, isSilent = false) => {
    if (isSilent) {
      // Do nothing to UI
    } else if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const response = await fetch(`/api/admin/workspaces/${workspaceId}/conversations`)
      if (!response.ok) throw new Error('Failed to fetch')
      const data = await response.json()
      setWorkspace(data.workspace)
      setConversations(data.conversations || [])
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = conv.customerName.toLowerCase().includes(searchQuery.toLowerCase())
    
    let matchesOutcome = true
    if (outcomeFilter === 'ordered') matchesOutcome = conv.hasOrder
    else if (outcomeFilter === 'active') matchesOutcome = !conv.hasOrder && conv.state !== 'IDLE'
    else if (outcomeFilter === 'abandoned') matchesOutcome = !conv.hasOrder && conv.state === 'IDLE'

    return matchesSearch && matchesOutcome
  })

  const getOutcomeInfo = (conv: Conversation) => {
    if (conv.hasOrder) return { emoji: '✅', text: 'Order', color: 'text-green-600' }
    if (conv.state === 'IDLE') return { emoji: '❌', text: 'Abandoned', color: 'text-red-600' }
    return { emoji: '⏳', text: 'Active', color: 'text-yellow-600' }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/admin/workspaces/${workspaceId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{workspace?.name}'s Conversations</h1>
            <p className="text-muted-foreground">{conversations.length} total conversations</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="ordered">Orders</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="abandoned">Abandoned</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Conversations Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Customer</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-sm">Messages</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-sm">State</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-sm">Outcome</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-sm">Last Active</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredConversations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      No conversations found
                    </td>
                  </tr>
                ) : (
                  filteredConversations.map((conv) => {
                    const outcome = getOutcomeInfo(conv)
                    return (
                      <tr 
                        key={conv.id} 
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => window.location.href = `/admin/conversations/${conv.id}`}
                      >
                        <td className="py-3 px-4 font-medium text-sm">{conv.customerName}</td>
                        <td className="text-center py-3 px-4 font-mono text-sm">{conv.messageCount}</td>
                        <td className="text-center py-3 px-4">
                          <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                            {conv.state.slice(0, 12)}
                          </span>
                        </td>
                        <td className="text-center py-3 px-4">
                          <span className={`flex items-center justify-center gap-1 text-sm ${outcome.color}`}>
                            {outcome.emoji} {outcome.text}
                          </span>
                        </td>
                        <td className="text-center py-3 px-4 text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })}
                        </td>
                        <td className="py-3 px-2">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
