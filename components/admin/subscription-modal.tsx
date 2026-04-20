/**
 * SubscriptionModal Component
 * 
 * Admin modal for managing user subscriptions.
 * Displays current status and provides actions: activate, extend, pause, cancel.
 */

'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { 
  Loader2, 
  CheckCircle, 
  Clock, 
  PauseCircle, 
  XCircle,
  CreditCard,
  Calendar,
  Ban
} from 'lucide-react'

interface WorkspaceSubscription {
  id: string
  name: string
  subscription_status: 'trial' | 'active' | 'expired'
  subscription_plan: string | null
  trial_ends_at: string | null
  subscription_expires_at: string | null
  admin_paused: boolean
  last_payment_date: string | null
  total_paid: number
}

interface SubscriptionModalProps {
  workspace: WorkspaceSubscription | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function SubscriptionModal({ 
  workspace, 
  open, 
  onOpenChange,
  onSuccess 
}: SubscriptionModalProps) {
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('activate')

  // Form states
  const [plan, setPlan] = useState('growth')
  const [duration, setDuration] = useState('30')
  const [amount, setAmount] = useState('2999')
  const [paymentMethod, setPaymentMethod] = useState('bkash')
  const [transactionId, setTransactionId] = useState('')
  const [notes, setNotes] = useState('')
  const [pauseReason, setPauseReason] = useState('')

  if (!workspace) return null

  const status = workspace.subscription_status
  const isPaused = workspace.admin_paused

  const handleActivate = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/subscriptions/${workspace.id}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          duration_days: parseInt(duration),
          amount: parseFloat(amount),
          payment_method: paymentMethod,
          transaction_id: transactionId || undefined,
          notes: notes || undefined,
        }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to activate')
      }

      toast.success(`Subscription activated for ${workspace.name}`)
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to activate subscription')
    } finally {
      setLoading(false)
    }
  }

  const handleExtend = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/subscriptions/${workspace.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: parseInt(duration),
          amount: parseFloat(amount),
          payment_method: paymentMethod,
          transaction_id: transactionId || undefined,
          notes: notes || undefined,
        }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to extend')
      }

      toast.success(`Subscription extended for ${workspace.name}`)
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to extend subscription')
    } finally {
      setLoading(false)
    }
  }

  const handlePause = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/subscriptions/${workspace.id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: pauseReason || undefined }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to pause')
      }

      toast.success(`Subscription paused for ${workspace.name}`)
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to pause subscription')
    } finally {
      setLoading(false)
    }
  }

  const handleResume = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/subscriptions/${workspace.id}/pause`, {
        method: 'DELETE',
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to resume')
      }

      toast.success(`Subscription resumed for ${workspace.name}`)
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resume subscription')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm(`Are you sure you want to cancel subscription for ${workspace.name}? Bot will stop working immediately.`)) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/admin/subscriptions/${workspace.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: notes || undefined }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to cancel')
      }

      toast.success(`Subscription cancelled for ${workspace.name}`)
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel subscription')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const getDaysRemaining = () => {
    const expiryDate = status === 'trial' ? workspace.trial_ends_at : workspace.subscription_expires_at
    if (!expiryDate) return 0
    const diff = new Date(expiryDate).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Manage Subscription
          </DialogTitle>
          <DialogDescription>
            {workspace.name}
          </DialogDescription>
        </DialogHeader>

        {/* Current Status */}
        <div className="p-4 bg-muted/30 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={
              isPaused ? 'outline' :
              status === 'active' ? 'default' :
              status === 'trial' ? 'secondary' : 'destructive'
            }>
              {isPaused ? 'Paused' : status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          </div>
          
          {workspace.subscription_plan && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Plan</span>
              <span className="text-sm font-medium capitalize">{workspace.subscription_plan}</span>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Days Remaining</span>
            <span className={cn(
              "text-sm font-medium",
              getDaysRemaining() <= 3 && getDaysRemaining() > 0 && "text-orange-500",
              getDaysRemaining() <= 0 && "text-red-500"
            )}>
              {getDaysRemaining()} days
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Expires</span>
            <span className="text-sm">
              {formatDate(status === 'trial' ? workspace.trial_ends_at : workspace.subscription_expires_at)}
            </span>
          </div>

          {workspace.last_payment_date && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last Payment</span>
              <span className="text-sm">{formatDate(workspace.last_payment_date)}</span>
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Paid</span>
            <span className="text-sm font-mono">৳{workspace.total_paid || 0}</span>
          </div>
        </div>

        {/* Quick Actions for Paused */}
        {isPaused && (
          <Button onClick={handleResume} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Resume Subscription
          </Button>
        )}

        {/* Tabs for Actions */}
        {!isPaused && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="activate">
                <CheckCircle className="h-4 w-4 mr-1" />
                Activate
              </TabsTrigger>
              <TabsTrigger value="extend" disabled={status === 'expired'}>
                <Calendar className="h-4 w-4 mr-1" />
                Extend
              </TabsTrigger>
              <TabsTrigger value="pause" disabled={status === 'expired'}>
                <PauseCircle className="h-4 w-4 mr-1" />
                Pause
              </TabsTrigger>
            </TabsList>

            {/* Activate Tab */}
            <TabsContent value="activate" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plan</Label>
                  <Select value={plan} onValueChange={setPlan}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">Starter (৳1,499)</SelectItem>
                      <SelectItem value="growth">Growth (৳2,999)</SelectItem>
                      <SelectItem value="pro">Pro (৳5,999)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Duration (days)</Label>
                  <Input 
                    type="number" 
                    value={duration} 
                    onChange={(e) => setDuration(e.target.value)}
                    min="1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount (৳)</Label>
                  <Input 
                    type="number" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)}
                    min="0"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bkash">bKash</SelectItem>
                      <SelectItem value="nagad">Nagad</SelectItem>
                      <SelectItem value="rocket">Rocket</SelectItem>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Transaction ID (optional)</Label>
                <Input 
                  value={transactionId} 
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g., TRX123ABC"
                />
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  rows={2}
                />
              </div>

              <Button onClick={handleActivate} disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Activate Subscription
              </Button>
            </TabsContent>

            {/* Extend Tab */}
            <TabsContent value="extend" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Add Days</Label>
                  <Input 
                    type="number" 
                    value={duration} 
                    onChange={(e) => setDuration(e.target.value)}
                    min="1"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Amount (৳)</Label>
                  <Input 
                    type="number" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)}
                    min="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Transaction ID (optional)</Label>
                <Input 
                  value={transactionId} 
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder="e.g., TRX123ABC"
                />
              </div>

              <Button onClick={handleExtend} disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calendar className="h-4 w-4 mr-2" />}
                Extend Subscription
              </Button>
            </TabsContent>

            {/* Pause Tab */}
            <TabsContent value="pause" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Textarea 
                  value={pauseReason} 
                  onChange={(e) => setPauseReason(e.target.value)}
                  placeholder="Why are you pausing this subscription?"
                  rows={3}
                />
              </div>

              <Button variant="outline" onClick={handlePause} disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PauseCircle className="h-4 w-4 mr-2" />}
                Pause Subscription
              </Button>

              <div className="border-t pt-4">
                <Button variant="destructive" onClick={handleCancel} disabled={loading} className="w-full">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                  Cancel Subscription
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  This will set status to expired. Data is not deleted.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
