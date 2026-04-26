"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  User,
  Bot,
  Clock,
  DollarSign,
  ShoppingCart,
  MessageSquare,
  Loader2,
  Image as ImageIcon,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import Link from "next/link"

interface Message {
  id: string
  senderType: 'customer' | 'bot' | 'owner'
  text: string | null
  attachments: any
  imageUrl?: string | null
  createdAt: string
}

interface ConversationData {
  conversation: {
    id: string
    customerName: string
    customerPsid: string
    state: string
    createdAt: string
    lastMessageAt: string
    durationMinutes: number
    outcome: 'active' | 'ordered' | 'abandoned'
    workspaceId: string
    workspaceName: string
  }
  messages: Message[]
  order: {
    id: string
    orderNumber: string
    totalAmount: number
    status: string
    createdAt: string
  } | null
  costs: {
    total: number
    breakdown: Array<{ type: string; rawType: string; cost: number; count: number }>
    roi: string | null
    profit: number | null
  }
}

export default function ConversationDetailPage() {
  const params = useParams()
  const conversationId = params.id as string
  
  const [data, setData] = useState<ConversationData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (conversationId) {
      fetchData()
      
      // Real-time polling (every 5 seconds)
      const interval = setInterval(() => {
        fetchData(true) // Pass true for silent refresh
      }, 5000)
      
      return () => clearInterval(interval)
    }
  }, [conversationId])

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const response = await fetch(`/api/admin/conversations/${conversationId}`)
      if (!response.ok) throw new Error('Failed to fetch')
      const result = await response.json()
      setData(result)
    } catch (error) {
      console.error('Error fetching conversation:', error)
    } finally {
      setLoading(false)
    }
  }

  const getOutcomeInfo = (outcome: string) => {
    switch (outcome) {
      case 'ordered': return { emoji: '✅', text: 'Order Placed', color: 'text-green-600' }
      case 'abandoned': return { emoji: '❌', text: 'Abandoned', color: 'text-red-600' }
      default: return { emoji: '⏳', text: 'Active', color: 'text-yellow-600' }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Conversation not found</p>
      </div>
    )
  }

  const outcomeInfo = getOutcomeInfo(data.conversation.outcome)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/admin/workspaces/${data.conversation.workspaceId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Conversation with {data.conversation.customerName}</h1>
          <p className="text-muted-foreground">
            {data.conversation.workspaceName} • Started {formatDistanceToNow(new Date(data.conversation.createdAt), { addSuffix: true })}
          </p>
        </div>
        <div className={`flex items-center gap-2 ${outcomeInfo.color}`}>
          <span className="text-xl">{outcomeInfo.emoji}</span>
          <span className="font-medium">{outcomeInfo.text}</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{data.messages.length}</p>
                <p className="text-xs text-muted-foreground">Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{data.conversation.durationMinutes}m</p>
                <p className="text-xs text-muted-foreground">Duration</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">৳{data.costs.total.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {data.order && (
          <Card className="bg-green-500/10 border-green-500/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-green-600">৳{data.order.totalAmount}</p>
                  <p className="text-xs text-muted-foreground">Order #{data.order.orderNumber}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ROI Card (if order exists) */}
      {data.order && data.costs.profit !== null && (
        <Card className={data.costs.profit >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Profit from this conversation</p>
                <p className="text-sm text-muted-foreground">Revenue ৳{data.order.totalAmount} - Cost ৳{data.costs.total.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${data.costs.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ৳{data.costs.profit.toFixed(2)}
                </p>
                {data.costs.roi && (
                  <p className="text-sm text-muted-foreground">ROI: {data.costs.roi}%</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Transcript */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Chat Transcript</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[600px] overflow-y-auto">
              <div className="space-y-4">
                {data.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.senderType === 'customer' ? '' : 'flex-row-reverse'}`}
                  >
                    <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                      msg.senderType === 'customer' 
                        ? 'bg-primary/10 text-primary' 
                        : msg.senderType === 'bot' 
                          ? 'bg-green-500/10 text-green-600'
                          : 'bg-blue-500/10 text-blue-600'
                    }`}>
                      {msg.senderType === 'customer' ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>
                    <div className={`flex-1 max-w-[80%] ${msg.senderType === 'customer' ? '' : 'text-right'}`}>
                      <div className={`inline-block rounded-lg p-3 ${
                        msg.senderType === 'customer'
                          ? 'bg-muted text-left'
                          : 'bg-primary/10 text-left'
                      }`}>
                        {/* Images */}
                        {msg.imageUrl && (!msg.attachments || !Array.isArray(msg.attachments) || !msg.attachments.some((att: any) => att.payload?.url === msg.imageUrl)) && (
                          <div className="mb-2 overflow-hidden rounded-lg">
                            <img src={msg.imageUrl} alt="Attachment" className="max-w-full h-auto" />
                          </div>
                        )}
                        
                        {msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                          <div className="space-y-2 mb-2">
                            {msg.attachments
                              .filter((att: any) => att.type === 'image' && att.payload?.url)
                              .map((att: any, idx: number) => (
                                <div key={idx} className="overflow-hidden rounded-lg">
                                  <img 
                                    src={att.payload.url} 
                                    alt={`Attachment ${idx + 1}`}
                                    className="max-w-full h-auto"
                                  />
                                </div>
                              ))
                            }
                            {msg.attachments
                              .filter((att: any) => att.type === 'audio' && att.payload?.url)
                              .map((att: any, idx: number) => (
                                <div key={idx} className="bg-black/5 p-2 rounded flex items-center gap-2">
                                  <span className="text-xs">🎤 Voice Message</span>
                                  <audio src={att.payload.url} controls className="h-8 max-w-[200px]" />
                                </div>
                              ))
                            }
                          </div>
                        )}

                        {/* Text */}
                        {msg.text && (
                          <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                        )}
                        
                        {/* If no content at all */}
                        {!msg.text && !msg.imageUrl && (!msg.attachments || msg.attachments.length === 0) && (
                          <p className="text-sm italic text-muted-foreground">(empty message)</p>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(msg.createdAt), 'h:mm a')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cost Breakdown */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {data.costs.breakdown.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No API costs recorded</p>
              ) : (
                <div className="space-y-3">
                  {data.costs.breakdown.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <p className="font-medium text-sm">{item.type}</p>
                        <p className="text-xs text-muted-foreground">{item.count} calls</p>
                      </div>
                      <p className="font-mono font-medium">৳{item.cost.toFixed(2)}</p>
                    </div>
                  ))}
                  <div className="border-t pt-3 mt-3 flex items-center justify-between">
                    <p className="font-medium">Total</p>
                    <p className="font-mono font-bold">৳{data.costs.total.toFixed(2)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* State Info */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Conversation Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current State</span>
                <span className="font-mono">{data.conversation.state}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Started</span>
                <span>{format(new Date(data.conversation.createdAt), 'MMM d, h:mm a')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Last Active</span>
                <span>{format(new Date(data.conversation.lastMessageAt), 'MMM d, h:mm a')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
