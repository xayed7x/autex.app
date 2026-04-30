import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { ExternalLink, ShoppingCart } from "lucide-react"

interface Product {
  id: string
  name: string
  price: number
  imageUrl: string
  description?: string
  category?: string
}

interface ProductCardProps {
  product: Product
  onOrderNow: (productId: string) => void
  onViewDetails: (productId: string) => void
}

export function ProductCard({ product, onOrderNow, onViewDetails }: ProductCardProps) {
  return (
    <Card className="w-64 overflow-hidden shadow-md border-border/50">
      <div className="aspect-square relative bg-muted">
        {product.imageUrl ? (
          <img 
            src={product.imageUrl} 
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            No Image
          </div>
        )}
      </div>
      
      <CardContent className="p-1.5 pb-0">
        <p className="text-primary font-bold text-xs">
          {product.name} — {product.price.toLocaleString()}
        </p>
      </CardContent>
      
      <CardFooter className="p-1.5 pt-1.5 flex flex-col gap-1">
        <Button 
          className="w-full h-7 text-[10px]" 
          onClick={() => onOrderNow(product.id)}
        >
          <ShoppingCart className="w-2.5 h-2.5 mr-1" />
          Order
        </Button>
        <Button 
          variant="outline" 
          className="w-full h-7 text-[10px]"
          onClick={() => onViewDetails(product.id)}
        >
          Details
        </Button>
      </CardFooter>
    </Card>
  )
}
