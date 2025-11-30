"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Flame } from "lucide-react"
import Link from "next/link"

interface TopProduct {
  id: string
  name: string
  soldQuantity: number
  revenue: number
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
    <Card className="bg-card border border-border shadow-sm h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          <CardTitle className="text-lg font-semibold">Top Products</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading...</div>
        ) : topProducts.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">No sales data yet</div>
        ) : (
          <div className="space-y-4">
            {topProducts.map((product, index) => (
              <div key={product.id} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.soldQuantity} sold • ৳{product.revenue.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <Link href="/dashboard/products" className="inline-flex items-center text-sm text-primary hover:underline mt-4">
          View All →
        </Link>
      </CardContent>
    </Card>
  )
}
