"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts"
import { BarChart3 } from "lucide-react"
import { format } from "date-fns"

interface SalesData {
  date: string
  revenue: number
  orders: number
}

export function SalesChart() {
  const [salesData, setSalesData] = useState<SalesData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSalesData()
  }, [])

  const fetchSalesData = async () => {
    try {
      const response = await fetch('/api/dashboard/sales?days=7')
      if (response.ok) {
        const data = await response.json()
        setSalesData(data.chartData || [])
      }
    } catch (error) {
      console.error('Failed to fetch sales data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Format data for display
  const chartData = salesData.map(item => ({
    day: format(new Date(item.date), 'EEE'),
    orders: item.orders,
    revenue: item.revenue,
  }))

  return (
    <Card className="bg-card border border-border shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg font-semibold">Sales Trend</CardTitle>
        </div>
        <CardDescription>Last 7 days orders</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">
            Loading chart...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">
            No sales data available
          </div>
        ) : (
          <ChartContainer
            config={{
              orders: {
                label: "Orders",
                color: "hsl(var(--chart-2))",
              },
            }}
            className="h-[250px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-orders)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-orders)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} strokeOpacity={0.3} />
                <XAxis
                  dataKey="day"
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                />
                <YAxis 
                  stroke="var(--muted-foreground)" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `${value}`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="orders"
                  stroke="var(--color-orders)"
                  strokeWidth={2.5}
                  fill="url(#fillOrders)"
                  dot={false}
                  activeDot={{ r: 6, fill: "var(--color-orders)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
