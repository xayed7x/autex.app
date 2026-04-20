"use client"

import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { User, Package, CreditCard, FileText, MessageSquare, Printer, X, Check, Send } from "lucide-react"
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
  flavor?: string
  weight?: string
  pounds_ordered?: number
  delivery_zone?: string
  order_description?: string
  inspiration_image?: string
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
                    {(order.delivery_date || order.flavor || order.weight || order.custom_message || order.pounds_ordered || order.delivery_zone || order.order_description || order.inspiration_image) && (
                        <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70">🎂 Cake Order Details</span>
                            </div>
                            
                            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                                <div className="grid grid-cols-1 divide-y divide-white/5">
                                    <div className="px-4 py-2.5 flex justify-between items-center bg-white/[0.02]">
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Product / Flavor</span>
                                        <span className="text-sm font-semibold text-primary">{order.flavor || productName}</span>
                                    </div>
                                    
                                    {order.pounds_ordered && (
                                        <div className="px-4 py-2.5 flex justify-between items-center">
                                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Weight / Pounds</span>
                                            <span className="text-sm font-mono font-medium">{order.pounds_ordered} lbs</span>
                                        </div>
                                    )}

                                    {order.delivery_zone && (
                                        <div className="px-4 py-2.5 flex justify-between items-center">
                                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Delivery Zone</span>
                                            <span className="text-sm font-medium">{order.delivery_zone}</span>
                                        </div>
                                    )}
                                    
                                    {order.delivery_date && (
                                        <div className="px-4 py-2.5 flex justify-between items-center bg-primary/5">
                                            <span className="text-[10px] text-primary/70 font-bold uppercase tracking-wider">Delivery Date</span>
                                            <span className="text-sm font-bold text-primary font-mono">{order.delivery_date}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {order.order_description && (
                                <div className="space-y-1.5">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider ml-1">📝 কাস্টমার বিবরণ</p>
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-sm leading-relaxed">
                                        {order.order_description}
                                    </div>
                                </div>
                            )}

                            {order.inspiration_image && (
                                <div className="space-y-1.5">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider ml-1">🖼️ Inspiration Image</p>
                                    <div
                                        className="rounded-xl border border-white/10 overflow-hidden bg-black/40 aspect-video flex items-center justify-center group cursor-pointer transition-all hover:border-white/20"
                                        onClick={() => window.open(order.inspiration_image, '_blank')}
                                    >
                                        <img src={order.inspiration_image} alt="Inspiration" className="max-h-full max-w-full object-contain" />
                                    </div>
                                </div>
                            )}

                            {order.custom_message && (
                                <div className="space-y-1.5">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider ml-1">✍️ কেকের লেখা (Custom Message)</p>
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-white/[0.08] to-transparent border border-white/10 text-sm font-medium italic text-zinc-200 leading-relaxed">
                                        {order.custom_message}
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
