"use client"

import { useState, useEffect, useMemo } from "react"
import { cn } from "@/lib/utils"
import { SmartCard } from "@/components/ui/premium/smart-card"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SubscriptionModal } from "@/components/admin/subscription-modal"
import { PremiumLoader } from "@/components/ui/premium/premium-loader"
import {
  Building2,
  Search,
  RefreshCw,
  Settings2,
  Users,
  UserCheck,
  Clock,
  Pause,
  DollarSign,
} from "lucide-react"

interface Workspace {
  id: string
  name: string
  businessName: string
  phone: string
  createdAt: string
  totalConversations: number
  totalOrders: number
  successRate: number
  todayCost: number
  lastActiveAt: string
  subscriptionStatus: 'trial' | 'active' | 'expired'
  subscriptionPlan: string | null
  trialEndsAt: string | null
  subscriptionExpiresAt: string | null
  adminPaused: boolean
  lastPaymentDate: string | null
  totalPaid: number
  totalUsageCost: number
}

// Summary stat card with consistent dashboard style
function SummaryCard({ 
  label, 
  value, 
  icon: Icon, 
  colorClass 
}: { 
  label: string
  value: number | string
  icon: any
  colorClass: string 
}) {
  return (
    <SmartCard className="h-full">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", colorClass)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </SmartCard>
  )
}

export default function AdminWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)

  useEffect(() => {
    fetchWorkspaces()
  }, [])

  const fetchWorkspaces = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const response = await fetch('/api/admin/workspaces')
      if (!response.ok) throw new Error('Failed to fetch')
      const data = await response.json()
      setWorkspaces(data.workspaces || [])
    } catch (error) {
      console.error('Error fetching workspaces:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Calculate summary stats
  const stats = useMemo(() => {
    const trial = workspaces.filter(w => w.subscriptionStatus === 'trial').length
    const active = workspaces.filter(w => w.subscriptionStatus === 'active' && !w.adminPaused).length
    const expired = workspaces.filter(w => w.subscriptionStatus === 'expired').length
    const paused = workspaces.filter(w => w.adminPaused).length
    const totalRevenue = workspaces.reduce((sum, w) => sum + (w.totalPaid || 0), 0)
    
    return { trial, active, expired, paused, totalRevenue }
  }, [workspaces])

  const filteredWorkspaces = workspaces.filter(ws =>
    ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ws.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ws.phone.includes(searchQuery)
  )

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 70) return 'text-green-600 dark:text-green-400'
    if (rate >= 50) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getStatusBadge = (ws: Workspace) => {
    if (ws.adminPaused) {
      return <Badge variant="outline" className="bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border-orange-200 dark:border-orange-800">Paused</Badge>
    }
    switch (ws.subscriptionStatus) {
      case 'trial':
        return <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 border-purple-200 dark:border-purple-800">Trial</Badge>
      case 'active':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800">Active</Badge>
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const getDaysRemaining = (ws: Workspace) => {
    const expiryDate = ws.subscriptionStatus === 'trial' ? ws.trialEndsAt : ws.subscriptionExpiresAt
    if (!expiryDate) return '-'
    const diff = new Date(expiryDate).getTime() - Date.now()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (days <= 0) return <span className="text-red-500 font-medium">0d</span>
    if (days <= 3) return <span className="text-amber-500 font-medium">{days}d</span>
    return <span className="font-medium">{days}d</span>
  }

  const handleManageSubscription = (ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedWorkspace(ws)
    setShowSubscriptionModal(true)
  }

  if (loading) {
    return <PremiumLoader />
  }

  return (
    <div className="p-4 lg:p-6 space-y-8 max-w-[1600px] mx-auto">
      {/* Header - Editorial Style */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h2 className="text-3xl lg:text-4xl font-serif text-foreground tracking-tight">
            Workspaces
          </h2>
          <p className="text-sm text-muted-foreground mt-2">{workspaces.length} registered businesses</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => fetchWorkspaces(true)}
            disabled={refreshing}
            className="h-9 w-9"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard 
          label="Trial" 
          value={stats.trial} 
          icon={Clock} 
          colorClass="bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400" 
        />
        <SummaryCard 
          label="Active" 
          value={stats.active} 
          icon={UserCheck} 
          colorClass="bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400" 
        />
        <SummaryCard 
          label="Expired" 
          value={stats.expired} 
          icon={Users} 
          colorClass="bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400" 
        />
        <SummaryCard 
          label="Paused" 
          value={stats.paused} 
          icon={Pause} 
          colorClass="bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400" 
        />
        <SummaryCard 
          label="Total Revenue" 
          value={`৳${stats.totalRevenue.toLocaleString()}`} 
          icon={DollarSign} 
          colorClass="bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400" 
        />
      </div>

      {/* Workspaces Table */}
      <SmartCard>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground text-xs">Workspace</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Status</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Days Left</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs hidden lg:table-cell">Convos</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs hidden lg:table-cell">Success</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs hidden md:table-cell">Usage Cost</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs hidden md:table-cell">Total Paid</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground text-xs">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredWorkspaces.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'No workspaces match your search' : 'No workspaces found'}
                    </td>
                  </tr>
                ) : (
                  filteredWorkspaces.map((ws) => (
                    <tr 
                      key={ws.id} 
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => window.location.href = `/admin/workspaces/${ws.id}`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-primary/5 dark:bg-white/10 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-primary dark:text-white" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{ws.businessName}</p>
                            <p className="text-xs text-muted-foreground">{ws.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center py-3 px-4">
                        {getStatusBadge(ws)}
                      </td>
                      <td className="text-center py-3 px-4 font-mono text-sm">
                        {getDaysRemaining(ws)}
                      </td>
                      <td className="text-center py-3 px-4 font-mono text-sm hidden lg:table-cell">
                        {ws.totalConversations}
                      </td>
                      <td className="text-center py-3 px-4 hidden lg:table-cell">
                        <span className={`font-medium text-sm ${getSuccessRateColor(ws.successRate)}`}>
                          {ws.successRate}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-4 font-mono text-sm hidden md:table-cell">
                        <span className="text-primary font-medium">
                          ৳{(ws.totalUsageCost || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </td>
                      <td className="text-center py-3 px-4 font-mono text-sm hidden md:table-cell">
                        <span className={ws.totalPaid > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                          ৳{(ws.totalPaid || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleManageSubscription(ws, e)}
                          className="h-8 px-2 active:scale-95 transition-all"
                        >
                          <Settings2 className="h-4 w-4 mr-1" />
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </SmartCard>

      {/* Subscription Management Modal */}
      <SubscriptionModal
        workspace={selectedWorkspace ? {
          id: selectedWorkspace.id,
          name: selectedWorkspace.businessName,
          subscription_status: selectedWorkspace.subscriptionStatus,
          subscription_plan: selectedWorkspace.subscriptionPlan,
          trial_ends_at: selectedWorkspace.trialEndsAt,
          subscription_expires_at: selectedWorkspace.subscriptionExpiresAt,
          admin_paused: selectedWorkspace.adminPaused,
          last_payment_date: selectedWorkspace.lastPaymentDate,
          total_paid: selectedWorkspace.totalPaid,
        } : null}
        open={showSubscriptionModal}
        onOpenChange={setShowSubscriptionModal}
        onSuccess={() => fetchWorkspaces(true)}
      />
    </div>
  )
}
