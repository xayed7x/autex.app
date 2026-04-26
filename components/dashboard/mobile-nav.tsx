"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useWorkspace } from "@/lib/workspace-provider"
import { Home, Package, ShoppingBag, MessageSquare, Settings } from "lucide-react"

const mobileNav = [
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "Orders", href: "/dashboard/orders", icon: Package },
  { name: "Products", href: "/dashboard/products", icon: ShoppingBag },
  { name: "Chats", href: "/dashboard/conversations", icon: MessageSquare },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function MobileNav() {
  const pathname = usePathname()
  const { needsReplyCount, unreadConversationsCount, pendingOrdersCount } = useWorkspace()

  // Hide bottom navbar on conversation page to maximize space
  if (pathname === '/dashboard/conversations') return null

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
      <div className="flex items-center justify-around py-2">
        {mobileNav.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors relative",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div className="relative">
                <item.icon className="h-5 w-5" />
                {item.name === "Chats" && unreadConversationsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-background">
                    {unreadConversationsCount > 9 ? '9+' : unreadConversationsCount}
                  </span>
                )}
                {item.name === "Orders" && pendingOrdersCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white ring-2 ring-background">
                    {pendingOrdersCount > 9 ? '9+' : pendingOrdersCount}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{item.name}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
