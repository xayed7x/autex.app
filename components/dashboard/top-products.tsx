"use client"

import { useEffect, useState } from "react"
import { SmartCard } from "@/components/ui/premium/smart-card"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Flame } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface TopProduct {
  id: string
  name: string
  soldQuantity: number
  revenue: number
  category?: string
  product_attributes?: {
    weight?: string;
    [key: string]: any;
  };
}

export function TopProducts() {
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTopProducts()
  }, [])

  const fetchTopProducts = async () => {
    try {
      const response = await fetch('/api/dashboard/top-products?limit=5')
      if (response.ok) {
        const data = await response.json()
        setTopProducts(data.topProducts || [])
      }
    } catch (error) {
      console.error('Failed to fetch top products:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SmartCard className="w-full">
      <CardHeader className="pb-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">
            <Flame className="h-5 w-5" />
          </div>
          <CardTitle className="text-lg font-serif tracking-wide">Top Products</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-6 flex-1">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        ) : topProducts.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">No sales data yet</div>
        ) : (
          <div className="space-y-4">
            {topProducts.map((product, index) => (
              <div key={product.id} className="group flex items-center gap-4 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <span className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset",
                  index === 0 ? "bg-yellow-100 text-yellow-700 ring-yellow-600/20 dark:bg-yellow-500/10 dark:text-yellow-400 dark:ring-yellow-500/40" :
                  index === 1 ? "bg-gray-100 text-gray-700 ring-gray-500/20 dark:bg-gray-500/10 dark:text-gray-400 dark:ring-gray-500/40" :
                  index === 2 ? "bg-orange-50 text-orange-700 ring-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/40" :
                  "bg-muted text-muted-foreground ring-border"
                )}>
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-sm group-hover:text-primary transition-colors">
                    {product.category === 'food' ? (() => {
                      let weight = product.product_attributes?.weight || product.name;
                      if (weight && !isNaN(Number(weight))) {
                        weight = `${weight} Pound`;
                      }
                      return weight;
                    })() : product.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{product.soldQuantity} sold</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold font-mono">৳{product.revenue.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 pt-4 border-t border-border/40 text-center">
            <Link href="/dashboard/products" className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest">
            View All Inventory →
            </Link>
        </div>
      </CardContent>
    </SmartCard>
  )
}
