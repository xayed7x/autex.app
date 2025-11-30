import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Zap, Plus, BarChart3, Bot, MessageSquare } from "lucide-react"
import Link from "next/link"

export function QuickActions() {
  return (
    <Card className="bg-card border border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <Button asChild className="w-full justify-start gap-2">
          <Link href="/dashboard/products/new">
            <Plus className="h-4 w-4" />
            Add Product
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full justify-start gap-2 bg-transparent">
          <Link href="/dashboard/analytics">
            <BarChart3 className="h-4 w-4" />
            View Analytics
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full justify-start gap-2 bg-transparent">
          <Link href="/dashboard/ai-setup">
            <Bot className="h-4 w-4" />
            AI Settings
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full justify-start gap-2 bg-transparent">
          <Link href="/dashboard/conversations">
            <MessageSquare className="h-4 w-4" />
            View All Chats
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
