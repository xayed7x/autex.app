"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { User, Package, CreditCard, FileText, MessageSquare, Printer, X, Check, Send } from "lucide-react"

type OrderStatus = "pending" | "confirmed" | "shipped" | "cancelled"

interface Order {
  id: string
  customer: {
    name: string
    phone: string
    location: string
  }
  products: { name: string; quantity: number }[]
  amount: number
  status: OrderStatus
  timeAgo: string
  paymentVerified: boolean
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
  shipped: { label: "Shipped", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
}

const timeline = [
  { event: "Order Created", time: "7:45 PM" },
  { event: "AI Identified Product", time: "7:46 PM" },
  { event: "Customer Confirmed", time: "7:48 PM" },
  { event: "Awaiting Payment", time: "7:50 PM" },
]

export function OrderDetailsModal({ order, open, onClose }: OrderDetailsModalProps) {
  if (!order) return null

  const deliveryCharge = 60
  const subtotal = order.amount - deliveryCharge

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="font-mono text-xl">Order #{order.id}</DialogTitle>
            <Badge variant="secondary" className={cn("text-sm px-3 py-1", statusConfig[order.status].className)}>
              {statusConfig[order.status].label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Created: Nov 29, 2025 - 7:45 PM | Source: Facebook Messenger</p>
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
                <span className="font-medium">{order.customer.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span className="font-mono">{order.customer.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Address:</span>
                <span>House 45, Road 12, {order.customer.location}, Dhaka</span>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-3 bg-transparent">
                <MessageSquare className="h-4 w-4 mr-2" />
                View Chat History
              </Button>
            </CardContent>
          </Card>

          {/* Order Items */}
          <Card className="bg-muted/30 border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4" />
                Order Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {order.products.map((product, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    IMG
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">Size: M, Color: Red</p>
                  </div>
                  <p className="font-mono">
                    ৳{(subtotal / order.products.length).toLocaleString()} x {product.quantity}
                  </p>
                </div>
              ))}
              <div className="border-t border-border pt-3 space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-mono">৳{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery Charge:</span>
                  <span className="font-mono">৳{deliveryCharge}</span>
                </div>
                <div className="flex justify-between font-semibold text-base pt-2 border-t border-border">
                  <span>Total:</span>
                  <span className="font-mono">৳{order.amount.toLocaleString()}</span>
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
                <span className={order.paymentVerified ? "text-green-600" : "text-yellow-600"}>
                  {order.paymentVerified ? "Payment Verified" : "Awaiting Payment"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method:</span>
                <span>bKash</span>
              </div>
              {!order.paymentVerified && (
                <>
                  <div className="h-24 rounded-lg bg-muted/50 border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground">
                    No screenshot uploaded yet
                  </div>
                  <Button variant="outline" size="sm" className="w-full bg-transparent">
                    <Send className="h-4 w-4 mr-2" />
                    Request Payment Screenshot
                  </Button>
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
                {timeline.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 text-sm">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span>{item.event}</span>
                    <span className="text-muted-foreground ml-auto">{item.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-border">
          {order.status === "pending" && (
            <Button>
              <Check className="h-4 w-4 mr-2" />
              Confirm Order
            </Button>
          )}
          {order.status === "confirmed" && (
            <Button>
              <Package className="h-4 w-4 mr-2" />
              Mark Shipped
            </Button>
          )}
          <Button
            variant="outline"
            className="text-destructive border-destructive/50 hover:bg-destructive/10 bg-transparent"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Add Note
          </Button>
          <Button variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Print Invoice
          </Button>
          <Button variant="outline">
            <Send className="h-4 w-4 mr-2" />
            Send Message
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
