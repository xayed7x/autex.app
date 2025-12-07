"use client"

import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { User, Package, CreditCard, FileText, MessageSquare, Printer, X, Check, Send } from "lucide-react"
import { toast } from "sonner"

type OrderStatus = "pending" | "confirmed" | "shipped" | "cancelled" | "processing" | "completed"

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
  confirmed: { label: "Confirmed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
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
  const handleConfirmOrder = async () => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      })
      
      if (response.ok) {
        toast.success('Order confirmed successfully!')
        onClose() // Close modal
        // Refresh the page to show updated status
        window.location.reload()
      } else {
        toast.error('Failed to confirm order')
      }
    } catch (error) {
      console.error('Error confirming order:', error)
      toast.error('Failed to confirm order')
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="font-mono text-xl">Order #{orderNumber}</DialogTitle>
            <Badge variant="secondary" className={cn("text-sm px-3 py-1", statusConfig[order.status].className)}>
              {statusConfig[order.status].label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Created: {order.created_at ? new Date(order.created_at).toLocaleString() : order.timeAgo || 'N/A'} | Source: Facebook Messenger
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Customer Information */}
          <Card className="bg-muted/30 border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Customer Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span className="font-mono">{customerPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Address:</span>
                <span>{customerAddress}</span>
              </div>
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card className="bg-muted/30 border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4" />
                Order Items
                {order.order_items && order.order_items.length > 1 && (
                  <Badge variant="secondary" className="ml-2">
                    {order.order_items.length} items
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {/* Multi-item table display */}
              {order.order_items && order.order_items.length > 0 ? (
                <div className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 font-medium text-muted-foreground">Product</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Size</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Color</th>
                          <th className="text-right py-2 font-medium text-muted-foreground">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {order.order_items.map((item, idx) => (
                          <tr key={item.id || idx}>
                            <td className="py-2">
                              <div className="flex items-center gap-2">
                                {item.product_image_url ? (
                                  <img
                                    src={item.product_image_url}
                                    alt={item.product_name}
                                    className="h-8 w-8 rounded object-cover"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs">
                                    📦
                                  </div>
                                )}
                                <span className="font-medium">{item.product_name}</span>
                              </div>
                            </td>
                            <td className="py-2">{item.selected_size || '-'}</td>
                            <td className="py-2">{item.selected_color || '-'}</td>
                            <td className="py-2 text-right font-mono">
                              ৳{item.product_price?.toLocaleString()} × {item.quantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Legacy single-item display */
                <div className="flex items-center gap-3">
                  {(order.product_image_url || order.products?.image_urls?.[0]) ? (
                    <img
                      src={order.product_image_url || order.products?.image_urls?.[0]}
                      alt={productName}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      IMG
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {(order.selected_size || order.product_variations?.size) && 
                        `📏 Size: ${order.selected_size || order.product_variations.size}`}
                      {(order.selected_color || order.product_variations?.color) && 
                        `${(order.selected_size || order.product_variations?.size) ? '  •  ' : ''}🎨 Color: ${order.selected_color || order.product_variations.color}`}
                      {!order.selected_size && !order.selected_color && !order.product_variations?.size && !order.product_variations?.color && 'No variations'}
                    </p>
                  </div>
                  <p className="font-mono">
                    ৳{order.product_price?.toLocaleString() || 0} x {order.quantity || 1}
                  </p>
                </div>
              )}
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-mono">৳{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery Charge:</span>
                  <span className="font-mono">৳{deliveryCharge.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold text-base pt-2 border-t border-border">
                  <span>Total:</span>
                  <span className="font-mono">৳{totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Information */}
          <Card className="bg-muted/30 border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className={paymentVerified ? "text-green-600" : "text-yellow-600"}>
                  {paymentVerified ? "Payment Verified" : "Awaiting Payment"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method:</span>
                <span>bKash</span>
              </div>
              {!paymentVerified && (
                <>
                  <div className="rounded-lg bg-muted/50 border border-border p-4">
                    <p className="text-xs text-muted-foreground mb-2">Last 2 Digits (from customer)</p>
                    <div className="flex items-center justify-center">
                      {order.payment_last_two_digits ? (
                        <div className="bg-background border border-primary/20 text-primary font-mono text-2xl font-bold px-4 py-2 rounded-md shadow-sm">
                          {order.payment_last_two_digits}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">Not provided</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Order Timeline */}
          <Card className="bg-muted/30 border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Order Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span>Order Created</span>
                  <span className="text-muted-foreground ml-auto">
                    {order.created_at 
                      ? new Date(order.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })
                      : 'N/A'
                    }
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                  <span>Source</span>
                  <span className="text-muted-foreground ml-auto">Facebook Messenger</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-border">
          {/* Primary actions */}
          {order.status === "pending" && (
            <Button onClick={handleConfirmOrder} className="cursor-pointer">
              <Check className="h-4 w-4 mr-2" />
              Confirm Order
            </Button>
          )}
          {order.status === "confirmed" && (
            <Button className="cursor-pointer">
              <Package className="h-4 w-4 mr-2" />
              Mark Shipped
            </Button>
          )}
          <Button
            variant="outline"
            className="text-destructive border-destructive/50 hover:bg-destructive/10 bg-transparent cursor-pointer"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          
          {/* View Chat History */}
          {order.conversation_id ? (
            <button
              type="button"
              onClick={() => {
                console.log('🔘 RAW BUTTON CLICKED!')
                console.log('Conversation ID:', order.conversation_id)
                if (order.conversation_id) {
                  router.push(`/dashboard/conversations?id=${order.conversation_id}`)
                  onClose()
                }
              }}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              View Chat History
            </button>
          ) : (
            <Button variant="outline" disabled>
              <MessageSquare className="h-4 w-4 mr-2" />
              No Conversation
            </Button>
          )}
          
          {/* Full width break - forces next buttons to new line */}
          <div className="w-full" />
          
          {/* Coming Soon features - On separate line */}
          <Button variant="outline" disabled className="opacity-50 cursor-not-allowed">
            <FileText className="h-4 w-4 mr-2" />
            Add Note (Coming Soon)
          </Button>
          <Button 
            variant="outline"
            disabled
            className="opacity-50 cursor-not-allowed"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Invoice (Coming Soon)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
