"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts"
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
          <BarChart3 className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-semibold">Sales Trend</CardTitle>
        </div>
        <CardDescription>Last 7 days</CardDescription>
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
                color: "var(--color-chart-1)",
              },
            }}
            className="h-[250px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="orders"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  dot={{ fill: "var(--color-chart-1)", strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
