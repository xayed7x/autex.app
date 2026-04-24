'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Upload, Pencil, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { TopBar } from '@/components/dashboard/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SmartCard } from "@/components/ui/premium/smart-card";
import { PremiumButton } from "@/components/ui/premium/premium-button";
import { PremiumLoader } from "@/components/ui/premium/premium-loader";
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AddProductModal } from '@/components/dashboard/add-product-modal';
import { ProductDetailsModal } from '@/components/dashboard/product-details-modal';
import { RequireFacebookPage } from '@/components/dashboard/require-facebook-page';

interface Product {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  description?: string;
  category?: string;
  image_urls?: string[];
  image_hash: string | null;
  colors?: string[];
  sizes?: string[];
  size_stock?: { size: string; quantity: number }[];
  flavors?: string[];
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

import { useSearchParams } from 'next/navigation';

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [businessCategory, setBusinessCategory] = useState<string>('clothing');
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
  
  // Debounced search state
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);

  // Update debounced search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Open add modal if query param is present
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setIsAddModalOpen(true);
    }
  }, [searchParams]);

  // Fetch business settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings/ai');
        if (response.ok) {
          const data = await response.json();
          if (data.settings?.business_category) {
            setBusinessCategory(data.settings.business_category);
          }
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    fetchSettings();
  }, []);

  const fetchProducts = useCallback(async (page: number = 1, search: string = '', category: string = 'all', stock: string = 'all', sort: string = 'recent') => {
    try {
      // Set fetching state for background updates
      setIsFetching(true);
      
      // Only set initial loading if we have no data
      if (products.length === 0) {
        setInitialLoading(true);
      }
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
        ...(category !== 'all' && { category }),
        ...(stock !== 'all' && { stock }),
        ...(sort && { sort }),
      });

      const response = await fetch(`/api/products?${params}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to fetch products');
      }

      const data = await response.json();
      setProducts(data.products || []);
      setPagination(data.pagination);
    } catch (error: any) {
      console.error('Error fetching products:', error);
      toast.error(error.message || 'Failed to load products');
    } finally {
      setInitialLoading(false);
      setIsFetching(false);
    }
  }, [products.length]); // Add dependency for products.length check

  // Unified fetch effect handles filters and debounced search
  useEffect(() => {
    fetchProducts(1, debouncedSearchQuery, categoryFilter, stockFilter, sortBy);
  }, [fetchProducts, debouncedSearchQuery, categoryFilter, stockFilter, sortBy]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
  };

  const handleAddProduct = () => {
    setEditingProduct(null);
    setIsAddModalOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsAddModalOpen(true);
  };

  const handleDeleteProduct = (productId: string) => {
    setDeleteProductId(productId);
  };

  const confirmDelete = async () => {
    if (!deleteProductId) return;

    try {
      const response = await fetch(`/api/products/${deleteProductId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete product');
      }

      toast.success('Product deleted successfully');
      fetchProducts(pagination.page, searchQuery, categoryFilter, stockFilter, sortBy);
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product');
    } finally {
      setDeleteProductId(null);
    }
  };

  const handleFormSuccess = () => {
    toast.success(
      editingProduct
        ? 'Product updated successfully'
        : 'Product created successfully'
    );
    fetchProducts(pagination.page, searchQuery, categoryFilter, stockFilter, sortBy);
  };

  const handlePageChange = (newPage: number) => {
    fetchProducts(newPage, searchQuery, categoryFilter, stockFilter, sortBy);
  };

  // Get unique categories from products
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  if (initialLoading) {
    return <PremiumLoader />
  }

  return (
    <RequireFacebookPage>
      <TopBar title="Products" />

      <div className="p-4 lg:p-6 space-y-6">
        {/* Unified Toolbar */}
        <SmartCard variant="static" className="p-1">
          <CardContent className="p-4">
            <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
              
              {/* Left Side: Search & Filters */}
              <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto flex-1">
                {/* Search */}
                <div className="relative w-full sm:w-[240px] lg:w-[300px] shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    className="pl-9 bg-background/50 border-zinc-200 dark:border-white/10 dark:bg-white/5 focus:bg-background transition-all"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                </div>
                
                {/* Filters Row */}
                <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3 w-full sm:w-auto">
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-full sm:w-[160px] bg-background/50 border-zinc-200 dark:border-white/10 dark:bg-white/5">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category!}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <Select value={stockFilter} onValueChange={setStockFilter}>
                      <SelectTrigger className="w-full sm:w-[130px] bg-background/50 border-zinc-200 dark:border-white/10 dark:bg-white/5">
                        <SelectValue placeholder="Stock" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Stock</SelectItem>
                        <SelectItem value="instock">In Stock</SelectItem>
                        <SelectItem value="outofstock">Out of Stock</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="col-span-2 sm:col-span-1 w-full sm:w-[160px] bg-background/50 border-zinc-200 dark:border-white/10 dark:bg-white/5">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recent">Recently Added</SelectItem>
                        <SelectItem value="name-asc">Name A-Z</SelectItem>
                        <SelectItem value="name-desc">Name Z-A</SelectItem>
                        <SelectItem value="price-low">Price: Low to High</SelectItem>
                        <SelectItem value="price-high">Price: High to Low</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
              </div>

              {/* Right Side: Actions */}
              <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto xl:ml-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                  <PremiumButton onClick={handleAddProduct} className="w-full sm:w-auto h-10">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Product
                  </PremiumButton>
                  <Button variant="outline" className="h-10 opacity-50 cursor-not-allowed w-full sm:w-auto text-xs sm:text-sm" disabled>
                    <Upload className="h-4 w-4 mr-2" />
                    Bulk Import
                  </Button>
              </div>

            </div>
          </CardContent>
        </SmartCard>

        {/* Products Grid */}
        <>
            <div className={`grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 transition-opacity duration-200 ${isFetching ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              {products.map((product) => (
                <SmartCard key={product.id} className="overflow-hidden group">
                  {/* Image Container - Responsive Aspect Ratio */}
                  <div 
                    className="relative w-full aspect-[4/3] bg-muted cursor-pointer overflow-hidden"
                    onClick={() => setViewingProduct(product)}
                  >
                    <img
                      src={product.image_urls?.[0] || "/placeholder.svg"}
                      alt={product.name}
                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${businessCategory !== 'food' && product.stock_quantity === 0 ? "opacity-50 grayscale" : "opacity-100"}`}
                    />
                    
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40 backdrop-blur-[2px]">
                      <Eye className="h-8 w-8 text-white drop-shadow-md transform scale-90 group-hover:scale-100 transition-transform duration-300" />
                    </div>

                    {/* Stock Badge */}
                    {businessCategory !== 'food' && product.stock_quantity === 0 && (
                      <Badge variant="destructive" className="absolute top-2 right-2 text-xs px-2 py-0.5 shadow-sm">
                        Out of Stock
                      </Badge>
                    )}
                  </div>
                  
                  {/* Card content */}
                  <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                    <div className="space-y-1">
                      {/* Product name */}
                      <h3 className="font-medium text-xs sm:text-sm leading-tight text-foreground line-clamp-1" title={product.name}>
                        {product.name}
                      </h3>

                      {/* Food Badges (Flavors) */}
                      {businessCategory === 'food' && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {product.flavors && product.flavors.length > 0 && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-400/10 border border-orange-400/20 text-[9px] font-medium text-orange-400">
                              <span className="w-1 h-1 rounded-full bg-orange-400" />
                              {product.flavors[0]}
                              {product.flavors.length > 1 && ` +${product.flavors.length - 1}`}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Price */}
                      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-0">
                         <p className="font-serif text-sm sm:text-lg font-semibold tracking-tight">
                           {product.price.toLocaleString()}
                         </p>
                         {businessCategory !== 'food' && (
                           <p className="text-[10px] sm:text-xs text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded w-fit">
                              {product.stock_quantity} <span className="hidden sm:inline">in stock</span><span className="sm:hidden">left</span>
                           </p>
                         )}
                      </div>
                    </div>
                    
                    {/* Action buttons - Always visible but styled subtly */}
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="col-span-3 h-7 sm:h-8 text-[10px] sm:text-xs font-medium border-border/50 hover:border-primary/50 hover:text-primary transition-colors px-1"
                        onClick={() => handleEditProduct(product)}
                      >
                        <Pencil className="h-3 w-3 mr-1.5" />
                        Edit <span className="hidden sm:inline ml-1">Product</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="col-span-1 h-7 sm:h-8 px-0 text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                        onClick={() => handleDeleteProduct(product.id)}
                      >
                        <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </Button>
                    </div>
                  </div>
                </SmartCard>
              ))}
            </div>

            {!initialLoading && products.length === 0 && !isFetching && (
              <Card className="bg-card border border-border shadow-sm">
                <CardContent className="p-12 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Search className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No products found</h3>
                  <p className="text-muted-foreground mb-4">Try adjusting your search or filter criteria</p>
                  <Button onClick={handleAddProduct}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Product
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {products.length} of {pagination.total} products
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>

      </div>

      {/* Product Form Modal */}
      <AddProductModal
        open={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingProduct(null);
        }}
        product={editingProduct}
        onSuccess={handleFormSuccess}
        businessCategory={businessCategory}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteProductId} onOpenChange={() => setDeleteProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the product
              from your inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Product Details Modal */}
      <ProductDetailsModal
        product={viewingProduct}
        open={!!viewingProduct}
        onClose={() => setViewingProduct(null)}
      />
    </RequireFacebookPage>
  );
}
