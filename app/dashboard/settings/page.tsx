"use client"

import { useState, useEffect } from "react"
import { TopBar } from "@/components/dashboard/top-bar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { User, Facebook, Bell, CreditCard, Save, Loader2 } from "lucide-react"
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
    business_name: "",
    phone: "",
    workspace_name: ""
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
        business_name: settingsData.user.business_name || "",
        phone: settingsData.user.phone || "",
        workspace_name: settingsData.workspace?.name || ""
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
                <CardDescription>Update your business information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="business-name">Business Name</Label>
                    <Input
                      id="business-name"
                      value={formData.business_name}
                      onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="workspace-name">Workspace Name</Label>
                    <Input
                      id="workspace-name"
                      value={formData.workspace_name}
                      onChange={(e) => setFormData({ ...formData, workspace_name: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="mt-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={data?.user.email || ""}
                      disabled
                      className="mt-1.5 bg-muted"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
                  </div>
                </div>
                <Button onClick={handleSave} disabled={saving}>
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
              <CardContent className="py-12 text-center">
                <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
                  <Facebook className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Facebook Pages</h3>
                <p className="text-muted-foreground mb-4">
                  Facebook page management will be available here
                </p>
                <Badge variant="secondary">Coming Soon</Badge>
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
