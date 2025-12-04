'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Upload, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { TopBar } from '@/components/dashboard/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);

  // Open add modal if query param is present
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setIsAddModalOpen(true);
    }
  }, [searchParams]);

  const fetchProducts = useCallback(async (page: number = 1, search: string = '', category: string = 'all', stock: string = 'all', sort: string = 'recent') => {
    try {
      setIsLoading(true);
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
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(1, searchQuery, categoryFilter, stockFilter, sortBy);
  }, [fetchProducts, searchQuery, categoryFilter, stockFilter, sortBy]);

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

  return (
    <RequireFacebookPage>
      <TopBar title="Products" />

      <div className="p-4 lg:p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-2xl font-semibold">Products</h2>
          <div className="flex gap-2">
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Bulk Import CSV
            </Button>
            <Button onClick={handleAddProduct}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-card border border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Categories" />
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
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Stock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="instock">In Stock</SelectItem>
                  <SelectItem value="outofstock">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[160px]">
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
          </CardContent>
        </Card>

        {/* Products Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading products...</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map((product) => (
                <Card key={product.id} className="bg-card border border-border shadow-sm overflow-hidden">
                  {/* Fixed height image */}
                  <div className="h-48 relative bg-muted">
                    <img
                      src={product.image_urls?.[0] || "/placeholder.svg"}
                      alt={product.name}
                      className={`w-full h-full object-cover ${product.stock_quantity === 0 ? "opacity-50" : ""}`}
                    />
                    {product.stock_quantity === 0 && (
                      <Badge variant="destructive" className="absolute top-2 right-2 text-xs px-2 py-0.5">
                        Out of Stock
                      </Badge>
                    )}
                  </div>
                  
                  {/* Card content */}
                  <CardContent className="p-3 space-y-2">
                    {/* Product name */}
                    <h3 className="font-semibold text-sm line-clamp-1">{product.name}</h3>
                    
                    {/* Price */}
                    <p className="font-semibold text-lg">৳{product.price.toLocaleString()}</p>
                    
                    {/* Category */}
                    {product.category && (
                      <p className="text-xs text-muted-foreground">
                        Category: {product.category}
                      </p>
                    )}
                    
                    {/* Stock */}
                    <p className="text-xs text-muted-foreground">
                      Stock: {product.stock_quantity} {product.stock_quantity === 1 ? "unit" : "units"}
                    </p>
                    
                    {/* Action buttons */}
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-9"
                        onClick={() => handleEditProduct(product)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 px-3"
                        onClick={() => handleDeleteProduct(product.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {products.length === 0 && (
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
        )}
      </div>

      {/* Product Form Modal */}
      <AddProductModal
        open={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingProduct(null);
        }}
        product={editingProduct}
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
    </RequireFacebookPage>
  );
}
