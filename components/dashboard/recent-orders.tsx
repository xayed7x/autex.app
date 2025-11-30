"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bell } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

type OrderStatus = "pending" | "processing" | "completed" | "cancelled"

interface RecentOrder {
  id: string
  orderNumber: string
  customer: string
  product: string
  amount: number
  status: string
  date: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
}

export function RecentOrders() {
  const [orders, setOrders] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecentOrders()
  }, [])

  const fetchRecentOrders = async () => {
    try {
      const response = await fetch('/api/dashboard/recent-orders?limit=5')
      if (response.ok) {
        const data = await response.json()
        setOrders(data.recentOrders || [])
      }
    } catch (error) {
      console.error('Failed to fetch recent orders:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-card border border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-semibold">Recent Orders</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">No orders yet</div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 text-xs font-medium text-muted-foreground">Order ID</th>
                    <th className="pb-3 text-xs font-medium text-muted-foreground">Customer</th>
                    <th className="pb-3 text-xs font-medium text-muted-foreground">Product</th>
                    <th className="pb-3 text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="pb-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="pb-3 text-xs font-medium text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {orders.map((order) => (
                    <tr key={order.id} className="group">
                      <td className="py-3">
                        <Link
                          href={`/dashboard/orders`}
                          className="font-mono text-sm text-primary hover:underline"
                        >
                          #{order.orderNumber}
                        </Link>
                      </td>
                      <td className="py-3">
                        <p className="font-medium text-sm">{order.customer}</p>
                      </td>
                      <td className="py-3 text-sm">{order.product}</td>
                      <td className="py-3 font-mono text-sm font-semibold">৳{order.amount.toLocaleString()}</td>
                      <td className="py-3">
                        <Badge 
                          variant="secondary" 
                          className={cn("text-xs", statusConfig[order.status]?.className || statusConfig.pending.className)}
                        >
                          {statusConfig[order.status]?.label || order.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(order.date), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <Link href={`/dashboard/orders`} className="font-mono text-sm text-primary hover:underline">
                      #{order.orderNumber}
                    </Link>
                    <Badge 
                      variant="secondary" 
                      className={cn("text-xs", statusConfig[order.status]?.className || statusConfig.pending.className)}
                    >
                      {statusConfig[order.status]?.label || order.status}
                    </Badge>
                  </div>
                  <p className="font-medium text-sm">{order.customer}</p>
                  <p className="text-xs text-muted-foreground mb-2">{order.product}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold">৳{order.amount.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(order.date), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <Link href="/dashboard/orders" className="inline-flex items-center text-sm text-primary hover:underline mt-4">
          View All Orders →
        </Link>
      </CardContent>
    </Card>
  )
}
