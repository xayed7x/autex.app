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
      
      <CardContent className="p-3">
        <h4 className="font-semibold text-sm line-clamp-2 mb-1" title={product.name}>
          {product.name}
        </h4>
        <p className="text-primary font-bold text-sm">
          ৳{product.price.toLocaleString()}
        </p>
        {product.category && (
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            {product.category}
          </p>
        )}
      </CardContent>
      
      <CardFooter className="p-3 pt-0 flex flex-col gap-2">
        <Button 
          className="w-full h-8 text-xs" 
          onClick={() => onOrderNow(product.id)}
        >
          <ShoppingCart className="w-3 h-3 mr-1.5" />
          Order Now
        </Button>
        <Button 
          variant="outline" 
          className="w-full h-8 text-xs"
          onClick={() => onViewDetails(product.id)}
        >
          <ExternalLink className="w-3 h-3 mr-1.5" />
          View Details
        </Button>
      </CardFooter>
    </Card>
  )
}
