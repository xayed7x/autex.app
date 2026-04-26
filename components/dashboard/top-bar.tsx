"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ThemeToggle } from "@/components/theme-toggle"
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
import { SubscriptionCard } from "@/components/dashboard/subscription-card"
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
import { useWorkspace } from "@/lib/workspace-provider"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { playNotificationSound } from "@/lib/notification-sound"
import { NotificationToast, type CustomNotification } from "@/components/dashboard/notification-toast"
import { useNotifications } from "@/hooks/use-notifications"
import { usePWAInstall } from "@/hooks/use-pwa-install"
import { Download, BellOff } from "lucide-react"

interface TopBarProps {
  title?: string
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

// Gradient colors for avatars - premium vibrant palette
const AVATAR_GRADIENTS = [
  'from-violet-500 to-purple-600',
  'from-pink-500 to-rose-600',
  'from-orange-500 to-amber-600',
  'from-emerald-500 to-teal-600',
  'from-blue-500 to-indigo-600',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-pink-600',
  'from-lime-500 to-green-600',
]

// Get consistent gradient based on string hash
function getAvatarGradient(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length
  return AVATAR_GRADIENTS[index]
}

export function TopBar({ title }: TopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [mobileSearchQuery, setMobileSearchQuery] = useState("")
  const [userData, setUserData] = useState<UserData | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [customQueue, setCustomQueue] = useState<CustomNotification[]>([])
  const { needsReplyCount, unreadConversationsCount, pendingOrdersCount, loading: workspaceLoading } = useWorkspace()
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  
  const { isSubscribed, subscribe, permission } = useNotifications()
  const { isInstallable, installApp, isIos } = usePWAInstall()

  // Auto-dismiss custom notifications after 5 seconds
  useEffect(() => {
    if (customQueue.length > 0) {
      const timer = setTimeout(() => {
        setCustomQueue((prev) => prev.slice(1))
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [customQueue])

  const addCustomNotification = (notif: CustomNotification) => {
    setCustomQueue((prev) => [...prev, notif])
    playNotificationSound()
  }

  const handleDismiss = (id: string) => {
    setCustomQueue((prev) => prev.filter((n) => n.id !== id))
  }
  
  // Combined count for the bell badge: Actionable Conversations + Unread Notifications + Unread Conversations
  const unreadSystemNotifsCount = notifications.filter((n) => n.unread).length
  const totalNotifications = needsReplyCount + unreadSystemNotifsCount + unreadConversationsCount

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
          const lastSeenAt = localStorage.getItem('last_seen_order_at')
          const lastSeenTime = lastSeenAt ? new Date(lastSeenAt).getTime() : 0

          const formatted: Notification[] = orders.map(order => {
            const orderTime = new Date(order.created_at).getTime()
            return {
              id: order.id,
              title: "New order received",
              description: `Order #${order.order_number || 'N/A'} from ${order.customer_name}`,
              time: formatDistanceToNow(new Date(order.created_at), { addSuffix: true }),
              unread: orderTime > lastSeenTime, // Use persistence for unread state
              link: `/dashboard/orders`
            }
          })
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
             
             // Trigger Messenger-style notification and sound
             addCustomNotification({
               id: newOrder.id,
               type: "order",
               title: "নতুন অর্ডার! 🛍️",
               subtitle: `${newOrder.customer_name} - ${newOrder.order_number || 'অর্ডার'}`,
               href: "/dashboard/orders"
             })

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
  const avatarGradient = getAvatarGradient(displayName + (userData?.email || ''))

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between h-16 px-6 lg:px-8 max-w-[1600px] mx-auto">
        {/* Left: Mobile menu + Title */}
        <div className="flex items-center gap-4">
          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" className="-ml-2 text-muted-foreground hover:text-foreground">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 border-r border-border/50 bg-background/95 backdrop-blur-xl">
              {/* Logo + Theme Toggle (matching desktop) */}
              <div className="px-6 py-6 border-b border-border/50 flex items-center justify-between">
                <Link 
                  href="/dashboard" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3"
                >
                  <div className="h-8 w-8 relative rounded-md overflow-hidden">
                     <Image
                      src="/autex logo.png"
                      alt="Autex Logo"
                      fill
                      className="object-cover rounded-md"
                    />
                  </div>
                  <span className="text-xl font-serif tracking-tight">Autex AI</span>
                </Link>
                <ThemeToggle />
              </div>
              {/* Navigation */}
              <nav className="flex-1 px-4 py-6 space-y-1">
                {navigation.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-primary/10 text-primary shadow-sm"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      )}
                    >
                      <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                      {item.name}
                    </Link>
                  )
                })}
              </nav>
              {/* Subscription Status Card - Dynamic (same as desktop) */}
              <SubscriptionCard />
            </SheetContent>
          </Sheet>

          {/* Page Title (Hidden on mobile if search is active could be an enhancement) */}
          <h1 className="text-lg lg:text-xl font-serif tracking-tight text-foreground/90">{title}</h1>
        </div>

        {/* Center: Search (Floating Glass pill) */}
        <div className="hidden md:flex flex-1 max-w-xl mx-8">
          <div className="relative w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors duration-300" />
            <Input 
              placeholder={pathname.includes('/products') ? "Search products by name, SKU..." : "Search orders by ID, customer..."}
              className="pl-10 h-10 rounded-full bg-secondary/50 border-transparent focus-visible:bg-background focus-visible:border-primary/20 focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-300 shadow-sm hover:bg-secondary/80"
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
            {/* Keyboard shortcut hint */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-1 opacity-50">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </div>
        </div>

        {/* Right: Notifications + Profile */}
        <div className="flex items-center gap-3">
          {/* Mobile Search */}
          <Sheet open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden text-muted-foreground">
                <Search className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="top" className="p-4 pt-10">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder={pathname.includes('/products') ? "Search products..." : "Search orders, customers..."}
                  value={mobileSearchQuery}
                  onChange={(e) => setMobileSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-base"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && mobileSearchQuery.trim()) {
                      if (pathname.includes('/products')) {
                        router.push(`/dashboard/products?search=${encodeURIComponent(mobileSearchQuery)}`)
                      } else {
                        router.push(`/dashboard/orders?search=${encodeURIComponent(mobileSearchQuery)}`)
                      }
                      setMobileSearchOpen(false)
                      setMobileSearchQuery("")
                    }
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Press Enter to search
              </p>
            </SheetContent>
          </Sheet>



          {/* Enable Notifications Button (If not subscribed and permission not denied) */}
          {!isSubscribed && permission !== 'denied' && (
             <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 rounded-full bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border border-orange-500/20 transition-all duration-300 group"
              onClick={subscribe}
              title="Enable Desktop Notifications"
            >
              <BellOff className="h-4 w-4" />
            </Button>
          )}

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full bg-secondary/50 hover:bg-secondary border border-transparent hover:border-border/50 transition-all duration-300 group">
                <Bell className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                {totalNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-600 px-[3px] text-[9px] font-bold text-white ring-2 ring-background transition-transform group-hover:scale-110">
                    {totalNotifications > 99 ? '99+' : totalNotifications}
                  </span>
                )}
                <span className="sr-only">Notifications</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              className="w-[380px] p-0 rounded-xl border-border/60 shadow-xl backdrop-blur-xl bg-background/95"
              onCloseAutoFocus={(e) => {
                // Mark all as read when closing the dropdown
                setNotifications(prev => prev.map(n => ({ ...n, unread: false })))
                localStorage.setItem('last_seen_order_at', new Date().toISOString())
              }}
            >
              <div className="flex items-center justify-between p-4 border-b border-border/40">
                <h4 className="font-semibold text-sm">Notifications</h4>
                {totalNotifications > 0 && <Badge variant="secondary" className="text-xs text-primary bg-primary/10">{totalNotifications} items</Badge>}
              </div>
              
              <div className="max-h-[400px] overflow-y-auto py-1">
                {needsReplyCount > 0 && (
                  <DropdownMenuItem 
                    className="mx-2 my-1 p-3 cursor-pointer bg-orange-50/50 dark:bg-orange-950/20 rounded-lg border border-orange-200/50 dark:border-orange-800/30 focus:bg-orange-100 dark:focus:bg-orange-900/40"
                    onClick={() => router.push('/dashboard/conversations?filter=needs_reply')}
                  >
                    <div className="flex gap-3 w-full">
                       <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0 text-orange-600 dark:text-orange-400">
                         <Bot className="h-4 w-4" />
                       </div>
                       <div className="flex-1 space-y-1">
                         <div className="flex items-center justify-between">
                           <span className="font-medium text-sm text-foreground">Action Required</span>
                           <span className="text-[10px] text-muted-foreground">Now</span>
                         </div>
                         <p className="text-xs text-muted-foreground leading-relaxed">
                           <span className="font-semibold text-orange-600 dark:text-orange-400">{needsReplyCount} conversation{needsReplyCount > 1 ? 's' : ''}</span> need your manual attention.
                         </p>
                       </div>
                    </div>
                  </DropdownMenuItem>
                )}
                
                {notifications.map((notification) => (
                   <DropdownMenuItem 
                    key={notification.id} 
                    className={cn(
                      "mx-2 my-1 p-3 cursor-pointer rounded-lg focus:bg-secondary/50",
                      notification.unread && "bg-secondary/30"
                    )}
                    onClick={() => router.push(notification.link)}
                  >
                    <div className="flex gap-3 w-full">
                       <div className={cn(
                         "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                         notification.unread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                       )}>
                         <ShoppingBag className="h-4 w-4" />
                       </div>
                       <div className="flex-1 space-y-1">
                         <div className="flex items-center justify-between">
                           <span className={cn("text-sm", notification.unread ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>{notification.title}</span>
                           <span className="text-[10px] text-muted-foreground">{notification.time}</span>
                         </div>
                         <p className="text-xs text-muted-foreground line-clamp-2">{notification.description}</p>
                       </div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </div>
              
              <div className="p-2 border-t border-border/40">
                <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground h-8">
                  View all activity
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full ring-2 ring-transparent hover:ring-border/50 transition-all pl-0 pr-0 overflow-hidden group">
                <Avatar className="h-9 w-9 transition-transform duration-300 group-hover:scale-105">
                  <AvatarImage src={userData?.avatar_url} alt={displayName} className="object-cover" />
                  <AvatarFallback className={cn(
                    "bg-gradient-to-br text-white font-semibold text-sm shadow-inner",
                    avatarGradient
                  )}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 p-2 rounded-xl border-border/60 shadow-xl backdrop-blur-xl bg-background/95">
              <div className="flex items-center gap-3 p-2 mb-1">
                <div className={cn(
                  "h-10 w-10 rounded-full overflow-hidden flex items-center justify-center font-semibold text-white text-sm bg-gradient-to-br shadow-inner",
                  userData?.avatar_url ? '' : avatarGradient
                )}>
                  {userData?.avatar_url ? (
                    <Image src={userData.avatar_url} alt="Profile" width={40} height={40} className="object-cover h-full w-full" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="font-semibold text-sm truncate">{displayName}</span>
                  <span className="text-xs text-muted-foreground truncate font-normal">{userData?.email}</span>
                </div>
              </div>
              <DropdownMenuSeparator className="my-1 bg-border/50" />
              <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                <Link href="/dashboard/settings">
                  <User className="mr-2 h-4 w-4 text-muted-foreground" />
                  Profile Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                <Link href="/dashboard/settings?tab=billing">
                  <BarChart3 className="mr-2 h-4 w-4 text-muted-foreground" />
                  Billing & Plans
                </Link>
              </DropdownMenuItem>
               <DropdownMenuItem asChild className="rounded-lg cursor-pointer">
                <Link href="/dashboard/help">
                  <Bot className="mr-2 h-4 w-4 text-muted-foreground" />
                  Help & Support
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1 bg-border/50" />
              <DropdownMenuItem className="text-red-600 dark:text-red-400 rounded-lg cursor-pointer focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <NotificationToast queue={customQueue} onDismiss={handleDismiss} />
    </header>
  )
}
