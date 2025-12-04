"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Facebook, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

export function RequireFacebookPage({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [hasPage, setHasPage] = useState(false)
  const router = useRouter()

  useEffect(() => {
    checkPage()
  }, [])

  const checkPage = async () => {
    try {
      const response = await fetch('/api/facebook/pages')
      if (response.ok) {
        const data = await response.json()
        if (data.pages && data.pages.length > 0) {
          setHasPage(true)
        }
      }
    } catch (error) {
      console.error('Failed to check Facebook page:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (hasPage) {
    return <>{children}</>
  }

  return (
    <div className="flex items-center justify-center h-[calc(100vh-4rem)] p-4">
      <Card className="max-w-md w-full text-center border-dashed">
        <CardHeader>
          <div className="mx-auto bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full mb-4">
            <Facebook className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle>Connect Your Facebook Page</CardTitle>
          <CardDescription>
            You need to connect a Facebook page to access this feature. 
            Connect your page to start managing orders, products, and conversations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            className="w-full" 
            onClick={() => {
              setConnecting(true)
              window.location.href = '/auth/facebook/connect'
            }}
            disabled={connecting}
          >
            {connecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Facebook className="mr-2 h-4 w-4" />
            )}
            {connecting ? 'Connecting...' : 'Connect Page'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
