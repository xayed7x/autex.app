"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, Loader2, Trash2, Image as ImageIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { ProductCard } from "./product-card"

interface Message {
  id: string
  sender: 'user' | 'bot'
  content: string
  imageUrl?: string
  productCard?: any
  timestamp: Date
}

interface TestChatWidgetProps {
  onClose?: () => void
}

export function TestChatWidget({ onClose }: TestChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Send initial greeting when widget loads
  useEffect(() => {
    // Add initial bot greeting
    setMessages([{
      id: '1',
      sender: 'bot',
      content: 'আসসালামু আলাইকুম! 👋\nআমি আপনার AI assistant। আপনি কোন product খুঁজছেন?',
      timestamp: new Date()
    }])
  }, [])

  const sendMessage = async (text?: string, imageUrl?: string) => {
    const messageText = text || input
    if ((!messageText.trim() && !imageUrl) || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      content: messageText,
      imageUrl: imageUrl,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/test-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageText: messageText,
          imageUrl: imageUrl,
          conversationId,
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message')
      }

      // Store conversation ID for subsequent messages
      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId)
      }

      // Add bot response
      if (data.botResponse || data.productCard) {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'bot',
          content: data.botResponse || '',
          productCard: data.productCard,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, botMessage])
      }

      // Show order confirmation if order was created
      if (data.orderCreated) {
        toast.success(`Test order created: ${data.orderNumber}`)
      }

    } catch (error) {
      console.error('Error sending message:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to send message')
      
      // Add error message to chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        content: 'দুঃখিত! কিছু একটা সমস্যা হয়েছে। 😔 আবার চেষ্টা করুন।',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handlePostback = async (payload: string, label: string) => {
    // For "Order Now", we send "YES" to trigger the confirmation flow
    if (payload.startsWith('ORDER_PRODUCT_')) {
      await sendMessage("YES")
    } else if (payload.startsWith('VIEW_DETAILS_')) {
      // For view details, we simulate a view details request
      await sendMessage("View Details")
    } else {
      await sendMessage(label)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB')
      return
    }

    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/test-bot/upload-image', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload image')
      }

      // Send message with image URL
      await sendMessage('', data.url)

    } catch (error) {
      console.error('Error uploading image:', error)
      toast.error('Failed to upload image')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([{
      id: '1',
      sender: 'bot',
      content: 'আসসালামু আলাইকুম! 👋\nআমি আপনার AI assistant। আপনি কোন product খুঁজছেন?',
      timestamp: new Date()
    }])
    setConversationId(null)
    toast.success('Chat cleared')
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b shrink-0">
        <div>
          <h3 className="font-semibold">Test Your Bot</h3>
          <p className="text-xs text-muted-foreground">
            Try your bot with current settings
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearChat}
          className="text-muted-foreground"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Clear
        </Button>
      </div>

      {/* Messages Area - Native scrolling for better reliability */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.sender === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap shadow-sm",
                message.sender === 'user'
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              )}
            >
              {message.imageUrl && (
                <img 
                  src={message.imageUrl} 
                  alt="Uploaded" 
                  className="max-w-full rounded-md mb-2 max-h-48 object-cover"
                />
              )}
              {message.productCard && (
                <div className="mb-2">
                  <ProductCard 
                    product={{
                      id: message.productCard.id,
                      name: message.productCard.name,
                      price: message.productCard.price,
                      imageUrl: message.productCard.imageUrl || message.productCard.image_urls?.[0],
                      category: message.productCard.category
                    }}
                    onOrderNow={(id) => handlePostback(`ORDER_PRODUCT_${id}`, "Order Now")}
                    onViewDetails={(id) => handlePostback(`VIEW_DETAILS_${id}`, "View Details")}
                  />
                </div>
              )}
              {message.content}
              <div
                className={cn(
                  "text-[10px] mt-1 opacity-70",
                  message.sender === 'user' ? "text-right" : "text-left"
                )}
              >
                {message.timestamp.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          </div>
        ))}
        
        {/* Typing indicator */}
        {(isLoading || isUploading) && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-2">
              <div className="flex space-x-2 items-center">
                {isUploading ? (
                  <span className="text-xs text-muted-foreground mr-2">Uploading...</span>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t shrink-0 bg-background">
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleImageUpload}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            title="Upload Image"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type a message..."
            disabled={isLoading || isUploading}
            className="flex-1 min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={(!input.trim() && !isUploading) || isLoading}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          💡 Tip: This is using your real AI settings. Orders will be marked as test.
        </p>
      </div>
    </div>
  )
}
