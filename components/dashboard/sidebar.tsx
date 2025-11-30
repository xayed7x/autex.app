"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ThemeToggle } from "@/components/theme-toggle"
import { LayoutDashboard, Package, ShoppingBag, MessageSquare, BarChart3, Bot, Settings } from "lucide-react"

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Orders", href: "/dashboard/orders", icon: Package },
  { name: "Products", href: "/dashboard/products", icon: ShoppingBag },
  { name: "Conversations", href: "/dashboard/conversations", icon: MessageSquare },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "AI Setup", href: "/dashboard/ai-setup", icon: Bot },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Image
            src="/Autex logo trasparent (1).png"
            alt="Autex Logo"
            width={32}
            height={32}
            className="object-contain"
          />
          <span className="text-xl font-semibold text-sidebar-foreground">Autex</span>
        </div>
        <ThemeToggle />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-[3px] border-primary -ml-[3px] pl-[calc(0.75rem+3px)]"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Plan Usage Widget */}
      <div className="p-4 mx-3 mb-4 rounded-lg bg-sidebar-accent/50 border border-sidebar-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-sidebar-foreground/70">Plan: Starter</span>
        </div>
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-sidebar-foreground">280/300 screenshots</span>
            <span className="text-amber-600 dark:text-amber-400 font-medium">93%</span>
          </div>
          <Progress value={93} className="h-2 bg-sidebar-border [&>div]:bg-amber-500" />
        </div>
        <Button variant="outline" size="sm" className="w-full text-xs bg-transparent">
          Upgrade Plan
        </Button>
      </div>
    </aside>
  )
}
