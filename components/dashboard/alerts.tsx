import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, AlertTriangle, Info } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface Alert {
  id: string
  type: "warning" | "danger" | "info"
  message: string
  href: string
}

const alerts: Alert[] = [
  { id: "1", type: "warning", message: "3 orders need payment verification", href: "/dashboard/orders?filter=pending" },
  {
    id: "2",
    type: "danger",
    message: "AI usage at 280/300 screenshots (93% used) - Upgrade?",
    href: "/dashboard/settings/billing",
  },
  {
    id: "3",
    type: "info",
    message: "New feature: Multi-product cart now available",
    href: "/dashboard/settings/features",
  },
]

const alertConfig = {
  warning: {
    icon: AlertTriangle,
    className: "text-amber-600 dark:text-amber-400",
    bgClassName: "bg-amber-50 dark:bg-amber-900/20",
  },
  danger: {
    icon: AlertCircle,
    className: "text-red-600 dark:text-red-400",
    bgClassName: "bg-red-50 dark:bg-red-900/20",
  },
  info: { icon: Info, className: "text-blue-600 dark:text-blue-400", bgClassName: "bg-blue-50 dark:bg-blue-900/20" },
}

export function Alerts() {
  if (alerts.length === 0) return null

  return (
    <Card className="bg-card border border-border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-lg font-semibold">Alerts</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {alerts.map((alert) => {
          const config = alertConfig[alert.type]
          const Icon = config.icon
          return (
            <Link
              key={alert.id}
              href={alert.href}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg transition-colors hover:opacity-80",
                config.bgClassName,
              )}
            >
              <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", config.className)} />
              <span className={cn("text-sm font-medium", config.className)}>{alert.message}</span>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
