import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface StatsCardProps {
  title: string
  value: string
  trend: {
    value: string
    direction: "up" | "down"
    isPositive: boolean
  }
  comparison: string
  icon: LucideIcon
  isCurrency?: boolean
}

export function StatsCard({ title, value, trend, comparison, icon: Icon, isCurrency = false }: StatsCardProps) {
  return (
    <Card className="bg-card border border-border shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className={cn("text-3xl font-bold mt-2", isCurrency && "font-mono")}>{value}</p>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={cn(
                  "text-sm font-medium",
                  trend.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                )}
              >
                {trend.value} {trend.direction === "up" ? "↗️" : "↘️"}
              </span>
              <span className="text-xs text-muted-foreground">{comparison}</span>
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
