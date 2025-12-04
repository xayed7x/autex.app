"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import {
  Search,
  Bell,
  Menu,
  User,
  Settings,
  LogOut,
  LayoutDashboard,
  Package,
  ShoppingBag,
  MessageSquare,
  BarChart3,
  Bot,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface TopBarProps {
  title: string
}

interface UserData {
  email: string
  business_name?: string
  avatar_url?: string
}

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Orders", href: "/dashboard/orders", icon: Package },
  { name: "Products", href: "/dashboard/products", icon: ShoppingBag },
  { name: "Conversations", href: "/dashboard/conversations", icon: MessageSquare },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "AI Setup", href: "/dashboard/ai-setup", icon: Bot },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

import { formatDistanceToNow } from "date-fns"

interface Notification {
  id: string
  title: string
  description: string
  time: string
  unread: boolean
  link: string
}




// Helper function to get initials from name or email
function getInitials(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }
  
  if (email) {
    return email.substring(0, 2).toUpperCase()
  }
  
  return 'U'
}

export function TopBar({ title }: TopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const unreadCount = notifications.filter((n) => n.unread).length

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) return

      // 1. Get Workspace
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (!workspace) return

      // 2. Get Connected Page
      const { data: page } = await supabase
        .from('facebook_pages')
        .select('page_name, id')
        .eq('workspace_id', workspace.id)
        .eq('status', 'connected')
        .single()

      // 3. Get User Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('business_name')
        .eq('id', user.id)
        .single()
      
      // 4. Get User Avatar
      const { data: publicUser } = await supabase
        .from('users')
        .select('avatar_url')
        .eq('id', user.id)
        .single()

      // Determine Display Name
      // Priority: Connected Page Name -> Business Name -> "Autex AI"
      let displayName = 'Autex AI'
      
      const isDefaultName = (name?: string) => {
        if (!name) return true
        const normalized = name.trim().toLowerCase()
        return normalized === 'code and cortex' || normalized === 'code & cortex'
      }

      if (page?.page_name) {
        displayName = page.page_name
      } else if (profile?.business_name && !isDefaultName(profile.business_name)) {
        displayName = profile.business_name
      }

      setUserData({
        email: user.email || '',
        business_name: displayName,
        avatar_url: publicUser?.avatar_url || undefined,
      })

      // 5. Fetch Notifications (Orders) for this Workspace & Page
      if (page) {
        const { data: orders } = await supabase
          .from('orders')
          .select('*')
          .eq('workspace_id', workspace.id)
          .eq('fb_page_id', page.id) // Filter by connected page
          .order('created_at', { ascending: false })
          .limit(5)
        
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

        // 6. Subscribe to Realtime Orders for this Page
        const channel = supabase
          .channel(`realtime-orders-${page.id}`)
          .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'orders',
            filter: `fb_page_id=eq.${page.id}` // Filter realtime events by page
          }, (payload) => {
             const newOrder = payload.new as any
             const newNotification: Notification = {
               id: newOrder.id,
               title: "New order received",
               description: `Order #${newOrder.order_number || 'N/A'} from ${newOrder.customer_name}`,
               time: "Just now",
               unread: true,
               link: `/dashboard/orders`
             }
             
             setNotifications(prev => [newNotification, ...prev].slice(0, 5))
             
             toast({
               title: "New Order Received! 🎉",
               description: `Order #${newOrder.order_number || 'N/A'} from ${newOrder.customer_name}`,
               action: (
                 <div 
                   className="h-full w-full absolute inset-0 cursor-pointer" 
                   onClick={() => router.push('/dashboard/orders')}
                 />
               ),
             })
          })
          .subscribe()

        return () => {
          supabase.removeChannel(channel)
        }
      } else {
        setNotifications([]) // Clear notifications if no page connected
      }

    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const displayName = userData?.business_name || 'Autex AI'
  const initials = getInitials(displayName, userData?.email)

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="flex items-center justify-between h-16 px-4 lg:px-6">
        {/* Left: Mobile menu + Title */}
        <div className="flex items-center gap-4">
          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              {/* Logo */}
              <div className="flex items-center gap-2 px-6 py-5 border-b border-border">
                <Image
                  src="/Autex logo trasparent (1).png"
                  alt="Autex Logo"
                  width={32}
                  height={32}
                  className="object-contain"
                />
                <span className="text-xl font-semibold">Autex</span>
              </div>
              {/* Navigation */}
              <nav className="flex-1 px-3 py-4 space-y-1">
                {navigation.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.name}
                    </Link>
                  )
                })}
              </nav>
              {/* Plan Usage */}
              <div className="p-4 mx-3 mb-4 rounded-lg bg-accent/50 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Plan: Starter</span>
                </div>
                <div className="mb-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>280/300 screenshots</span>
                    <span className="text-amber-600 dark:text-amber-400 font-medium">93%</span>
                  </div>
                  <Progress value={93} className="h-2 [&>div]:bg-amber-500" />
                </div>
                <Button variant="outline" size="sm" className="w-full text-xs bg-transparent">
                  Upgrade Plan
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <h1 className="text-lg font-semibold">{title}</h1>
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder={pathname.includes('/products') ? "Search products..." : "Search orders..."}
              className="pl-9 bg-muted/50" 
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const query = e.currentTarget.value
                  if (!query.trim()) return
                  
                  if (pathname.includes('/products')) {
                    router.push(`/dashboard/products?search=${encodeURIComponent(query)}`)
                  } else {
                    router.push(`/dashboard/orders?search=${encodeURIComponent(query)}`)
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Right: Notifications + Profile */}
        <div className="flex items-center gap-2">
          {/* Mobile Search */}
          <Button variant="ghost" size="icon" className="md:hidden">
            <Search className="h-5 w-5" />
            <span className="sr-only">Search</span>
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs font-semibold text-primary">
                    {unreadCount}
                  </span>
                )}
                <span className="sr-only">Notifications</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.map((notification) => (
                <DropdownMenuItem 
                  key={notification.id} 
                  className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                  onClick={() => router.push(notification.link)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <span className={cn("font-medium text-sm", notification.unread && "text-primary")}>
                      {notification.title}
                    </span>
                    {notification.unread && <span className="h-2 w-2 rounded-full bg-primary ml-auto" />}
                  </div>
                  <span className="text-xs text-muted-foreground">{notification.description}</span>
                  <span className="text-xs text-muted-foreground">{notification.time}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-center text-sm text-primary cursor-pointer">
                View all notifications
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={userData?.avatar_url} alt={displayName} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{displayName}</span>
                  <span className="text-xs text-muted-foreground font-normal">{userData?.email || 'Loading...'}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive cursor-pointer" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
