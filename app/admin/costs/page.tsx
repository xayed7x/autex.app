"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { SmartCard } from "@/components/ui/premium/smart-card"
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatsCard } from "@/components/dashboard/stats-card"
import { PremiumLoader } from "@/components/ui/premium/premium-loader"
import {
  DollarSign,
  TrendingUp,
  RefreshCw,
  PieChart as PieChartIcon,
  Target,
  Building2,
} from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import Link from "next/link"

interface CostsData {
  summary: {
    totalCost: number
    totalRequests: number
    todayCost: number
    weekCost: number
    monthCost: number
    avgCostPerConversation: string
    conversationsThisMonth: number
    exchangeRate: number
    avgCostMessenger: number
    avgCostComment: number
    totalVoiceCost: number
    totalVoiceRequests: number
    avgCostVoice: number
  }
  breakdown: Array<{
    type: string
    rawType: string
    cost: number
    count: number
    percentage: number
    tokens: number
  }>
  history: Array<{
    date: string
    displayDate: string
    cost: number
  }>
  perWorkspace: Array<{
    id: string
    name: string
    today: number
    week: number
    month: number
  }>
  recentCalls: Array<{
    id: string
    date: string
    workspaceId: string
    workspaceName: string
    feature: string
    model: string
    tokens: number
    costUSD: number
    costBDT: number
  }>
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function AdminCostsPage() {
  const [data, setData] = useState<CostsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const response = await fetch('/api/admin/costs')
      if (!response.ok) throw new Error('Failed to fetch')
      const result = await response.json()
      setData(result)
    } catch (error) {
      console.error('Error fetching costs:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  if (loading) {
    return <PremiumLoader />
  }

  const targetCost = 2.0 // Target cost per conversation in BDT
  const isUnderTarget = parseFloat(data?.summary.avgCostPerConversation || '0') <= targetCost

  return (
    <div className="p-4 lg:p-6 space-y-8 max-w-[1600px] mx-auto">
      {/* Header - Editorial Style */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h2 className="text-3xl lg:text-4xl font-serif text-foreground tracking-tight">
            Cost Analysis
          </h2>
          <p className="text-sm text-muted-foreground mt-2">System-wide API usage and spending</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="h-9 font-medium shadow-sm active:scale-95 transition-all"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Cost Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Today"
          value={`৳${(data?.summary.todayCost || 0).toFixed(4)}`}
          trend={{ value: "", direction: "up", isPositive: true }}
          comparison="API cost today"
          icon={DollarSign}
          isCurrency
        />
        <StatsCard
          title="This Week"
          value={`৳${(data?.summary.weekCost || 0).toFixed(4)}`}
          trend={{ value: "", direction: "up", isPositive: true }}
          comparison="Last 7 days"
          icon={TrendingUp}
          isCurrency
        />
        <StatsCard
          title="This Month"
          value={`৳${(data?.summary.monthCost || 0).toFixed(4)}`}
          trend={{ value: "", direction: "up", isPositive: true }}
          comparison={`${data?.summary.conversationsThisMonth || 0} conversations`}
          icon={DollarSign}
          isCurrency
        />
        <StatsCard
          title="Avg per Conversation"
          value={`৳${data?.summary.avgCostPerConversation || '0.00'}`}
          trend={{ 
            value: isUnderTarget ? "On Target" : "Over Target", 
            direction: isUnderTarget ? "down" : "up", 
            isPositive: isUnderTarget 
          }}
          comparison={`Target: ৳${targetCost.toFixed(2)}`}
          icon={Target}
          isCurrency
        />
      </div>
      
      {/* Specific Pricing Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SmartCard className="bg-primary/[0.03] border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-2 text-center">
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Avg cost per Messenger conversation</p>
              <h3 className="text-4xl font-black text-primary">
                ৳{(data?.summary.avgCostMessenger || 0).toFixed(2)}
              </h3>
              <p className="text-[10px] text-muted-foreground italic">Based on all agent_response events grouped by conversation</p>
            </div>
          </CardContent>
        </SmartCard>
        <SmartCard className="bg-primary/[0.03] border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-2 text-center">
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Avg cost per Comment reply</p>
              <h3 className="text-4xl font-black text-primary">
                ৳{(data?.summary.avgCostComment || 0).toFixed(4)}
              </h3>
              <p className="text-[10px] text-muted-foreground italic">Based on individual comment classification events</p>
            </div>
          </CardContent>
        </SmartCard>
        <SmartCard className="bg-indigo-500/[0.03] border-indigo-500/20">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-2 text-center">
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest text-indigo-500">Voice Transcription Service</p>
              <h3 className="text-4xl font-black text-indigo-500">
                ৳{(data?.summary.totalVoiceCost || 0).toFixed(2)}
              </h3>
              <div className="flex flex-col">
                <p className="text-[10px] text-muted-foreground italic font-medium"> Total: {data?.summary.totalVoiceRequests || 0} transcriptions</p>
                <p className="text-[10px] text-muted-foreground italic">Avg: ৳{(data?.summary.avgCostVoice || 0).toFixed(3)} / message</p>
              </div>
            </div>
          </CardContent>
        </SmartCard>
      </div>

      <div className="flex justify-end text-xs text-muted-foreground mr-2 -mt-4">
        * Exchange Rate: ৳{data?.summary.exchangeRate || '122.67'} = $1 USD.
      </div>


      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Trend */}
        <SmartCard>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Cost Trend (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                cost: {
                  label: "Cost",
                  color: "hsl(var(--chart-1))",
                },
              }}
              className="h-[280px] w-full"
            >
              <AreaChart data={data?.history || []}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  strokeOpacity={0.3}
                  vertical={false}
                />
                <XAxis
                  dataKey="displayDate"
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
                  tickFormatter={(v) => `৳${v.toFixed(2)}`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2.5}
                  fill="url(#costGradient)"
                  dot={false}
                  activeDot={{ r: 6, fill: "hsl(var(--chart-1))" }}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </SmartCard>

        {/* Cost Distribution */}
        <SmartCard>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Cost Distribution by API Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[280px] w-full">
              <PieChart>
                <Pie
                  data={data?.breakdown || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="cost"
                  nameKey="type"
                  label={({ percent = 0 }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                >
                  {(data?.breakdown || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip 
                  formatter={(value: number) => [`৳${value.toFixed(4)}`, "Cost"]}
                />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </SmartCard>
      </div>

      {/* Detailed Breakdown */}
      <SmartCard>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Detailed Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(data?.breakdown || []).map((item, index) => (
              <div key={item.rawType} className="flex items-center justify-between p-3 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3 w-1/3">
                  <div 
                    className="w-3 h-3 rounded-full shrink-0" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <div>
                    <p className="font-medium text-sm">{item.type}</p>
                    <p className="text-xs text-muted-foreground">{item.count} calls</p>
                  </div>
                </div>
                <div className="w-1/3 text-center">
                  <p className="font-mono font-medium text-sm">{(item.tokens || 0).toLocaleString()} tokens</p>
                </div>
                <div className="w-1/3 text-right">
                  <p className="font-mono font-medium text-sm">৳{(item.cost || 0).toFixed(4)}</p>
                  <p className="text-xs text-muted-foreground">{(item.percentage || 0).toFixed(1)}%</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </SmartCard>

      {/* Per Workspace Breakdown */}
      <SmartCard>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Per Workspace Costs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs">Workspace</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs">Today</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs">Week</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground text-xs">Month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.perWorkspace || []).map((ws) => (
                  <tr key={ws.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <Link href={`/admin/workspaces/${ws.id}`} className="font-medium text-sm hover:underline">
                        {ws.name}
                      </Link>
                    </td>
                    <td className="text-right py-3 px-4 font-mono text-sm">৳{ws.today.toFixed(4)}</td>
                    <td className="text-right py-3 px-4 font-mono text-sm">৳{ws.week.toFixed(4)}</td>
                    <td className="text-right py-3 px-4 font-mono text-sm">৳{ws.month.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </SmartCard>

      {/* Recent API Calls List */}
      <SmartCard>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            Recent API Calls
          </CardTitle>
          <CardDescription>
            Last 100 tracked AI inferences across all workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background/95 backdrop-blur z-10">
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Time</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Workspace</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Feature</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Model</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Tokens</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Cost (USD)</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Cost (BDT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.recentCalls || []).map((call) => (
                  <tr key={call.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-4 whitespace-nowrap text-muted-foreground">
                      {new Date(call.date).toLocaleString()}
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap">
                      <Link href={`/admin/workspaces/${call.workspaceId}`} className="hover:underline">
                        {call.workspaceName}
                      </Link>
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                        {call.feature}
                      </span>
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap font-mono text-xs">{call.model}</td>
                    <td className="text-right py-2 px-4 font-mono">{(call.tokens || 0).toLocaleString()}</td>
                    <td className="text-right py-2 px-4 font-mono">${(call.costUSD || 0).toFixed(6)}</td>
                    <td className="text-right py-2 px-4 font-mono">৳{(call.costBDT || 0).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.recentCalls?.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                No recent API calls found.
              </div>
            )}
          </div>
        </CardContent>
      </SmartCard>
    </div>
  )
}
