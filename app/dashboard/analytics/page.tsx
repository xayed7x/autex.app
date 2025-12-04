"use client"

import { useState, useEffect } from "react"
import { TopBar } from "@/components/dashboard/top-bar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatsCard } from "@/components/dashboard/stats-card"
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Clock,
  Download,
  Trophy,
  Loader2,
} from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar, Cell } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { RequireFacebookPage } from "@/components/dashboard/require-facebook-page"

interface AnalyticsData {
  salesByDate: Array<{ date: string; revenue: number; orders: number }>
  totalRevenue: number
  totalOrders: number
  topProducts: Array<{ id: string; name: string; revenue: number; count: number }>
  conversionRate: number
  averageOrderValue: number
  statusBreakdown: Record<string, number>
  dateRange: string
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState("7d")
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [dateRange])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/analytics?range=${dateRange}`)
      if (!response.ok) throw new Error("Failed to fetch analytics")
      
      const analyticsData = await response.json()
      setData(analyticsData)
    } catch (error) {
      console.error("Error fetching analytics:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatChartData = () => {
    if (!data) return []
    return data.salesByDate.map((item) => ({
      date: new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      revenue: item.revenue,
      orders: item.orders,
    }))
  }

  const formatStatusData = () => {
    if (!data?.statusBreakdown) return []
    return Object.entries(data.statusBreakdown).map(([status, count]) => ({
      status: status.charAt(0).toUpperCase() + status.slice(1),
      count,
    }))
  }

  if (loading) {
    return (
      <>
        <TopBar title="Analytics" />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  return (
    <RequireFacebookPage>
      <TopBar title="Analytics" />

      <div className="p-4 lg:p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-2xl font-semibold">Analytics</h2>
          <div className="flex gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" disabled>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {data ? (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Total Sales"
                value={`৳${data.totalRevenue.toLocaleString()}`}
                trend={{ value: "", direction: "up", isPositive: true }}
                comparison={`${data.totalOrders} orders`}
                icon={DollarSign}
                isCurrency
              />
              <StatsCard
                title="Avg Order Value"
                value={`৳${data.averageOrderValue.toLocaleString()}`}
                trend={{ value: "", direction: "up", isPositive: true }}
                comparison="per order"
                icon={ShoppingCart}
                isCurrency
              />
              <StatsCard
                title="Conversion Rate"
                value={`${data.conversionRate}%`}
                trend={{ value: "", direction: "up", isPositive: true }}
                comparison="Chats to Orders"
                icon={TrendingUp}
              />
              <StatsCard
                title="Response Time"
                value="< 1s"
                trend={{ value: "", direction: "down", isPositive: true }}
                comparison="AI powered"
                icon={Clock}
              />
            </div>

            {/* Revenue Chart */}
            <Card className="bg-card border border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Revenue Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {formatChartData().length > 0 ? (
                    <ChartContainer
                      config={{
                        revenue: {
                          label: "Revenue",
                          color: "hsl(var(--chart-1))",
                        },
                      }}
                      className="h-[300px] w-full"
                    >
                      <AreaChart data={formatChartData()}>
                        <defs>
                          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="5%"
                              stopColor="hsl(var(--chart-1))"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="hsl(var(--chart-1))"
                              stopOpacity={0.05}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          strokeOpacity={0.3}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          stroke="var(--muted-foreground)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="var(--muted-foreground)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `৳${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="hsl(var(--chart-1))"
                          strokeWidth={2.5}
                          fill="url(#fillRevenue)"
                          dot={false}
                          activeDot={{ r: 6, fill: "hsl(var(--chart-1))" }}
                        />
                      </AreaChart>
                    </ChartContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No revenue data for this period
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Two Column Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Order Status Breakdown */}
              <Card className="bg-card border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                    Order Status Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {formatStatusData().length > 0 ? (
                    <ChartContainer
                      config={{
                        pending: { label: "Pending", color: "hsl(var(--chart-3))" },
                        confirmed: { label: "Confirmed", color: "hsl(var(--chart-4))" },
                        shipped: { label: "Shipped", color: "hsl(var(--chart-5))" },
                        delivered: { label: "Delivered", color: "hsl(var(--chart-1))" },
                        cancelled: { label: "Cancelled", color: "hsl(var(--destructive))" },
                      }}
                      className="h-[250px] w-full"
                    >
                      <BarChart data={formatStatusData()}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          strokeOpacity={0.3}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="status"
                          stroke="var(--muted-foreground)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="var(--muted-foreground)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                          dataKey="count"
                          radius={[8, 8, 0, 0]}
                        >
                          {/* Different colors per status */}
                          <Cell fill="hsl(var(--chart-3))" /> {/* Pending - Blue */}
                          <Cell fill="hsl(var(--chart-4))" /> {/* Confirmed - Green */}
                          <Cell fill="hsl(var(--chart-5))" /> {/* Shipped - Orange */}
                          <Cell fill="hsl(var(--chart-1))" /> {/* Delivered - Purple */}
                          <Cell fill="hsl(var(--destructive))" /> {/* Cancelled - Red */}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      No order data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Orders Over Time */}
              <Card className="bg-card border border-border shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Orders Over Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {formatChartData().length > 0 ? (
                    <ChartContainer
                      config={{
                        orders: {
                          label: "Orders",
                          color: "hsl(var(--chart-2))",
                        },
                      }}
                      className="h-[250px] w-full"
                    >
                      <AreaChart data={formatChartData()}>
                        <defs>
                          <linearGradient id="fillOrders" x1="0" y1="0" x2="0" y2="1">
                            <stop
                              offset="5%"
                              stopColor="hsl(var(--chart-2))"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="95%"
                              stopColor="hsl(var(--chart-2))"
                              stopOpacity={0.05}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                          strokeOpacity={0.3}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="date"
                          stroke="var(--muted-foreground)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="var(--muted-foreground)"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          type="monotone"
                          dataKey="orders"
                          stroke="hsl(var(--chart-2))"
                          strokeWidth={2.5}
                          fill="url(#fillOrders)"
                          dot={false}
                          activeDot={{ r: 6, fill: "hsl(var(--chart-2))" }}
                        />
                      </AreaChart>
                    </ChartContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      No order data for this period
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top Performing Products */}
            <Card className="bg-card border border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  Top Performing Products
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topProducts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="pb-3 text-left text-xs font-medium text-muted-foreground">Product Name</th>
                          <th className="pb-3 text-right text-xs font-medium text-muted-foreground">Units Sold</th>
                          <th className="pb-3 text-right text-xs font-medium text-muted-foreground">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.topProducts.map((product) => (
                          <tr key={product.id}>
                            <td className="py-3 font-medium text-sm">{product.name}</td>
                            <td className="py-3 text-right text-sm">{product.count}</td>
                            <td className="py-3 text-right font-mono text-sm">৳{product.revenue.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No product sales data available for this period
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No analytics data available
          </div>
        )}
      </div>
    </RequireFacebookPage>
  )
}
