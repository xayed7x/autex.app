"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { TopBar } from "@/components/dashboard/top-bar"
import { PremiumLoader } from "@/components/ui/premium/premium-loader"
import { SmartCard } from "@/components/ui/premium/smart-card"
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

type OrderStatus = "pending" | "shipped" | "cancelled" | "processing" | "completed"

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
  delivery_date?: string
  flavor?: string
  weight?: string
  custom_message?: string
  pounds_ordered?: number
  order_items?: OrderItem[]
  products?: { name: string; image_urls?: string[] }
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  shipped: { label: "Shipped", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
}

export default function OrdersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
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

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders()
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch when filters change (immediate)
  useEffect(() => {
    fetchOrders()
  }, [statusFilter, dateRange, currentPage])

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
    // Only set full loading on initial fetch or major filter changes
    // avoiding it for search to prevent UI flashing
    // Set fetching state for all requests
    setIsFetching(true)
    
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
      setInitialLoading(false)
      setIsFetching(false)
    }
  }

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    // 1. Optimistic Update
    const previousOrders = [...orders]
    setOrders(prev => prev.map(order => 
      order.id === orderId ? { ...order, status: newStatus as OrderStatus } : order
    ))

    const toastId = toast.loading(`Updating order status to ${newStatus}...`)

    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        toast.success(`Order marked as ${newStatus}`, { id: toastId })
        // No need to fetchOrders() immediately if optimistic update was correct
        // But we can re-fetch just to be safe in background, or let realtime handle it
      } else {
        throw new Error('Failed to update')
      }
    } catch (error) {
      console.error('Failed to update order:', error)
      toast.error('Failed to update order status', { id: toastId })
      // Revert on error
      setOrders(previousOrders)
    }
  }

  if (initialLoading) {
    return <PremiumLoader />
  }

  return (
    <RequireFacebookPage>
      <TopBar title="Orders" />

      <div className="p-4 lg:p-8 max-w-[1600px] mx-auto space-y-6">


        {/* Filters */}
        <SmartCard className="p-1 overflow-visible" variant="static">
          <div className="p-4 space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Customer Name or Phone..."
                className="pl-10 h-11 bg-background/50 border-white/10 focus:border-primary/50 focus:ring-primary/20 transition-all font-sans"
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
                <TabsList className="bg-transparent p-0 h-auto flex-wrap justify-start gap-2">
                  <TabsTrigger 
                    value="all" 
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary/20 hover:bg-white/10 hover:border-white/20 transition-all duration-200"
                  >
                    All
                  </TabsTrigger>
                  <TabsTrigger 
                    value="pending" 
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 data-[state=active]:bg-yellow-500/10 data-[state=active]:text-yellow-600 dark:data-[state=active]:text-yellow-400 data-[state=active]:border-yellow-500/20 hover:bg-yellow-500/10 hover:border-yellow-500/20 transition-all duration-200"
                  >
                    Pending
                  </TabsTrigger>
                  <TabsTrigger 
                    value="completed" 
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 data-[state=active]:bg-green-500/10 data-[state=active]:text-green-600 dark:data-[state=active]:text-green-400 data-[state=active]:border-green-500/20 hover:bg-green-500/10 hover:border-green-500/20 transition-all duration-200"
                  >
                    Confirmed
                  </TabsTrigger>
                  <TabsTrigger 
                    value="cancelled" 
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 data-[state=active]:bg-red-500/10 data-[state=active]:text-red-600 dark:data-[state=active]:text-red-400 data-[state=active]:border-red-500/20 hover:bg-red-500/10 hover:border-red-500/20 transition-all duration-200"
                  >
                    Cancelled
                  </TabsTrigger>
                  <TabsTrigger 
                    value="shipped" 
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-600 dark:data-[state=active]:text-purple-400 data-[state=active]:border-purple-500/20 hover:bg-purple-500/10 hover:border-purple-500/20 transition-all duration-200"
                  >
                    Shipped
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2">
                <Select value={dateRange} onValueChange={(value) => {
                  setDateRange(value)
                  setCurrentPage(1)
                }}>
                  <SelectTrigger className="w-[140px] bg-background/50 border-white/10">
                    <SelectValue placeholder="Date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last 7 days</SelectItem>
                    <SelectItem value="month">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" disabled className="bg-background/50 border-white/10 hover:bg-background/80 opacity-50 cursor-not-allowed">
                  <Download className="h-4 w-4 mr-2" />
                  Export (Coming Soon)
                </Button>
              </div>
            </div>
          </div>
        </SmartCard>

        {/* Empty State */}
        {!initialLoading && orders.length === 0 && !isFetching && (
          <SmartCard>
            <div className="p-12 text-center">
              <div className="relative inline-flex mb-4">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                <div className="relative p-4 bg-background/50 rounded-2xl border border-white/10 shadow-xl">
                  <Package className="h-10 w-10 text-primary" />
                </div>
              </div>
              <h3 className="text-xl font-serif font-medium mb-2">No orders found</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                {searchQuery || statusFilter !== 'all' 
                  ? 'Try adjusting your filters or search query to find what you re looking for.'
                  : 'Orders from your Facebook Messenger will appear here automatically.'}
              </p>
              {(searchQuery || statusFilter !== 'all') && (
                <Button variant="outline" onClick={() => { setSearchQuery(""); setStatusFilter("all") }}>
                  Clear Filters
                </Button>
              )}
            </div>
          </SmartCard>
        )}

        {/* Orders Table - Desktop */}
        {!initialLoading && (orders.length > 0 || isFetching) && (
          <SmartCard className={cn("hidden md:block overflow-hidden transition-opacity duration-200", isFetching ? "opacity-50 pointer-events-none" : "opacity-100")} variant="static">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5 bg-muted/20">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order ID</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Address</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {orders.map((order) => (
                    <tr key={order.id} className="group hover:bg-muted/10 transition-colors duration-200">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="font-mono text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                          #{order.order_number || order.id.slice(0, 8)}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-sm text-foreground">{order.customer_name}</span>
                          <span className="text-xs text-muted-foreground">{order.customer_phone}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-muted-foreground max-w-[200px] truncate" title={order.customer_address}>
                          {order.customer_address || 'No address provided'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-bold text-foreground">৳{order.total_amount?.toLocaleString() || 0}</span>
                      </td>
                      <td className="px-6 py-4">
                         <Badge 
                            variant="secondary" 
                            className={cn(
                              "text-[10px] px-2.5 py-0.5 font-bold uppercase tracking-wider shadow-none border transition-colors", 
                              statusConfig[order.status]?.className || statusConfig.pending.className
                            )}
                          >
                            {statusConfig[order.status]?.label || order.status}
                          </Badge>
                          {order.payment_status === 'paid' && (
                            <div className="flex items-center gap-1 mt-1.5 text-[10px] font-medium text-emerald-500">
                              <Check className="h-3 w-3" />
                              PAID
                            </div>
                          )}
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground/80 font-mono">
                        {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {order.status === 'pending' && (
                              <DropdownMenuItem onClick={() => updateOrderStatus(order.id, 'completed')}>
                                <Check className="h-4 w-4 mr-2" />
                                Mark as Confirmed
                              </DropdownMenuItem>
                            )}
                            {order.status === 'completed' && (
                              <DropdownMenuItem onClick={() => updateOrderStatus(order.id, 'shipped')}>
                                <Package className="h-4 w-4 mr-2" />
                                Mark Delivered
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
                              Conversation
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
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
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-muted/10">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Showing {orders.length} of {total} orders
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1 px-2">
                   <span className="text-sm font-medium">{currentPage}</span>
                   <span className="text-muted-foreground text-sm">/</span>
                   <span className="text-sm text-muted-foreground">{totalPages || 1}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SmartCard>
        )}

        {/* Orders Cards - Mobile */}
        {!initialLoading && (orders.length > 0 || isFetching) && (
          <div className={cn("md:hidden space-y-4 transition-opacity duration-200", isFetching ? "opacity-50 pointer-events-none" : "opacity-100")}>
            {orders.map((order) => (
              <SmartCard key={order.id} className="overflow-hidden">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="font-mono text-sm font-bold text-primary hover:underline"
                    >
                      #{order.order_number || order.id.slice(0, 8)}
                    </button>
                    <Badge 
                      variant="secondary" 
                      className={cn("text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider", statusConfig[order.status]?.className || statusConfig.pending.className)}
                    >
                      {statusConfig[order.status]?.label || order.status}
                    </Badge>
                  </div>
                  
                  <div className="flex items-start gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold">{order.customer_name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{order.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{order.customer_address}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div>
                       <span className="block text-xs text-muted-foreground mb-0.5">Total Amount</span>
                       <span className="font-mono text-base font-bold text-foreground">৳{order.total_amount?.toLocaleString() || 0}</span>
                    </div>
                    
                    <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)} className="bg-transparent border-white/10">
                      View Details
                    </Button>
                  </div>
                </div>
              </SmartCard>
            ))}
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      <OrderDetailsModal order={selectedOrder} open={!!selectedOrder} onClose={() => setSelectedOrder(null)} />
    </RequireFacebookPage>
  )
}
