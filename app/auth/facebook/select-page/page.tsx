"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Facebook, Loader2, ArrowLeft, Users } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface FacebookPage {
  id: string
  name: string
  access_token: string
  category: string
}

export default function SelectPagePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [pages, setPages] = useState<FacebookPage[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string>("")

  useEffect(() => {
    fetchPages()
  }, [])

  const fetchPages = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/facebook/temp-pages")
      
      if (!response.ok) {
        throw new Error("Failed to fetch pages")
      }
      
      const data = await response.json()
      
      if (!data.pages || data.pages.length === 0) {
        toast({
          title: "No Pages Found",
          description: "You don't have any Facebook pages to connect.",
          variant: "destructive"
        })
        router.push("/dashboard/settings?tab=facebook")
        return
      }
      
      setPages(data.pages)
      // Auto-select first page
      setSelectedPageId(data.pages[0].id)
      
    } catch (error) {
      console.error("Error fetching pages:", error)
      toast({
        title: "Error",
        description: "Failed to load your Facebook pages",
        variant: "destructive"
      })
      router.push("/dashboard/settings?tab=facebook")
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!selectedPageId) {
      toast({
        title: "No Page Selected",
        description: "Please select a page to connect",
        variant: "destructive"
      })
      return
    }

    try {
      setConnecting(true)
      
      const selectedPage = pages.find(p => p.id === selectedPageId)
      if (!selectedPage) {
        throw new Error("Selected page not found")
      }

      const response = await fetch("/api/facebook/connect-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: selectedPage.id,
          pageName: selectedPage.name,
          accessToken: selectedPage.access_token,
        })
      })

      const result = await response.json()

      if (!response.ok) {
        // Check if it's the "only one page" error
        if (result.currentPage) {
          toast({
            title: "Page Limit Reached",
            description: `Only one Facebook page can be connected to Autex. You currently have "${result.currentPage}" connected. Please disconnect it first to connect a different page.`,
            variant: "destructive",
            duration: 7000,
          })
        } else {
          throw new Error(result.error || "Failed to connect page")
        }
        
        // Redirect back to settings
        setTimeout(() => {
          router.push("/dashboard/settings?tab=facebook")
        }, 2000)
        return
      }

      toast({
        title: "Success! 🎉",
        description: `${selectedPage.name} has been connected successfully`,
      })

      // Redirect to settings with Facebook tab active
      router.push("/dashboard/settings?tab=facebook&success=connected")
      
    } catch (error) {
      console.error("Error connecting page:", error)
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect page",
        variant: "destructive"
      })
    } finally {
      setConnecting(false)
    }
  }

  const handleCancel = () => {
    router.push("/dashboard/settings?tab=facebook")
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your Facebook pages...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Settings
          </Button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Facebook className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Select Your Facebook Page</h1>
              <p className="text-muted-foreground">Choose which page to connect to Autex</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your Facebook Pages</CardTitle>
            <CardDescription>
              Select the page you want to use for automated customer conversations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={selectedPageId} onValueChange={setSelectedPageId}>
              {pages.map((page) => (
                <div
                  key={page.id}
                  className="flex items-start space-x-3 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedPageId(page.id)}
                >
                  <RadioGroupItem value={page.id} id={page.id} className="mt-1" />
                  <Label htmlFor={page.id} className="flex-1 cursor-pointer">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-base">{page.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {page.category}
                        </p>
                      </div>
                      <Facebook className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleConnect}
                disabled={connecting || !selectedPageId}
                className="flex-1"
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Facebook className="h-4 w-4 mr-2" />
                    Connect Selected Page
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={connecting}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-border">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> By connecting your Facebook page, you authorize Autex to send and receive messages on your behalf. You can disconnect at any time from the Settings page.
          </p>
        </div>
      </div>
    </div>
  )
}
