'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface SizeStockItem {
  size: string;
  quantity: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  description?: string | null;
  category?: string | null;
  image_urls?: string[];
  colors?: string[] | null;
  sizes?: string[] | null;
  size_stock?: SizeStockItem[] | null;
  flavors?: string[] | null;
}

interface ProductDetailsModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

export function ProductDetailsModal({ product, open, onClose }: ProductDetailsModalProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  
  if (!product) return null;

  // Use size_stock if available, otherwise fall back to sizes array
  const sizeStock = product.size_stock || 
    (product.sizes?.map(size => ({ size, quantity: Math.floor(product.stock_quantity / (product.sizes?.length || 1)) })) || []);

  const totalStock = sizeStock.reduce((sum, item) => sum + item.quantity, 0);
  const images = product.image_urls || [];
  const selectedImage = images[selectedImageIndex] || images[0];

  const isFood = product.category === 'food' || (product.flavors && product.flavors.length > 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto bg-zinc-950/95 dark:backdrop-blur-xl border-white/10 shadow-2xl p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b border-white/10 bg-white/5 flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-serif tracking-wide text-white">Product Overview</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left Column: Image Gallery */}
          <div className="p-6 bg-black/20 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-white/10">
            <div className="relative w-full aspect-[4/3] md:aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10 shadow-inner group">
              <Image
                src={selectedImage || "/placeholder.svg"}
                alt={product.name}
                fill
                className="object-contain p-2 transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            
            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {images.map((url, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImageIndex(index)}
                    className={cn(
                      "relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border transition-all duration-300",
                      selectedImageIndex === index 
                        ? "border-white shadow-[0_0_10px_rgba(255,255,255,0.3)] scale-105" 
                        : "border-white/10 hover:border-white/30 opacity-70 hover:opacity-100"
                    )}
                  >
                    <Image
                      src={url}
                      alt={`${product.name} ${index + 1}`}
                      fill
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Details & Stock */}
          <div className="p-6 space-y-6">
            {/* Header Info */}
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-white leading-tight">{product.name}</h3>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-serif text-white tracking-tight">{product.price.toLocaleString()}</span>
                {!isFood && (
                  totalStock > 0 ? (
                    <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
                      {totalStock} in stock
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full border border-red-400/20">
                      Out of Stock
                    </span>
                  )
                )}
              </div>
              
              {product.description && (
                <p className="text-sm text-zinc-400 leading-relaxed border-l-2 border-white/10 pl-3">
                  {product.description}
                </p>
              )}
            </div>

            {/* Flavors (Food Only) */}
            {product.flavors && product.flavors.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Available Flavors</h4>
                <div className="flex flex-wrap gap-2">
                  {product.flavors.map((flavor) => (
                    <div key={flavor} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300">
                      <span className="w-2 h-2 rounded-full bg-orange-400" />
                      {flavor}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Colors (Clothing Only) */}
            {!isFood && product.colors && product.colors.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Available Colors</h4>
                <div className="flex flex-wrap gap-2">
                  {product.colors.map((color) => (
                    <div key={color} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-300">
                      <span className="w-2 h-2 rounded-full bg-zinc-400" />
                      {color}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sizes & Stock Grid (Clothing Only) */}
            {!isFood && (
              <div className="space-y-3 pt-4 border-t border-white/10">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center justify-between">
                  <span>Stock Breakdown</span>
                  <span className="text-[10px] font-normal normal-case opacity-70">
                    {sizeStock.length} variants
                  </span>
                </h4>
                
                {sizeStock.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {sizeStock.map((item, index) => (
                      <div 
                        key={index} 
                        className={cn(
                          "flex flex-col items-center justify-center p-2 rounded-lg border transition-all",
                          item.quantity > 0 
                            ? "bg-white/5 border-white/10 text-zinc-200" 
                            : "bg-red-500/5 border-red-500/20 text-red-400 opacity-60"
                        )}
                      >
                        <span className="text-sm font-bold">{item.size}</span>
                        <span className="text-[10px] opacity-70 mt-1 font-mono">
                          {item.quantity} pcs
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-500 italic py-2">
                    No specific size variants defined.
                  </div>
                )}
              </div>
            )}
            
            {/* Footer Action */} 
            <div className="pt-4 mt-auto">
               <button 
                  onClick={onClose}
                  className="w-full py-2.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all text-sm font-medium"
               >
                 Close Details
               </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
