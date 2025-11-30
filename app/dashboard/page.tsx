'use client'

import { useEffect, useState } from "react"
import { TopBar } from "@/components/dashboard/top-bar"
import { StatsCard } from "@/components/dashboard/stats-card"
import { SalesChart } from "@/components/dashboard/sales-chart"
import { TopProducts } from "@/components/dashboard/top-products"
import { RecentOrders } from "@/components/dashboard/recent-orders"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { Alerts } from "@/components/dashboard/alerts"
import { Button } from "@/components/ui/button"
import { Package, Wallet, MessageSquare, Bot, Settings } from "lucide-react"
import Link from "next/link"
import { useWorkspace } from "@/lib/workspace-provider"

interface DashboardStats {
  ordersToday: number
  revenueToday: number
  messagesToday: number
  aiCostThisMonth: number
  trends: {
    orders: number
    revenue: number
  }
}

export default function DashboardPage() {
  const { user } = useWorkspace()
  const [stats, setStats] = useState<DashboardStats>({
    ordersToday: 0,
    revenueToday: 0,
    messagesToday: 0,
    aiCostThisMonth: 0,
    trends: { orders: 0, revenue: 0 },
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/dashboard/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
    }
  }
  return (
    <>
      <TopBar title="Overview" />

      <div className="p-4 lg:p-6 space-y-6">
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Welcome back, Code and Cortex! 👋</h2>
            <p className="text-muted-foreground mt-1">
              Connected Page: <span className="font-medium text-foreground">&quot;Code and Cortex&quot;</span>
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/pages">
              <Settings className="h-4 w-4 mr-2" />
              Manage
            </Link>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Orders Today"
            value={loading ? "..." : stats.ordersToday.toString()}
            trend={{
              value: `${stats.trends.orders > 0 ? '+' : ''}${stats.trends.orders}%`,
              direction: stats.trends.orders >= 0 ? "up" : "down",
              isPositive: stats.trends.orders >= 0
            }}
            comparison="vs last week"
            icon={Package}
          />
          <StatsCard
            title="Revenue Today"
            value={loading ? "..." : `৳${stats.revenueToday.toLocaleString()}`}
            trend={{
              value: `${stats.trends.revenue > 0 ? '+' : ''}${stats.trends.revenue}%`,
              direction: stats.trends.revenue >= 0 ? "up" : "down",
              isPositive: stats.trends.revenue >= 0
            }}
            comparison="vs last week"
            icon={Wallet}
            isCurrency
          />
          <StatsCard
            title="Messages Today"
            value={loading ? "..." : stats.messagesToday.toString()}
            trend={{ value: "+8%", direction: "up", isPositive: true }}
            comparison="vs last week"
            icon={MessageSquare}
          />
          <StatsCard
            title="AI Cost This Month"
            value={loading ? "..." : `৳${stats.aiCostThisMonth.toFixed(2)}`}
            trend={{ value: "-12%", direction: "down", isPositive: true }}
            comparison="vs last month"
            icon={Bot}
            isCurrency
          />
        </div>

        {/* Alerts */}
        <Alerts />

        {/* Two Column Section: Chart + Top Products */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <SalesChart />
          </div>
          <div className="lg:col-span-2">
            <TopProducts />
          </div>
        </div>

        {/* Recent Orders + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <RecentOrders />
          </div>
          <div className="lg:col-span-1">
            <QuickActions />
          </div>
        </div>
      </div>
    </>
  )
}
