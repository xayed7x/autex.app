"use client"

import { useState, useEffect } from "react"
import { TopBar } from "@/components/dashboard/top-bar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { User, Facebook, Bell, CreditCard, Save, Loader2, AlertCircle, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<SettingsData | null>(null)
  const [formData, setFormData] = useState({
    business_name: ""
  })
  const { toast } = useToast()

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
      setFormData({
        business_name: settingsData.user.business_name || ""
      })
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

  const handleSave = async () => {
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

  if (loading) {
    return (
      <>
        <TopBar title="Settings" />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar title="Settings" />

      <div className="p-4 lg:p-6 space-y-6">
        <h2 className="text-2xl font-semibold">Settings</h2>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50 w-full justify-start overflow-x-auto">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="facebook" className="flex items-center gap-2">
              <Facebook className="h-4 w-4" />
              Facebook
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Billing
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="mt-6">
            <Card className="bg-card border border-border shadow-sm">
              <CardHeader>
                <CardTitle>Business Profile</CardTitle>
                <CardDescription>
                  Manage your business information displayed in the dashboard
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
                  <div className="space-y-2">
                    <Label htmlFor="business-name">
                      Business Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="business-name"
                      value={formData.business_name}
                      onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                      placeholder="e.g., Code and Cortex"
                      className="mt-1.5"
                    />
                    <p className="text-xs text-muted-foreground">
                      Displayed in the dashboard header and profile menu
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Account Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={data?.user.email || ""}
                      disabled
                      className="mt-1.5 bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used for login, billing, and important notifications
                    </p>
                  </div>
                </div>
                
                <div className="pt-4 border-t max-w-2xl">
                  <Button onClick={handleSave} disabled={saving || !formData.business_name}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Facebook Tab */}
          <TabsContent value="facebook" className="mt-6">
            <Card className="bg-card border border-border shadow-sm">
              <CardHeader>
                <CardTitle>Facebook Integration</CardTitle>
                <CardDescription>Connect your Facebook pages for automated messaging</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FacebookPagesSection />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-6">
            <Card className="bg-card border border-border shadow-sm">
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Manage your notification settings</CardDescription>
              </CardHeader>
              <CardContent className="py-12 text-center">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Bell className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Notifications</h3>
                <p className="text-muted-foreground mb-4">
                  Notification preferences will be available here
                </p>
                <Badge variant="secondary">Coming Soon</Badge>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="mt-6">
            <Card className="bg-card border border-border shadow-sm">
              <CardHeader>
                <CardTitle>Billing & Subscription</CardTitle>
                <CardDescription>Manage your subscription and billing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
                  <div>
                    <h3 className="text-lg font-bold">
                      {data?.workspace?.subscription_status === "free_trial" ? "Free Trial" : "Starter"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {data?.workspace?.subscription_status === "free_trial" 
                        ? "14 days remaining" 
                        : "৳499/month"}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {data?.workspace?.subscription_status === "free_trial" ? "Trial" : "Active"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground text-center py-4">
                  Billing management coming soon
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

// Facebook Pages Section Component
function FacebookPagesSection() {
  const [pages, setPages] = useState<Array<{ id: string; page_name: string; created_at: string }>>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [disconnectDialog, setDisconnectDialog] = useState<{ open: boolean; pageId: string; pageName: string }>({
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
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
                className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30"
              >
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
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
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
        </div>
      )}
    </div>
  )
}

