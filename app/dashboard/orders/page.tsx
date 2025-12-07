"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { TopBar } from "@/components/dashboard/top-bar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import {
  Search,
  Plus,
  Download,
  MoreHorizontal,
  Eye,
  Check,
  Package,
  MessageSquare,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { OrderDetailsModal } from "@/components/dashboard/order-details-modal"
import { RequireFacebookPage } from "@/components/dashboard/require-facebook-page"

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

type OrderStatus = "pending" | "confirmed" | "shipped" | "cancelled" | "processing" | "completed"

interface Order {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  customer_address: string
  total_amount: number
  status: OrderStatus
  payment_status: string
  created_at: string
  product_id?: string
  conversation_id?: string
  order_items?: OrderItem[]
  products?: { name: string; image_urls?: string[] }
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
}

import { OrdersSkeleton } from "@/components/skeletons/orders-skeleton"

export default function OrdersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || "")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateRange, setDateRange] = useState("all")
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Update search query when URL param changes
  useEffect(() => {
    const query = searchParams.get('search')
    if (query !== null && query !== searchQuery) {
      setSearchQuery(query)
    }
  }, [searchParams])

  useEffect(() => {
    fetchOrders()
  }, [statusFilter, searchQuery, dateRange, currentPage])

  // Real-time subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('orders-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newOrder = payload.new as Order
          // Only add if it matches current filters (basic check)
          if (statusFilter === 'all' || statusFilter === newOrder.status) {
             setOrders((prev) => [newOrder, ...prev])
             setTotal((prev) => prev + 1)
          }
        } else if (payload.eventType === 'UPDATE') {
          const updatedOrder = payload.new as Order
          setOrders((prev) => prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)))
        } else if (payload.eventType === 'DELETE') {
           const deletedId = payload.old.id
           setOrders((prev) => prev.filter((order) => order.id !== deletedId))
           setTotal((prev) => prev - 1)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [statusFilter])

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        status: statusFilter,
        search: searchQuery,
        dateRange: dateRange,
      })

      const response = await fetch(`/api/orders?${params}`)
      if (response.ok) {
        const data = await response.json()
        setOrders(data.orders || [])
        setTotal(data.pagination.total)
        setTotalPages(data.pagination.totalPages)
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error)
      toast.error('Failed to load orders')
    } finally {
      setLoading(false)
    }
  }

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        toast.success(`Order status updated to ${newStatus}`)
        fetchOrders() // Refresh the list
      } else {
        toast.error('Failed to update order status')
      }
    } catch (error) {
      console.error('Failed to update order:', error)
      toast.error('Failed to update order status')
    }
  }

  if (loading) {
    return <OrdersSkeleton />
  }

  return (
    <RequireFacebookPage>
      <TopBar title="Orders" />

      <div className="p-4 lg:p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-2xl font-semibold">Orders</h2>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Manual Order
          </Button>
        </div>

        {/* Filters */}
        <Card className="bg-card border border-border shadow-sm">
          <CardContent className="p-4 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Customer Name or Phone..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1) // Reset to first page on search
                }}
              />
            </div>

            {/* Tabs and Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <Tabs value={statusFilter} onValueChange={(value) => {
                setStatusFilter(value)
                setCurrentPage(1)
              }}>
                <TabsList className="bg-muted/50">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="processing">Processing</TabsTrigger>
                  <TabsTrigger value="completed">Completed</TabsTrigger>
                  <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2">
                <Select value={dateRange} onValueChange={(value) => {
                  setDateRange(value)
                  setCurrentPage(1)
                }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last 7 days</SelectItem>
                    <SelectItem value="month">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Empty State */}
        {!loading && orders.length === 0 && (
          <Card className="bg-card border border-border shadow-sm">
            <CardContent className="p-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No orders found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || statusFilter !== 'all' 
                  ? 'Try adjusting your filters'
                  : 'Orders from your Facebook Messenger will appear here'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Orders Table - Desktop */}
        {!loading && orders.length > 0 && (
          <Card className="bg-card border border-border shadow-sm hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Order ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Address</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-4">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="font-mono text-sm text-primary hover:underline"
                          >
                            #{order.order_number || order.id.slice(0, 8)}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-sm">{order.customer_name}</p>
                          <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm max-w-[200px] truncate">{order.customer_address}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono text-sm font-semibold">৳{order.total_amount?.toLocaleString() || 0}</span>
                        </td>
                        <td className="px-4 py-4">
                          <Badge 
                            variant="secondary" 
                            className={cn("text-xs", statusConfig[order.status]?.className || statusConfig.pending.className)}
                          >
                            {statusConfig[order.status]?.label || order.status}
                          </Badge>
                          {order.payment_status === 'paid' && (
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">Payment Verified</p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                        </td>
                        <td className="px-4 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              {order.status === 'pending' && (
                                <DropdownMenuItem onClick={() => updateOrderStatus(order.id, 'processing')}>
                                  <Check className="h-4 w-4 mr-2" />
                                  Mark as Processing
                                </DropdownMenuItem>
                              )}
                              {order.status === 'processing' && (
                                <DropdownMenuItem onClick={() => updateOrderStatus(order.id, 'completed')}>
                                  <Package className="h-4 w-4 mr-2" />
                                  Mark as Completed
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem 
                                onClick={() => {
                                  if (order.conversation_id) {
                                    router.push(`/dashboard/conversations?id=${order.conversation_id}`)
                                  } else {
                                    toast.error('No conversation found for this order')
                                  }
                                }}
                                disabled={!order.conversation_id}
                              >
                                <MessageSquare className="h-4 w-4 mr-2" />
                                View Conversation
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => updateOrderStatus(order.id, 'cancelled')}
                              >
                                <X className="h-4 w-4 mr-2" />
                                Cancel Order
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {orders.length} of {total} orders
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Orders Cards - Mobile */}
        {!loading && orders.length > 0 && (
          <div className="md:hidden space-y-3">
            {orders.map((order) => (
              <Card key={order.id} className="bg-card border border-border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="font-mono text-sm text-primary hover:underline"
                    >
                      Order #{order.order_number || order.id.slice(0, 8)}
                    </button>
                    <Badge 
                      variant="secondary" 
                      className={cn("text-xs", statusConfig[order.status]?.className || statusConfig.pending.className)}
                    >
                      {statusConfig[order.status]?.label || order.status}
                    </Badge>
                  </div>
                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="font-medium text-sm">{order.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
                  </div>
                  <div className="border-t border-border mt-3 pt-3">
                    <p className="font-mono text-lg font-semibold">৳{order.total_amount?.toLocaleString() || 0}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-border mt-3 pt-3">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      <OrderDetailsModal order={selectedOrder} open={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
    </RequireFacebookPage>
  )
}
