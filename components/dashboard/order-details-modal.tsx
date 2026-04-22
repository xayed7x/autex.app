"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { User, Package, CreditCard, FileText, MessageSquare, Printer, X, Check, Send, ExternalLink } from "lucide-react"
import { toast } from "sonner"

type OrderStatus = "pending" | "shipped" | "cancelled" | "processing" | "completed"

interface OrderItem {
  id: string
  product_id: string
  product_name: string
  product_price: number
  quantity: number
  subtotal: number
  selected_size?: string
  selected_color?: string
  product_image_url?: string
}

interface Order {
  id: string
  order_number?: string
  customer_name?: string
  customer_phone?: string
  customer_address?: string
  product_id?: string
  product_details?: any
  product_price?: number
  product_image_url?: string
  product_variations?: any
  delivery_charge?: number
  total_amount?: number
  quantity?: number
  status: OrderStatus
  payment_status?: string
  created_at?: string
  updated_at?: string
  conversation_id?: string
  // Joined product data from API
  products?: {
    name: string
    image_urls?: string[]
  }
  // Multi-item order support
  order_items?: OrderItem[]
  payment_last_two_digits?: string
  // NEW: Direct size/color fields
  selected_size?: string
  selected_color?: string
  delivery_date?: string
  delivery_time?: string
  flavor?: string
  delivery_zone?: string
  customer_description?: string
  inspiration_image?: string
  staff_note?: string
  // Legacy fields for backward compatibility
  customer?: {
    name: string
    phone: string
    location: string
  }
  amount?: number
  timeAgo?: string
  paymentVerified?: boolean
}

interface OrderDetailsModalProps {
  order: Order | null
  open: boolean
  onClose: () => void
}

const statusConfig: Record<OrderStatus, { label: string; className: string }> = {
  pending: {
    label: "Pending Payment",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  shipped: { label: "Shipped", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
}

export function OrderDetailsModal({ order, open, onClose }: OrderDetailsModalProps) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (order) {
      setNote(order.staff_note || "")
    }
  }, [order, open])

  if (!order) return null

  // Get product name from joined data
  const productName = order.products?.name || 'Unknown Product'
  
  // Handle navigation to conversation
  const handleViewChat = () => {
    console.log('🔘 View Chat History clicked!')
    console.log('Conversation ID:', order.conversation_id)
    
    if (order.conversation_id) {
      console.log('✅ Navigating to:', `/dashboard/conversations?id=${order.conversation_id}`)
      router.push(`/dashboard/conversations?id=${order.conversation_id}`)
      onClose() // Close modal after navigation
    } else {
      console.log('❌ No conversation_id found')
    }
  }
  
  // Handle order status update
  const updateOrderStatus = async (id: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      
      if (response.ok) {
        toast.success(`Order status updated to ${newStatus}`)
        onClose()
        window.location.reload()
      } else {
        toast.error('Failed to update order')
      }
    } catch (error) {
      console.error('Error updating order:', error)
      toast.error('Failed to update order')
    }
  }

  const handleConfirmOrder = () => updateOrderStatus(order.id, 'completed')

  const handleSaveNote = async () => {
    if (!order) return
    setIsSaving(true)
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_note: note }),
      })
      if (response.ok) {
        toast.success("Internal note saved")
      } else {
        toast.error("Failed to save note")
      }
    } catch (error) {
      console.error("Save note error:", error)
      toast.error("Failed to save note")
    } finally {
      setIsSaving(false)
    }
  }

  // Handle both legacy and new data formats
  const customerName = order.customer_name || order.customer?.name || 'N/A'
  const customerPhone = order.customer_phone || order.customer?.phone || 'N/A'
  const customerAddress = order.customer_address || order.customer?.location || 'N/A'
  const deliveryCharge = order.delivery_charge || 60
  const totalAmount = order.total_amount || order.amount || 0
  const subtotal = totalAmount - deliveryCharge
  const orderNumber = order.order_number || order.id.substring(0, 8)
  const paymentVerified = order.payment_status === 'paid' || order.paymentVerified || false

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl">
        {/* Premium Header - Glass Strip */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-background/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-serif text-xl tracking-wide">Order #{orderNumber}</DialogTitle>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {order.created_at ? new Date(order.created_at).toLocaleString() : order.timeAgo || 'N/A'}
              </p>
            </div>
          </div>
          <Badge 
            variant="secondary" 
            className={cn(
              "text-xs px-3 py-1 font-bold uppercase tracking-wider shadow-none border", 
              statusConfig[order.status].className
            )}
          >
            {statusConfig[order.status].label}
          </Badge>
        </div>

        <div className="p-6 space-y-6 max-w-xl mx-auto">
          {/* Main Layout Stack */}
          <div className="space-y-6">
            
            {/* Customer Information (Moved to top as per user request flow) */}
             <div className="rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer</span>
                </div>
                <div className="p-4 space-y-4">
                    <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="text-sm font-medium">{customerName}</p>
                    </div>
                     <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="text-sm font-mono text-blue-400">{customerPhone}</p>
                    </div>
                     <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Address</p>
                         <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-sm font-medium text-foreground leading-relaxed shadow-sm">
                            {customerAddress}
                        </div>
                    </div>
                </div>
            </div>

            {/* Order Items Section */}
            <div className="space-y-6">
              {/* Order Items Section */}
              <div className="rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</span>
                </div>
                <div className="p-4 space-y-4">
                    {order.order_items && order.order_items.length > 0 ? (
                        <div className="space-y-4">
                            {order.order_items.map((item, idx) => (
                                <div key={item.id || idx} className="flex gap-4 items-start">
                                    <div className="h-16 w-16 rounded-lg bg-black/40 border border-white/5 overflow-hidden shrink-0">
                                        {item.product_image_url ? (
                                            <img src={item.product_image_url} alt={item.product_name} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center text-xl">📦</div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-foreground truncate">{item.product_name}</p>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {item.selected_size && (
                                                <Badge variant="outline" className="text-[10px] h-5 border-white/10 bg-white/5 text-muted-foreground">
                                                    Size: {item.selected_size}
                                                </Badge>
                                            )}
                                            {item.selected_color && (
                                                <Badge variant="outline" className="text-[10px] h-5 border-white/10 bg-white/5 text-muted-foreground">
                                                    Color: {item.selected_color}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-mono text-sm font-semibold">৳{item.product_price?.toLocaleString()}</p>
                                        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* Legacy Single Item Display */
                        <div className="flex gap-4 items-start">
                             <div className="h-16 w-16 rounded-lg bg-black/40 border border-white/5 overflow-hidden shrink-0">
                                {(order.product_image_url || order.products?.image_urls?.[0]) ? (
                                    <img src={order.product_image_url || order.products?.image_urls?.[0]} alt={productName} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-xl">📦</div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-foreground truncate">{productName}</p>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {(order.selected_size || order.product_variations?.size) && (
                                         <Badge variant="outline" className="text-[10px] h-5 border-white/10 bg-white/5 text-muted-foreground">
                                            Size: {order.selected_size || order.product_variations?.size}
                                        </Badge>
                                    )}
                                    {(order.selected_color || order.product_variations?.color) && (
                                        <Badge variant="outline" className="text-[10px] h-5 border-white/10 bg-white/5 text-muted-foreground">
                                            Color: {order.selected_color || order.product_variations?.color}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                             <div className="text-right">
                                 <p className="font-mono text-sm font-semibold">৳{order.product_price?.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">Qty: {order.quantity || 1}</p>
                            </div>
                        </div>
                    )}

                    {/* Food Business Specific Fields: Cake Order Details Aesthetic */}
                    {(order.delivery_date || order.flavor || order.custom_message || order.delivery_zone || order.customer_description || order.inspiration_image) && (
                        <div className="mt-6 pt-6 border-t border-white/10 space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">Cake Specifications</span>
                                </div>
                                {order.delivery_date && (
                                    <Badge variant="outline" className="text-[10px] font-mono border-primary/20 bg-primary/20 text-primary py-0.5 px-2 rounded-full backdrop-blur-sm">
                                        📅 {(() => {
                                            const parts = order.delivery_date.split('/');
                                            if (parts.length === 3) {
                                                const day = parts[0];
                                                const monthIndex = parseInt(parts[1]) - 1;
                                                const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                                                return `${day} ${months[monthIndex] || parts[1]}`;
                                            }
                                            return order.delivery_date;
                                        })()} {order.delivery_time ? `| 🕒 ${order.delivery_time}` : ''}
                                    </Badge>
                                )}
                            </div>
                            
                            {/* Primary Info Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white/[0.03] rounded-xl border border-white/5 p-3 space-y-1">
                                    <p className="text-[9px] text-muted-foreground uppercase tracking-tight">Flavor / Type</p>
                                    <p className="text-sm font-semibold text-foreground">{order.flavor || productName}</p>
                                </div>
                                <div className="bg-white/[0.03] rounded-xl border border-white/5 p-3 space-y-1">
                                    <p className="text-[9px] text-muted-foreground uppercase tracking-tight">Delivery Zone</p>
                                    <p className="text-sm font-semibold text-foreground">{order.delivery_zone || 'Not Specified'}</p>
                                </div>
                                <div className="bg-white/[0.03] rounded-xl border border-white/5 p-3 space-y-1 group hover:border-primary/30 transition-colors cursor-default">
                                    <p className="text-[9px] text-muted-foreground uppercase tracking-tight">Delivery Date</p>
                                    <p className="text-sm font-bold text-primary flex items-center gap-1.5">
                                        {(() => {
                                            const parts = order.delivery_date?.split('/');
                                            if (parts && parts.length === 3) {
                                                const day = parts[0];
                                                const monthIndex = parseInt(parts[1]) - 1;
                                                const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                                                return `${day} ${months[monthIndex] || parts[1]}`;
                                            }
                                            return order.delivery_date || 'TBD';
                                        })()}
                                    </p>
                                </div>
                                {order.delivery_time && (
                                    <div className="bg-white/[0.03] rounded-xl border border-white/5 p-3 space-y-1">
                                        <p className="text-[9px] text-muted-foreground uppercase tracking-tight">Delivery Time</p>
                                        <p className="text-sm font-semibold text-primary/80">{order.delivery_time}</p>
                                    </div>
                                )}
                            </div>

                            {/* Inscription / Message - The Most Important Part */}
                            <div className="space-y-2">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest ml-1">✍️ Design & Inscription</p>
                                <div className="relative group">
                                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-primary/0 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
                                    <div className="relative p-5 rounded-2xl bg-black/40 border border-white/10 shadow-2xl overflow-hidden">
                                        {/* Subtle pattern background */}
                                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                            <FileText className="h-16 w-16" />
                                        </div>
                                        
                                        <div className="space-y-4">
                                            {order.customer_description && (
                                                <div className="space-y-1">
                                                    <p className="text-[10px] text-primary/60 font-bold uppercase tracking-tighter">Design Vision</p>
                                                    <p className="text-sm leading-relaxed text-zinc-300">{order.customer_description}</p>
                                                </div>
                                            )}
                                            
                                            <div className="space-y-1 pt-2 border-t border-white/5">
                                                <p className="text-[10px] text-primary font-bold uppercase tracking-tighter">Inscribed Message</p>
                                                <p className="text-lg font-serif italic text-white tracking-wide">
                                                    {order.custom_message ? `"${order.custom_message}"` : "None"}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
 
                            {/* Staff Note / Internal Memo - The NEW Feature */}
                            <div className="space-y-3 pt-4 border-t border-white/10">
                                <div className="flex items-center justify-between ml-1">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                        <FileText className="h-3 w-3" />
                                        Internal Memo (Private)
                                    </p>
                                    <Button 
                                        size="sm" 
                                        type="button"
                                        className="h-8 px-4 text-[11px] font-bold bg-white text-zinc-950 hover:bg-white/90 shadow-[0_0_15px_rgba(255,255,255,0.15)] transition-all duration-200"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            handleSaveNote()
                                        }}
                                        disabled={isSaving}
                                    >
                                        {isSaving ? "Saving..." : "Save Note"}
                                    </Button>
                                </div>
                                <div className="relative group">
                                    <textarea
                                        value={note}
                                        onChange={(e) => {
                                            setNote(e.target.value)
                                            // Simple auto-expand logic
                                            e.target.style.height = 'inherit'
                                            e.target.style.height = `${e.target.scrollHeight}px`
                                        }}
                                        onBlur={handleSaveNote} // Auto-save on blur for better UX
                                        placeholder="Add private notes here (e.g., 'Customer wants to change delivery time to 4pm')..."
                                        className="w-full min-h-[120px] p-4 rounded-xl bg-white/[0.02] border border-white/10 text-sm leading-relaxed text-zinc-300 focus:outline-none focus:border-primary/50 focus:bg-primary/[0.02] transition-all resize-none shadow-inner"
                                    />
                                    <div className="absolute bottom-3 right-3 opacity-20 pointer-events-none">
                                        <Send className="h-4 w-4" />
                                    </div>
                                </div>
                            </div>

                            {/* Inspiration Image */}
                            {order.inspiration_image && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between ml-1">
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">🖼️ Reference Image</p>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-6 text-[10px] text-primary hover:bg-primary/10"
                                            onClick={() => window.open(order.inspiration_image, '_blank')}
                                        >
                                            View Full Size
                                        </Button>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02] aspect-video group relative">
                                        <img 
                                            src={order.inspiration_image} 
                                            alt="Inspiration" 
                                            className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105" 
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <ExternalLink className="h-6 w-6 text-white" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {/* Footer Totals */}
                <div className="bg-white/5 p-4 border-t border-white/5 space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Subtotal</span>
                        <span className="font-mono">৳{subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Delivery</span>
                        <span className="font-mono">৳{deliveryCharge.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-foreground pt-2 border-t border-white/5">
                        <span>Total Amount</span>
                        <span className="font-mono text-base">৳{totalAmount.toLocaleString()}</span>
                    </div>
                </div>
              </div>

               {/* Payment Info */}
               <div className="rounded-xl border border-white/5 bg-white/5 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg bg-muted text-muted-foreground", paymentVerified && "bg-emerald-500/10 text-emerald-500")}>
                          <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                          <p className="text-sm font-medium">Payment Status</p>
                          <p className={cn("text-xs", paymentVerified ? "text-emerald-500 font-medium" : "text-yellow-600 dark:text-yellow-400")}>
                              {paymentVerified ? "Verified (bKash)" : "Cash / Pending"}
                          </p>
                      </div>
                  </div>
                  {!paymentVerified && order.payment_last_two_digits && (
                       <div className="text-right">
                           <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Digits</p>
                           <div className="font-mono text-xl font-bold tracking-widest bg-black/40 px-3 py-1 rounded border border-white/10 text-primary">
                               {order.payment_last_two_digits}
                           </div>
                       </div>
                  )}
               </div>
            </div>

            {/* Quick Actions */}
             <div className="rounded-xl border border-white/5 bg-white/5 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</span>
                    </div>
                    <div className="p-4 space-y-3">
                        {order.conversation_id ? (
                            <Button 
                                className="w-full justify-start bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 shadow-none h-10"
                                onClick={() => {
                                    router.push(`/dashboard/conversations?id=${order.conversation_id}`)
                                    onClose()
                                }}
                            >
                                <MessageSquare className="h-4 w-4 mr-2" />
                                Open Chat
                            </Button>
                        ) : (
                             <Button variant="outline" disabled className="w-full justify-start opacity-50">
                                <MessageSquare className="h-4 w-4 mr-2" />
                                No Chat Linked
                            </Button>
                        )}
                        
                        <Button 
                             disabled 
                             variant="outline" 
                             className="w-full justify-start bg-transparent border-white/10 hover:bg-white/5 text-muted-foreground"
                        >
                            <Printer className="h-4 w-4 mr-2" />
                            Print Invoice
                        </Button>
                    </div>
                </div>
          </div>
        </div>

        {/* Footer Actions Bar */}
        <div className="sticky bottom-0 z-10 px-6 py-4 border-t border-white/5 bg-background/90 backdrop-blur-md flex items-center justify-between">
           <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Close
          </Button>
          
          <div className="flex gap-3">
             {order.status !== 'cancelled' && (
                <Button
                    variant="outline"
                    className="border-red-500/30 text-red-500 hover:bg-red-950/30 hover:text-red-400"
                    onClick={() => updateOrderStatus(order.id, 'cancelled')} // Note: updateOrderStatus needs to be passed in props or handled mostly here? 
                    // Wait, handleConfirmOrder is defined here, but updateOrderStatus is not fully generically defined in this component props. 
                    // I should check if I can define handleCancel here like handleConfirmOrder
                >
                    Cancel
                </Button>
             )}
             
             {order.status === 'pending' && (
                <Button 
                    className="bg-white text-zinc-950 hover:bg-white/90 shadow-[0_0_15px_rgba(255,255,255,0.15)]"
                    onClick={handleConfirmOrder}
                >
                    <Check className="h-4 w-4 mr-2" />
                    Confirm Order
                </Button>
             )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
