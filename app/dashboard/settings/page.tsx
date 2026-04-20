"use client"

import { useState, useEffect } from "react"
import { TopBar } from "@/components/dashboard/top-bar"
import { SmartCard } from "@/components/ui/premium/smart-card"
import { PremiumButton } from "@/components/ui/premium/premium-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { User, Facebook, Bell, CreditCard, Save, AlertCircle, Trash2, Bot, CheckCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { formatDistanceToNow } from "date-fns"
import { PremiumLoader } from "@/components/ui/premium/premium-loader"
import { PaymentModal } from "@/components/dashboard/payment-modal"
import { useSubscription } from "@/hooks/use-subscription"
import { cn } from "@/lib/utils"

interface SettingsData {
  user: {
    id: string
    email: string
    business_name?: string
    phone?: string
  }
  workspace: {
    id: string
    name: string
    subscription_status: string
  } | null
}

interface Notification {
  id: string
  title: string
  description: string
  time: string
  unread: boolean
  link: string
}

import { useSearchParams } from "next/navigation"

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState("general")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<SettingsData | null>(null)
  const [formData, setFormData] = useState({
    business_name: "",
    business_category: "clothing"
  })
  const [initialCategory, setInitialCategory] = useState("clothing")
  const { toast } = useToast()
  const [showCategoryConfirm, setShowCategoryConfirm] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  // Read tab from URL params on mount
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['general', 'facebook', 'notifications', 'billing'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [searchParams])

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/settings")
      if (!response.ok) throw new Error("Failed to fetch settings")
      
      const settingsData = await response.json()
      setData(settingsData)
      const businessName = settingsData.user.business_name || ""
      const isDefaultName = businessName.trim().toLowerCase() === 'code and cortex'
      
      setFormData({
        business_name: isDefaultName ? "" : businessName,
        business_category: settingsData.workspace?.business_category || 'clothing'
      })
      setInitialCategory(settingsData.workspace?.business_category || 'clothing')
      
      fetchNotifications(settingsData.workspace?.id)
    } catch (error) {
      console.error("Error fetching settings:", error)
      toast({
        title: "Error",
        description: "Failed to load settings",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchNotifications = async (workspaceId?: string) => {
    if (!workspaceId) return

    try {
      const supabase = createClient()
      
      // Get connected page
      const { data: page } = await supabase
        .from('facebook_pages')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'connected')
        .single()
      
      if (page) {
        const { data: orders } = await supabase
          .from('orders')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('fb_page_id', page.id)
          .order('created_at', { ascending: false })
          .limit(10)
        
        if (orders) {
          const formatted: Notification[] = orders.map(order => ({
            id: order.id,
            title: "New order received",
            description: `Order #${order.order_number || 'N/A'} from ${order.customer_name}`,
            time: formatDistanceToNow(new Date(order.created_at), { addSuffix: true }),
            unread: false,
            link: `/dashboard/orders`
          }))
          setNotifications(formatted)
        }
      } else {
        setNotifications([])
      }
    } catch (error) {
      console.error("Error fetching notifications:", error)
    }
  }

  const handleSave = async () => {
    setShowCategoryConfirm(false)
    try {
      setSaving(true)
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })

      if (!response.ok) throw new Error("Failed to save settings")

      toast({
        title: "Success",
        description: "Settings saved successfully"
      })
      
      setInitialCategory(formData.business_category)
      fetchSettings()
    } catch (error) {
      console.error("Error saving settings:", error)
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const confirmSave = () => {
    // Check if category is changing
    if (formData.business_category !== initialCategory) {
      setShowCategoryConfirm(true)
    } else {
      handleSave()
    }
  }

  if (loading) {
    return <PremiumLoader />
  }

  return (
    <>
      <TopBar title="Settings" />

      <div className="p-4 lg:p-6 space-y-6 pb-24 lg:pb-6">
        <h2 className="text-2xl font-semibold">Settings</h2>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Responsive TabsList: scrollable on mobile, icon-only on xs */}
          <TabsList className="bg-muted/50 w-full justify-start overflow-x-auto flex-nowrap scrollbar-hide">
            <TabsTrigger value="general" className="flex items-center gap-2 min-w-fit px-3 sm:px-4">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="facebook" className="flex items-center gap-2 min-w-fit px-3 sm:px-4">
              <Facebook className="h-4 w-4" />
              <span className="hidden sm:inline">Facebook</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2 min-w-fit px-3 sm:px-4">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2 min-w-fit px-3 sm:px-4">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">Billing</span>
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <SmartCard variant="static" className="p-8">
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-foreground">Business Profile</h3>
                <p className="text-sm text-muted-foreground">Manage your business information displayed in the dashboard</p>
              </div>
              
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl">
                  <div className="space-y-3">
                    <Label htmlFor="business-name" className="text-sm font-medium">
                      Business Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="business-name"
                      value={formData.business_name}
                      onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                      placeholder="Autex AI"
                      className="bg-zinc-50 border-zinc-200 focus:ring-black dark:bg-white/5 dark:border-white/10 dark:focus:ring-white h-11"
                    />
                    <p className="text-[11px] text-zinc-400">
                      Displayed in the dashboard header and profile menu
                    </p>
                  </div>
                  
                  <div className="space-y-3">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Account Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={data?.user.email || ""}
                      disabled
                      className="bg-zinc-100/50 text-zinc-500 border-zinc-200 dark:bg-white/5 dark:border-white/10 dark:text-zinc-500 cursor-not-allowed h-11"
                    />
                    <p className="text-[11px] text-zinc-400">
                      Used for login, billing, and important notifications
                    </p>
                  </div>
                </div>

                <div className="space-y-4 max-w-2xl pt-2">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Business Category</Label>
                    <p className="text-[11px] text-zinc-400">
                      এটা আপনার পুরো dashboard এবং AI এর behavior পরিবর্তন করে।
                    </p>
                  </div>
                  
                  <RadioGroup 
                    value={formData.business_category} 
                    onValueChange={(val) => setFormData({ ...formData, business_category: val })}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                  >
                    <div>
                      <RadioGroupItem
                        value="clothing"
                        id="clothing"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="clothing"
                        className="flex flex-col items-start p-4 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 peer-data-[state=checked]:border-black peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-black dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:peer-data-[state=checked]:border-white dark:peer-data-[state=checked]:ring-white cursor-pointer transition-all"
                      >
                        <span className="font-semibold text-sm">Clothing & Fashion</span>
                        <span className="text-xs text-zinc-500 mt-1">Size, color, stock management</span>
                      </Label>
                    </div>
                    
                    <div>
                      <RadioGroupItem
                        value="food"
                        id="food"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="food"
                        className="flex flex-col items-start p-4 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 peer-data-[state=checked]:border-black peer-data-[state=checked]:ring-1 peer-data-[state=checked]:ring-black dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:peer-data-[state=checked]:border-white dark:peer-data-[state=checked]:ring-white cursor-pointer transition-all"
                      >
                        <span className="font-semibold text-sm">Food & Cake</span>
                        <span className="text-xs text-zinc-500 mt-1">Flavor, weight, delivery date</span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                
                <div className="pt-6 border-t border-dashed border-zinc-200 dark:border-white/10 max-w-2xl">
                  <PremiumButton 
                    onClick={confirmSave} 
                    disabled={saving || !formData.business_name}
                    className="w-full sm:w-auto min-w-[140px]"
                  >
                    {saving ? (
                      <div className="flex items-center">
                        <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin mr-2" />
                        Saving...
                      </div>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </PremiumButton>
                </div>
              </div>
            </SmartCard>
          </TabsContent>

          {/* Facebook Tab */}
          <TabsContent value="facebook" className="mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <SmartCard variant="static" className="p-8">
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-foreground">Facebook Integration</h3>
                <p className="text-sm text-muted-foreground">Connect your Facebook pages for automated messaging</p>
              </div>
              <div className="space-y-6">
                <FacebookPagesSection />
              </div>
            </SmartCard>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <SmartCard variant="static" className="p-8">
              <div className="mb-8">
                 <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
                 <p className="text-sm text-muted-foreground">Recent alerts and updates</p>
              </div>
              
              <div>
                {notifications.length > 0 ? (
                  <div className="space-y-3">
                    {notifications.map((notification) => (
                      <div 
                        key={notification.id} 
                        className="flex items-start gap-4 p-4 rounded-xl border border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                      >
                        <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
                          <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{notification.title}</p>
                            <span className="text-[10px] bg-zinc-100 dark:bg-white/10 px-2 py-0.5 rounded-full text-zinc-500">{notification.time}</span>
                          </div>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">{notification.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center rounded-xl border border-dashed border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-white/5">
                    <div className="h-16 w-16 rounded-2xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center mx-auto mb-4">
                      <Bell className="h-8 w-8 text-zinc-400" />
                    </div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-1">No Notifications</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
                      You're all caught up! Connect a Facebook page to receive order alerts.
                    </p>
                  </div>
                )}
              </div>
            </SmartCard>
          </TabsContent>


          {/* Billing Tab */}
          <TabsContent value="billing" className="mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <SmartCard variant="static" className="p-8">
              <div className="mb-8">
                 <h3 className="text-lg font-semibold text-foreground">Billing & Subscription</h3>
                 <p className="text-sm text-muted-foreground">Manage your subscription and billing details</p>
              </div>

                <BillingTab />
            </SmartCard>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={showCategoryConfirm} onOpenChange={setShowCategoryConfirm}>
        <AlertDialogContent className="sm:max-w-[420px] p-6 border-zinc-200 dark:border-white/10 dark:bg-zinc-900/80 dark:backdrop-blur-xl shadow-2xl rounded-[24px]">
          <AlertDialogHeader>
            <div className="h-12 w-12 rounded-2xl bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center mb-2 animate-in zoom-in-50 duration-500">
              <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <AlertDialogTitle className="text-xl font-bold tracking-tight">Change Business Category?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 pt-2">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-base leading-snug">
                Business category পরিবর্তন করলে AI behavior এবং product fields পরিবর্তন হবে। আপনি কি নিশ্চিত?
              </p>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5">
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed italic">
                  "Changing the category will update your dashboard experience, product management fields, and how the AI interacts with your customers."
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 flex-col sm:flex-row gap-3">
            <AlertDialogCancel className="rounded-xl border-zinc-200 dark:border-white/10 h-12 flex-1 sm:flex-none hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
              Wait, Go Back
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSave}
              className="rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black h-12 border-none px-6 flex-1 sm:flex-none shadow-lg dark:shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] transition-all font-bold"
            >
              Yes, Update Category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function BillingTab() {
  const { subscription, isLoading: loading, workspaceName, plans } = useSubscription()
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 w-full relative h-[200px]">
        <PremiumLoader className="bg-transparent" />
      </div>
    )
  }

  const isTrial = subscription?.status === 'trial'
  const isExpired = subscription?.status === 'expired'
  const isPaused = subscription?.isPaused

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
               <h3 className="text-xl font-bold text-zinc-900 dark:text-white capitalize">
                 {isPaused ? 'Subscription Paused' : 
                  isExpired ? 'Subscription Expired' :
                  isTrial ? 'Free Trial' : 
                  subscription?.plan ? `${subscription.plan} Plan` : 'Active Plan'}
               </h3>
               <Badge variant={isPaused || isExpired ? "destructive" : "secondary"} className={cn(
                 "border-none font-semibold",
                 (isPaused || isExpired) ? "" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
               )}>
                 {isPaused ? 'Paused' : isExpired ? 'Expired' : 'Active'}
               </Badge>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {isPaused ? `Paused by admin: ${subscription?.pausedReason || 'Contact support'}` :
               isExpired ? 'Renew now to restore bot access.' :
               isTrial ? `You have ${subscription?.daysRemaining} days remaining on your trial.` : 
               `Renews on ${subscription?.expiresAt ? new Date(subscription.expiresAt).toLocaleDateString() : 'N/A'}`}
            </p>
          </div>
          
          <PremiumButton onClick={() => setShowPaymentModal(true)} className="w-full sm:w-auto min-w-[140px]">
             {isExpired ? 'Renew Now' : 'Manage Subscription'}
          </PremiumButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div className="p-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/50">
              <h4 className="font-medium mb-2">Plan Details</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  {isTrial ? '14-Day Free Trial' : subscription?.plan ? `${plans[subscription.plan].name} Features` : 'Active Plan'}
                </li>
                {subscription?.plan && plans[subscription.plan].features.map((feature: string, idx: number) => (
                  <li key={idx} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    {feature}
                  </li>
                ))}
                {!subscription?.plan && (
                  <>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Unlimited Products
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Unlimited Conversations
                    </li>
                  </>
                )}
              </ul>
           </div>
           
           <div className="p-4 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/50">
              <h4 className="font-medium mb-2">Usage Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium">{subscription?.status === 'trial' ? 'Trial' : 'Paid'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Days Left</span>
                  <span className={cn(
                    "font-medium",
                    (subscription?.daysRemaining || 0) <= 3 ? "text-orange-500" : ""
                  )}>{subscription?.daysRemaining || 0} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Paid</span>
                  <span className="font-medium">৳{subscription?.totalPaid || 0}</span>
                </div>
              </div>
           </div>
        </div>
      </div>
      <PaymentModal 
        open={showPaymentModal} 
        onOpenChange={setShowPaymentModal}
        workspaceName={workspaceName || undefined}
      />
    </>
  )
}



// Facebook Pages Section Component
function FacebookPagesSection() {
  const [pages, setPages] = useState<Array<{ id: string; page_name: string; created_at: string; bot_enabled: boolean; instagram_account_id: string | null; ig_bot_enabled: boolean }>>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [togglingIg, setTogglingIg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [disconnectDialog, setDisconnectDialog] = useState<{ open: boolean; pageId: string; pageName: string }>({
    open: false,
    pageId: '',
    pageName: '',
  })
  const [disableBotDialog, setDisableBotDialog] = useState<{ open: boolean; pageId: string; pageName: string }>({
    open: false,
    pageId: '',
    pageName: '',
  })
  const { toast } = useToast()

  useEffect(() => {
    fetchPages()
    
    // Check for URL parameters (success/error from OAuth flow)
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    const successParam = params.get('success')
    
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        'access_denied': 'You denied access to your Facebook pages',
        'invalid_callback': 'Invalid OAuth callback - please try again',
        'invalid_state': 'Security validation failed - please try again',
        'token_exchange_failed': 'Failed to exchange authorization code',
        'fetch_pages_failed': 'Failed to fetch your Facebook pages',
        'no_pages': 'You don\'t have any Facebook pages to connect',
        'callback_failed': 'OAuth callback failed - please try again',
      }
      setError(errorMessages[errorParam] || 'An error occurred during connection')
      
      // Clear URL parameters
      window.history.replaceState({}, '', '/dashboard/settings?tab=facebook')
    }
    
    if (successParam === 'connected') {
      setSuccess('Facebook page connected successfully!')
      
      // Show toast notification
      toast({
        title: 'Success! 🎉',
        description: 'Your Facebook page has been connected successfully',
      })
      
      fetchPages() // Refresh the list
      
      // Clear URL parameters
      window.history.replaceState({}, '', '/dashboard/settings?tab=facebook')
      
      // Auto-clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000)
    }
  }, [])

  const fetchPages = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/facebook/pages')
      
      if (!response.ok) throw new Error('Failed to fetch pages')
      
      const data = await response.json()
      setPages(data.pages || [])
    } catch (err) {
      console.error('Error fetching pages:', err)
      setError('Failed to load connected pages')
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = () => {
    // Check if a page is already connected
    if (pages.length > 0) {
      toast({
        title: "Page Limit Reached",
        description: `Only one Facebook page can be connected to Autex. You currently have "${pages[0].page_name}" connected. Please disconnect it first to connect a different page.`,
        variant: "destructive",
        duration: 6000,
      })
      return
    }
    
    setConnecting(true)
    // Redirect to OAuth flow
    window.location.href = '/auth/facebook/connect'
  }

  const handleDisconnectClick = (pageId: string, pageName: string) => {
    setDisconnectDialog({ open: true, pageId, pageName })
  }

  const handleDisconnectConfirm = async () => {
    const { pageId, pageName } = disconnectDialog

    try {
      const response = await fetch(`/api/facebook/pages?id=${pageId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to disconnect page')

      toast({
        title: 'Page Disconnected',
        description: `${pageName} has been disconnected`,
      })

      fetchPages()
      setDisconnectDialog({ open: false, pageId: '', pageName: '' })
    } catch (err) {
      console.error('Error disconnecting page:', err)
      toast({
        title: 'Error',
        description: 'Failed to disconnect page',
        variant: 'destructive',
      })
    }
  }

  const handleBotToggleClick = (pageId: string, pageName: string, currentState: boolean) => {
    if (currentState) {
      // If currently enabled, show confirmation dialog before disabling
      setDisableBotDialog({ open: true, pageId, pageName })
    } else {
      // If currently disabled, enable directly
      toggleBot(pageId, true)
    }
  }

  const handleDisableBotConfirm = () => {
    toggleBot(disableBotDialog.pageId, false)
    setDisableBotDialog({ open: false, pageId: '', pageName: '' })
  }

  const toggleBot = async (pageId: string, enabled: boolean) => {
    try {
      setToggling(pageId)
      
      const response = await fetch(`/api/facebook/pages/${pageId}/toggle-bot`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_enabled: enabled }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to update bot status')
      }

      const { page } = await response.json()
      
      // Update local state
      setPages(prev => prev.map(p => 
        p.id === pageId ? { ...p, bot_enabled: page.bot_enabled } : p
      ))

      toast({
        title: enabled ? '🤖 Bot Enabled' : '🛑 Bot Disabled',
        description: `Bot ${enabled ? 'enabled' : 'disabled'} for ${page.name}`,
      })
    } catch (err: any) {
      console.error('Error toggling bot:', err)
      toast({
        title: 'Error',
        description: err.message || 'Failed to update bot status',
        variant: 'destructive',
      })
    } finally {
      setToggling(null)
    }
  }

  const toggleIgBot = async (pageId: string, newState: boolean) => {
    setTogglingIg(pageId)
    try {
      const response = await fetch(`/api/facebook/pages/${pageId}/toggle-ig-bot`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ig_bot_enabled: newState }),
      })

      if (!response.ok) throw new Error('Failed to toggle Instagram bot state')

      // Update local state
      setPages(pages.map(p => 
        p.id === pageId ? { ...p, ig_bot_enabled: newState } : p
      ))

      toast({
        title: newState ? 'Instagram Bot Enabled' : 'Instagram Bot Disabled',
        description: newState 
          ? 'Bot will now respond to Instagram messages and comments' 
          : 'Bot will no longer respond to Instagram interactions',
      })
    } catch (err) {
      console.error('Error toggling Instagram bot:', err)
      toast({
        title: 'Error',
        description: 'Failed to update Instagram bot settings',
        variant: 'destructive',
      })
    } finally {
      setTogglingIg(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 w-full relative h-[200px]">
        <PremiumLoader className="bg-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50 dark:bg-green-900/10">
          <AlertDescription className="text-green-800 dark:text-green-200">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {pages.length === 0 ? (
        <div className="text-center py-12">
          <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
            <Facebook className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No Facebook Pages Connected</h3>
          <p className="text-muted-foreground mb-4">
            Connect your Facebook page to start automating customer conversations
          </p>
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border-2 border-zinc-500/20 border-t-zinc-500 animate-spin" />
                  Connecting...
                </div>
              </>
            ) : (
              <>
                <Facebook className="h-4 w-4 mr-2" />
                Connect Facebook Page
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Connected Page</h3>
          </div>

          <div className="space-y-3">
            {pages.map((page) => (
              <div
                key={page.id}
                className="p-4 rounded-lg border border-border bg-muted/30 space-y-4"
              >
                {/* Page Info Row - stacks on mobile */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage 
                        src={`https://graph.facebook.com/${page.id}/picture?type=normal`} 
                        alt={page.page_name}
                      />
                      <AvatarFallback className="bg-blue-100 dark:bg-blue-900/30">
                        <Facebook className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h4 className="font-semibold">{page.page_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Connected on {new Date(page.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDisconnectClick(page.id, page.page_name)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full sm:w-auto justify-center"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                </div>

                {/* Bot Toggle Row */}
                <div className="flex items-center justify-between p-3 rounded-md bg-background border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      page.bot_enabled 
                        ? 'bg-green-100 dark:bg-green-900/30' 
                        : 'bg-red-100 dark:bg-red-900/30'
                    }`}>
                      <Bot className={`h-4 w-4 ${
                        page.bot_enabled 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Bot Status</span>
                        <Badge 
                          variant={page.bot_enabled ? "default" : "destructive"}
                          className={page.bot_enabled 
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                            : ""
                          }
                        >
                          {page.bot_enabled ? '🤖 Active' : '🛑 Disabled'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {page.bot_enabled 
                          ? 'Bot automatically responds to customer messages' 
                          : 'Bot will not respond to any messages'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {toggling === page.id && (
                      <div className="h-4 w-4 rounded-full border-2 border-zinc-500/20 border-t-zinc-500 animate-spin" />
                    )}
                    <Switch
                      checked={page.bot_enabled}
                      onCheckedChange={() => handleBotToggleClick(page.id, page.page_name, page.bot_enabled)}
                      disabled={toggling === page.id}
                    />
                  </div>
                </div>

                {/* Instagram Status Row */}
                <div className="flex items-center justify-between p-3 rounded-md bg-background border border-border">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      page.instagram_account_id
                        ? 'bg-pink-100 dark:bg-pink-900/30' 
                        : 'bg-zinc-100 dark:bg-zinc-800'
                    }`}>
                      <span className="text-sm">
                        {page.instagram_account_id ? '📸' : '📷'}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">Instagram</span>
                        <Badge 
                          variant={page.instagram_account_id ? "default" : "secondary"}
                          className={page.instagram_account_id 
                            ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400 border-none" 
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 border-none"
                          }
                        >
                          {page.instagram_account_id ? 'Connected ✅' : 'Not Connected'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {page.instagram_account_id 
                          ? (page.ig_bot_enabled ? 'Bot automatically responds to Instagram messages' : 'Bot will not respond to Instagram interactions')
                          : 'Link an Instagram Business Account to your Facebook Page to enable DM automation'}
                      </p>
                    </div>
                  </div>
                  
                  {/* IG Toggle Switch */}
                  {page.instagram_account_id && (
                    <div className="flex items-center gap-2">
                      {togglingIg === page.id && (
                        <div className="h-4 w-4 rounded-full border-2 border-zinc-500/20 border-t-zinc-500 animate-spin" />
                      )}
                      <Switch
                        checked={page.ig_bot_enabled}
                        onCheckedChange={(checked) => toggleIgBot(page.id, checked)}
                        disabled={togglingIg === page.id}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Disconnect Confirmation Dialog */}
          <AlertDialog open={disconnectDialog.open} onOpenChange={(open) => setDisconnectDialog({ ...disconnectDialog, open })}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect Facebook Page?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to disconnect <strong>{disconnectDialog.pageName}</strong>? 
                  This will stop automated messaging for this page. You can reconnect it anytime.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDisconnectConfirm}
                  className="bg-destructive hover:bg-destructive/90 text-white"
                >
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Disable Bot Confirmation Dialog */}
          <AlertDialog open={disableBotDialog.open} onOpenChange={(open) => setDisableBotDialog({ ...disableBotDialog, open })}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disable Bot?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>
                    The bot will stop responding to <strong>ALL</strong> customers on <strong>{disableBotDialog.pageName}</strong>.
                  </p>
                  <p>
                    You'll need to reply manually to every message. Continue?
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDisableBotConfirm}
                  className="bg-destructive hover:bg-destructive/90 text-white"
                >
                  Disable Bot
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}

