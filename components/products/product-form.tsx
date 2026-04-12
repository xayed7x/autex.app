'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Upload, X, Plus, Trash2, ImagePlus, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { PremiumButton } from '@/components/ui/premium/premium-button';
import { SmartCard } from '@/components/ui/premium/smart-card';
import { VariantStockMatrix, VariantStockItem } from './variant-stock-matrix';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Size stock item type
interface SizeStockItem {
  size: string;
  quantity: number;
}

// Bulk discount tier
interface BulkDiscount {
  minQty: number;
  discountPercent: number;
}

// Pricing policy for negotiation/discounts
interface PricingPolicy {
  isNegotiable: boolean;
  minPrice?: number | null;
  bulkDiscounts: BulkDiscount[];
}

// Size chart entry for measurement data
interface SizeChartEntry {
  size: string;
  chest: string;
  length: string;
}

// Rich product attributes
interface ProductAttributes {
  fabric: string;
  gsm: string;
  fitType: string;
  careInstructions: string;
  occasion: string;
  sizeChart: SizeChartEntry[];
  brand: string;
  countryOfOrigin: string;
  returnEligible: boolean;
  warranty: string;
  weight: string;
}

const DEFAULT_PRODUCT_ATTRIBUTES: ProductAttributes = {
  fabric: '',
  gsm: '',
  fitType: '',
  careInstructions: '',
  occasion: '',
  sizeChart: [],
  brand: '',
  countryOfOrigin: '',
  returnEligible: true,
  warranty: '',
  weight: '',
};

const FIT_TYPES = ['regular', 'slim', 'oversized', 'relaxed'];
const OCCASION_OPTIONS = ['Casual', 'Formal', 'Party', 'Office', 'Sports'];

const productFormSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  price: z.string().min(1, 'Price is required'),
  description: z.string().optional(),
  colors: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

interface Product {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  description?: string | null;
  image_urls?: string[];
  colors?: string[] | null;
  sizes?: string[] | null;
  size_stock?: SizeStockItem[] | null;
  variant_stock?: VariantStockItem[] | null;
  pricing_policy?: PricingPolicy | null;
  product_attributes?: ProductAttributes | null;
  media_images?: string[] | null;
  media_videos?: string[] | null;
}

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSuccess: () => void;
}

// Common sizes for quick add
const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// Maximum number of images per product
const MAX_IMAGES = 5;

// Image slot type - either new file or existing URL
interface ImageSlot {
  type: 'new' | 'existing';
  file?: File;
  preview: string;
  existingUrl?: string;
}

export function ProductForm({
  open,
  onOpenChange,
  product,
  onSuccess,
}: ProductFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Multi-image state
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>([]);
  const [sizeStock, setSizeStock] = useState<SizeStockItem[]>([]);
  const [variantStock, setVariantStock] = useState<VariantStockItem[]>([]);
  const [newSize, setNewSize] = useState('');
  const [newQuantity, setNewQuantity] = useState('10');
  
  // Raw Media states
  const [mediaImageSlots, setMediaImageSlots] = useState<ImageSlot[]>([]);
  const [mediaVideoSlots, setMediaVideoSlots] = useState<ImageSlot[]>([]);
  
  // Pricing policy state
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [minPrice, setMinPrice] = useState<string>('');

  // Product attributes state
  const [productAttributes, setProductAttributes] = useState<ProductAttributes>({ ...DEFAULT_PRODUCT_ATTRIBUTES });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [bulkDiscounts, setBulkDiscounts] = useState<BulkDiscount[]>([]);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: '',
      price: '',
      description: '',
      colors: '',
    },
  });

  // Reset form when product changes or dialog opens/closes
  useEffect(() => {
    if (product) {
      form.reset({
        name: product.name,
        price: product.price.toString(),
        description: product.description || '',
        colors: product.colors?.join(', ') || '',
      });
      
      // Load existing images as ImageSlots
      if (product.image_urls && product.image_urls.length > 0) {
        setImageSlots(product.image_urls.map(url => ({
          type: 'existing' as const,
          preview: url,
          existingUrl: url,
        })));
      } else {
        setImageSlots([]);
      }

      // Load media images
      if (product.media_images && product.media_images.length > 0) {
        setMediaImageSlots(product.media_images.map(url => ({
          type: 'existing' as const,
          preview: url,
          existingUrl: url,
        })));
      } else {
        setMediaImageSlots([]);
      }

      // Load media videos
      if (product.media_videos && product.media_videos.length > 0) {
        setMediaVideoSlots(product.media_videos.map(url => ({
          type: 'existing' as const,
          preview: '', // No preview for videos
          existingUrl: url,
        })));
      } else {
        setMediaVideoSlots([]);
      }
      
      // Load size_stock and variant_stock
      if (product.size_stock && product.size_stock.length > 0) {
        setSizeStock(product.size_stock);
      } else if (product.sizes && product.sizes.length > 0) {
        setSizeStock(product.sizes.map(size => ({ size, quantity: 10 })));
      } else {
        setSizeStock([]);
      }
      
      if (product.variant_stock && product.variant_stock.length > 0) {
        setVariantStock(product.variant_stock);
      } else if (product.size_stock && product.size_stock.length > 0) {
        const defaultColor = product.colors && product.colors.length > 0 
          ? product.colors[0] 
          : 'Standard';
          
        setVariantStock(product.size_stock.map(s => ({ 
          size: s.size, 
          color: defaultColor, 
          quantity: s.quantity 
        })));
      } else {
        setVariantStock([]);
      }
      
      // Load pricing policy
      if (product.pricing_policy) {
        setIsNegotiable(product.pricing_policy.isNegotiable || false);
        setMinPrice(product.pricing_policy.minPrice?.toString() || '');
        setBulkDiscounts(product.pricing_policy.bulkDiscounts || []);
      } else {
        setIsNegotiable(false);
        setMinPrice('');
        setBulkDiscounts([]);
      }

      // Load product attributes
      if (product.product_attributes) {
        setProductAttributes({ ...DEFAULT_PRODUCT_ATTRIBUTES, ...product.product_attributes });
        // Auto-open if any attributes are filled
        const attrs = product.product_attributes;
        if (attrs.fabric || attrs.fitType || attrs.careInstructions || attrs.occasion || attrs.brand || (attrs.sizeChart && attrs.sizeChart.length > 0)) {
          setDetailsOpen(true);
        }
      } else {
        setProductAttributes({ ...DEFAULT_PRODUCT_ATTRIBUTES });
      }
    } else {
      form.reset({
        name: '',
        price: '',
        description: '',
        colors: '',
        media_images: '',
        media_videos: '',
      });
      setImageSlots([]);
      setMediaImageSlots([]);
      setMediaVideoSlots([]);
      setSizeStock([]);
      setVariantStock([]);
      // Reset pricing policy
      setIsNegotiable(false);
      setMinPrice('');
      setBulkDiscounts([]);
      // Reset product attributes
      setProductAttributes({ ...DEFAULT_PRODUCT_ATTRIBUTES });
      setDetailsOpen(false);
    }
    setNewSize('');
    setNewQuantity('10');
  }, [product, open, form]);

  // Handle adding new image
  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Calculate how many more images we can add
    const remainingSlots = MAX_IMAGES - imageSlots.length;
    const filesToAdd = Array.from(files).slice(0, remainingSlots);
    
    filesToAdd.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageSlots(prev => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [...prev, {
            type: 'new' as const,
            file,
            preview: reader.result as string,
          }];
        });
      };
      reader.readAsDataURL(file);
    });
    
    // Reset input value so same file can be selected again
    e.target.value = '';
  };

  // Remove image at index
  const removeImage = (index: number) => {
    setImageSlots(prev => prev.filter((_, i) => i !== index));
  };

  // Handle adding new media images
  const handleMediaImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaImageSlots(prev => [...prev, {
          type: 'new' as const,
          file,
          preview: reader.result as string,
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeMediaImage = (index: number) => {
    setMediaImageSlots(prev => prev.filter((_, i) => i !== index));
  };

  // Handle adding new media videos
  const handleMediaVideoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
      setMediaVideoSlots(prev => [...prev, {
        type: 'new' as const,
        file,
        preview: '', // Videos use filename
      }]);
    });
    e.target.value = '';
  };

  const removeMediaVideo = (index: number) => {
    setMediaVideoSlots(prev => prev.filter((_, i) => i !== index));
  };

  // Add a new size-stock entry
  const addSizeStock = () => {
    if (!newSize.trim()) return;
    
    const sizeUpper = newSize.trim().toUpperCase();
    
    // Check for duplicate
    if (sizeStock.some(item => item.size.toUpperCase() === sizeUpper)) {
      alert(`Size "${sizeUpper}" already exists`);
      return;
    }
    
    setSizeStock([...sizeStock, { 
      size: sizeUpper, 
      quantity: parseInt(newQuantity) || 0 
    }]);
    setNewSize('');
    setNewQuantity('10');
  };

  // Quick add common size
  const quickAddSize = (size: string) => {
    if (sizeStock.some(item => item.size === size)) return;
    setSizeStock([...sizeStock, { size, quantity: 10 }]);
  };

  // Remove a size-stock entry
  const removeSizeStock = (index: number) => {
    const sizeToRemove = sizeStock[index].size;
    setSizeStock(sizeStock.filter((_, i) => i !== index));
    // Also remove from variant stock
    setVariantStock(variantStock.filter(v => v.size !== sizeToRemove));
  };

  // Update quantity for a size
  const updateQuantity = (index: number, quantity: number) => {
    const updated = [...sizeStock];
    updated[index].quantity = quantity;
    setSizeStock(updated);
  };

  const onSubmit = async (values: ProductFormValues) => {
    try {
      setIsSubmitting(true);

      const formData = new FormData();
      formData.append('name', values.name);
      formData.append('price', values.price);
      if (values.description) formData.append('description', values.description);
      if (values.colors) formData.append('colors', values.colors);
      
      // Process stock data
      const colorsStr = values.colors || '';
      const activeColors = colorsStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
      const isVariantMode = activeColors.length > 0;
      
      // Filter variant stock to only include active sizes and colors
      // If no colors defined, map to 'Standard'
      const finalVariantStock = variantStock.filter(v => 
        sizeStock.some(s => s.size === v.size) && 
        (isVariantMode ? activeColors.includes(v.color) : v.color === 'Standard')
      );
      
      // If we have sizes but no variant stock (fresh add), try to populate from sizeStock quantities?
      // Actually Matrix handles inputs.
      
      // Recalculate size_stock totals from variants
      const finalSizeStock = sizeStock.map(s => {
        const variantsForSize = finalVariantStock.filter(v => v.size === s.size);
        const totalQty = variantsForSize.reduce((sum, v) => sum + v.quantity, 0);
        return { size: s.size, quantity: totalQty };
      });
      
      const totalStock = finalSizeStock.reduce((sum, item) => sum + item.quantity, 0);

      if (finalSizeStock.length > 0) {
        // Send size_stock JSON (totals)
        formData.append('size_stock', JSON.stringify(finalSizeStock));
        // Send variant_stock JSON (details)
        formData.append('variant_stock', JSON.stringify(finalVariantStock));
        // Also send sizes array for backward compatibility
        formData.append('sizes', finalSizeStock.map(s => s.size).join(', '));
        
        formData.append('stock_quantity', totalStock.toString());
      } else {
        formData.append('stock_quantity', '0');
        formData.append('size_stock', '[]');
        formData.append('variant_stock', '[]');
      }
      
      // Send pricing policy
      const pricingPolicy = {
        isNegotiable,
        minPrice: minPrice ? parseFloat(minPrice) : null,
        bulkDiscounts: bulkDiscounts.filter(d => d.minQty > 0 && d.discountPercent > 0),
      };
      formData.append('pricing_policy', JSON.stringify(pricingPolicy));

      // Send product attributes
      formData.append('product_attributes', JSON.stringify(productAttributes));

      // Handle raw media images
      const newMediaImages = mediaImageSlots.filter(s => s.type === 'new' && s.file);
      const existingMediaImages = mediaImageSlots.filter(s => s.type === 'existing').map(s => s.existingUrl!);
      
      newMediaImages.forEach((slot, index) => {
        if (slot.file) formData.append(`media_image_${index}`, slot.file);
      });
      formData.append('new_media_image_count', newMediaImages.length.toString());
      formData.append('existing_media_images', JSON.stringify(existingMediaImages));

      // Handle raw media videos
      const newMediaVideos = mediaVideoSlots.filter(s => s.type === 'new' && s.file);
      const existingMediaVideos = mediaVideoSlots.filter(s => s.type === 'existing').map(s => s.existingUrl!);
      
      newMediaVideos.forEach((slot, index) => {
        if (slot.file) formData.append(`media_video_${index}`, slot.file);
      });
      formData.append('new_media_video_count', newMediaVideos.length.toString());
      formData.append('existing_media_videos', JSON.stringify(existingMediaVideos));

      // Handle multiple images
      const newImageFiles = imageSlots.filter(slot => slot.type === 'new' && slot.file);
      const existingUrls = imageSlots.filter(slot => slot.type === 'existing').map(slot => slot.existingUrl!);
      
      // Append new image files
      newImageFiles.forEach((slot, index) => {
        if (slot.file) {
          formData.append(`image_${index}`, slot.file);
        }
      });
      
      // Send count of new images
      formData.append('new_image_count', newImageFiles.length.toString());
      
      // Send existing image URLs to preserve
      formData.append('existing_image_urls', JSON.stringify(existingUrls));
      
      // Validate: at least one image required for new products
      if (imageSlots.length === 0 && !product) {
        throw new Error('At least one product image is required');
      }

      const url = product
        ? `/api/products/${product.id}`
        : '/api/products';
      
      const method = product ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save product');
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving product:', error);
      alert(error.message || 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto bg-zinc-950/95 dark:backdrop-blur-xl border-white/10 shadow-2xl p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b border-white/10 bg-white/5">
          <DialogTitle className="text-xl font-serif tracking-wide text-white">{product ? 'Edit Product' : 'Add Product'}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {product
              ? 'Update product details and image'
              : 'Add a new product to your inventory'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-6">
            {/* Multi-Image Upload */}
            <div className="space-y-3">
              <FormLabel className="text-zinc-400 uppercase text-xs font-bold tracking-wider">
                Product Images 
                <span className="text-zinc-600 font-normal ml-1">
                  ({imageSlots.length}/{MAX_IMAGES})
                </span>
              </FormLabel>
              
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {/* Existing and new images */}
                {imageSlots.map((slot, index) => (
                  <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 shadow-sm group">
                    <Image
                      src={slot.preview}
                      alt={`Product ${index + 1}`}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 rounded-full"
                      onClick={() => removeImage(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    {index === 0 && (
                      <span className="absolute bottom-0 left-0 right-0 text-[9px] font-bold bg-white/90 text-black py-1 text-center uppercase tracking-wider backdrop-blur-md">
                        Main
                      </span>
                    )}
                  </div>
                ))}
                
                {/* Add more button (if under limit) */}
                {imageSlots.length < MAX_IMAGES && (
                  <label className="flex flex-col items-center justify-center aspect-square rounded-xl border border-dashed border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40 cursor-pointer transition-all group">
                    <div className="p-2 rounded-full bg-white/5 group-hover:scale-110 transition-transform duration-300">
                       <ImagePlus className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                    </div>
                    <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 mt-2 font-medium">Add</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      multiple
                      onChange={handleImageAdd}
                    />
                  </label>
                )}
              </div>
              
              <p className="text-xs text-zinc-500">
                Upload multiple angles for better image recognition (up to {MAX_IMAGES} images)
              </p>
            </div>
                                        
            {/* Raw Media Section */}
            <div className="space-y-6 pt-4 border-t border-white/5">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-white">📸 Raw Media (Optional)</h4>
                <p className="text-[10px] text-zinc-500 uppercase tracking-[0.1em] font-medium italic">For customer delivery only • No image recognition</p>
              </div>

              {/* Media Images */}
              <div className="space-y-3">
                <FormLabel className="text-zinc-400 uppercase text-[10px] font-bold tracking-wider">
                  Extra Lifestyle Images
                </FormLabel>
                
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                  {mediaImageSlots.map((slot, index) => (
                    <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 shadow-sm group">
                      <Image
                        src={slot.preview}
                        alt={`Media Image ${index + 1}`}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 rounded-full"
                        onClick={() => removeMediaImage(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  
                  <label className="flex flex-col items-center justify-center aspect-square rounded-xl border border-dashed border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40 cursor-pointer transition-all group">
                    <div className="p-2 rounded-full bg-white/5 group-hover:scale-110 transition-transform duration-300">
                       <ImagePlus className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                    </div>
                    <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 mt-2 font-medium">Add Image</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      multiple
                      onChange={handleMediaImageAdd}
                    />
                  </label>
                </div>
              </div>

              {/* Product Videos */}
              <div className="space-y-3">
                <FormLabel className="text-zinc-400 uppercase text-[10px] font-bold tracking-wider">
                  Product Videos
                </FormLabel>
                
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                  {mediaVideoSlots.map((slot, index) => (
                    <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-white/5 shadow-sm group">
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
                        <div className="p-2 rounded-full bg-white/5 transition-transform duration-500 group-hover:scale-110">
                          <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="mt-1 text-[8px] text-zinc-500 truncate w-full px-1">
                          {slot.type === 'existing' ? 'Video' : slot.file?.name}
                        </span>
                      </div>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100 rounded-full"
                        onClick={() => removeMediaVideo(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  <label className="flex flex-col items-center justify-center aspect-square rounded-xl border border-dashed border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40 cursor-pointer transition-all group">
                    <div className="p-2 rounded-full bg-white/5 group-hover:scale-110 transition-transform duration-300">
                       <Plus className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                    </div>
                    <span className="text-[10px] text-zinc-500 group-hover:text-zinc-300 mt-2 font-medium">Add Video</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="video/*"
                      multiple
                      onChange={handleMediaVideoAdd}
                    />
                  </label>
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-zinc-400 uppercase text-xs font-bold tracking-wider">Product Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter product name" {...field} className="bg-zinc-900/50 border-white/10 focus:border-white/30 text-white placeholder:text-zinc-700 h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-zinc-400 uppercase text-xs font-bold tracking-wider">Price (৳)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} className="bg-zinc-900/50 border-white/10 focus:border-white/30 text-white placeholder:text-zinc-700 h-11 font-mono" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="colors"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-zinc-400 uppercase text-xs font-bold tracking-wider">Colors (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Red, Blue, Green" {...field} className="bg-zinc-900/50 border-white/10 focus:border-white/30 text-white placeholder:text-zinc-700 h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Size & Stock Section */}
            <div className="space-y-4 pt-2 border-t border-white/5">
              <FormLabel className="text-zinc-400 uppercase text-xs font-bold tracking-wider">Sizes & Stock</FormLabel>
              
              {/* Quick add buttons */}
              <div className="flex flex-wrap gap-2">
                {COMMON_SIZES.map(size => {
                  const isActive = sizeStock.some(s => s.size === size);
                  return (
                    <button
                      key={size}
                      type="button"
                      className={`
                        h-8 px-3 rounded-md text-xs font-bold transition-all duration-300 border
                        ${isActive 
                          ? 'bg-white text-black border-white shadow-[0_0_10px_rgba(255,255,255,0.3)]' 
                          : 'bg-transparent text-zinc-400 border-white/10 hover:border-white/30 hover:text-white hover:bg-white/5'
                        }
                      `}
                      onClick={() => quickAddSize(size)}
                      disabled={isActive}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>

              {/* Add custom size */}
              <div className="flex gap-2 mb-4 mt-2">
                <Input
                  placeholder="Custom size (e.g., 42, Free)"
                  value={newSize}
                  onChange={(e) => setNewSize(e.target.value)}
                  className="bg-zinc-900/50 border-white/10 focus:border-white/30 text-white placeholder:text-zinc-700 h-9"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSizeStock())}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 bg-white/5"
                  onClick={addSizeStock}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Size
                </Button>
              </div>

              {/* Variant Stock Matrix */}
              {sizeStock.length > 0 && (
                <VariantStockMatrix
                  sizes={sizeStock.map(s => s.size)}
                  colors={form.watch('colors')?.split(',') || []}
                  value={variantStock}
                  onChange={setVariantStock}
                  onRemoveSize={removeSizeStock}
                />
              )}
              
              {sizeStock.length > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground mt-2">
                   <span>
                     Total Variants: {
                       variantStock.filter(v => 
                         sizeStock.some(s => s.size === v.size) &&
                         (form.watch('colors') ? form.watch('colors')?.includes(v.color) : v.color === 'Standard')
                       ).length
                     }
                   </span>
                   <span className="font-medium">
                     Total Stock: {
                       variantStock
                         .filter(v => sizeStock.some(s => s.size === v.size))
                         .reduce((sum, item) => sum + item.quantity, 0)
                     } pcs
                   </span>
                </div>
              )}
            </div>

            {/* Pricing Policy Section */}
            <div className="space-y-4 border border-white/10 rounded-xl p-4 bg-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    💰 Pricing Policy
                  </h4>
                  <p className="text-xs text-zinc-500">Configure negotiation and bulk discounts</p>
                </div>
              </div>
              
              {/* Negotiable Toggle */}
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-900/50">
                <div>
                  <p className="text-sm text-white">Price is negotiable</p>
                  <p className="text-xs text-zinc-500">Allow customers to make offers</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNegotiable(!isNegotiable)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    isNegotiable ? 'bg-green-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      isNegotiable ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              
              {/* Min Price (when negotiable) */}
              {isNegotiable && (
                <div className="pl-3 border-l-2 border-green-500/30">
                  <label className="text-xs text-zinc-400 uppercase font-bold tracking-wider">
                    Minimum Acceptable Price (৳)
                  </label>
                  <Input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="Lowest price you'll accept"
                    className="mt-1 bg-zinc-900/50 border-white/10 h-10"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    AI will accept offers at or above this price
                  </p>
                </div>
              )}
              
              {/* Bulk Discounts */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-400 uppercase font-bold tracking-wider">
                    Bulk Discounts
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkDiscounts([...bulkDiscounts, { minQty: 3, discountPercent: 5 }])}
                    className="h-7 text-xs"
                  >
                    + Add Tier
                  </Button>
                </div>
                
                {bulkDiscounts.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-2">No bulk discounts configured</p>
                ) : (
                  <div className="space-y-2">
                    {bulkDiscounts.map((discount, index) => (
                      <div key={index} className="flex items-center gap-2 bg-zinc-900/50 p-2 rounded-lg">
                        <Input
                          type="number"
                          value={discount.minQty}
                          onChange={(e) => {
                            const updated = [...bulkDiscounts];
                            updated[index].minQty = parseInt(e.target.value) || 0;
                            setBulkDiscounts(updated);
                          }}
                          className="w-16 h-8 text-center bg-transparent border-white/10"
                          min={2}
                        />
                        <span className="text-xs text-zinc-500">+ items →</span>
                        <Input
                          type="number"
                          value={discount.discountPercent}
                          onChange={(e) => {
                            const updated = [...bulkDiscounts];
                            updated[index].discountPercent = parseInt(e.target.value) || 0;
                            setBulkDiscounts(updated);
                          }}
                          className="w-16 h-8 text-center bg-transparent border-white/10"
                          min={1}
                          max={100}
                        />
                        <span className="text-xs text-zinc-500">% off</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setBulkDiscounts(bulkDiscounts.filter((_, i) => i !== index))}
                          className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Product Details Section (Collapsible) */}
            <div className="border border-white/10 rounded-xl overflow-hidden bg-white/5">
              <button
                type="button"
                className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
                onClick={() => setDetailsOpen(!detailsOpen)}
              >
                <div>
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    📋 Product Details
                  </h4>
                  <p className="text-xs text-zinc-500">Fabric, fit type, care instructions, size chart & more</p>
                </div>
                <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${detailsOpen ? 'rotate-180' : ''}`} />
              </button>

              {detailsOpen && (
                <div className="p-4 pt-0 space-y-4 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Row 1: Fabric + Fit Type */}
                  <div className="grid grid-cols-2 gap-4 pt-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 uppercase font-bold tracking-wider">Fabric / Material</label>
                      <Input
                        value={productAttributes.fabric}
                        onChange={(e) => setProductAttributes({ ...productAttributes, fabric: e.target.value })}
                        placeholder="e.g. 100% Cotton"
                        className="bg-zinc-900/50 border-white/10 h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 uppercase font-bold tracking-wider">Fit Type</label>
                      <Select
                        value={productAttributes.fitType || undefined}
                        onValueChange={(v) => setProductAttributes({ ...productAttributes, fitType: v })}
                      >
                        <SelectTrigger className="bg-zinc-900/50 border-white/10 h-9 text-sm">
                          <SelectValue placeholder="Select fit" />
                        </SelectTrigger>
                        <SelectContent>
                          {FIT_TYPES.map(f => (
                            <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Care Instructions */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 uppercase font-bold tracking-wider">Care Instructions</label>
                    <Textarea
                      value={productAttributes.careInstructions}
                      onChange={(e) => setProductAttributes({ ...productAttributes, careInstructions: e.target.value })}
                      placeholder="e.g. Machine wash cold, do not bleach"
                      rows={2}
                      className="bg-zinc-900/50 border-white/10 text-sm resize-none"
                    />
                  </div>

                  {/* Occasion (multi-select badges) */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 uppercase font-bold tracking-wider">Occasion</label>
                    <div className="flex flex-wrap gap-2">
                      {OCCASION_OPTIONS.map(occ => {
                        const selected = productAttributes.occasion.split(',').map(s => s.trim()).filter(Boolean);
                        const isActive = selected.includes(occ);
                        return (
                          <button
                            key={occ}
                            type="button"
                            className={`
                              h-7 px-3 rounded-md text-xs font-medium transition-all duration-200 border
                              ${isActive
                                ? 'bg-white text-black border-white shadow-[0_0_8px_rgba(255,255,255,0.2)]'
                                : 'bg-transparent text-zinc-400 border-white/10 hover:border-white/30 hover:text-white'
                              }
                            `}
                            onClick={() => {
                              const current = productAttributes.occasion.split(',').map(s => s.trim()).filter(Boolean);
                              const updated = isActive
                                ? current.filter(o => o !== occ)
                                : [...current, occ];
                              setProductAttributes({ ...productAttributes, occasion: updated.join(', ') });
                            }}
                          >
                            {occ}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Size Chart */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-zinc-400 uppercase font-bold tracking-wider">Size Chart (inches)</label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setProductAttributes({
                          ...productAttributes,
                          sizeChart: [...productAttributes.sizeChart, { size: '', chest: '', length: '' }]
                        })}
                        className="h-7 text-xs"
                      >
                        + Add Row
                      </Button>
                    </div>
                    {productAttributes.sizeChart.length > 0 && (
                      <div className="space-y-1">
                        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px] text-zinc-500 uppercase font-bold tracking-wider px-1">
                          <span>Size</span>
                          <span>Chest</span>
                          <span>Length</span>
                          <span></span>
                        </div>
                        {productAttributes.sizeChart.map((row, idx) => (
                          <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                            <Input
                              value={row.size}
                              onChange={(e) => {
                                const updated = [...productAttributes.sizeChart];
                                updated[idx] = { ...updated[idx], size: e.target.value };
                                setProductAttributes({ ...productAttributes, sizeChart: updated });
                              }}
                              placeholder="S"
                              className="bg-zinc-900/50 border-white/10 h-8 text-xs"
                            />
                            <Input
                              value={row.chest}
                              onChange={(e) => {
                                const updated = [...productAttributes.sizeChart];
                                updated[idx] = { ...updated[idx], chest: e.target.value };
                                setProductAttributes({ ...productAttributes, sizeChart: updated });
                              }}
                              placeholder="36"
                              className="bg-zinc-900/50 border-white/10 h-8 text-xs"
                            />
                            <Input
                              value={row.length}
                              onChange={(e) => {
                                const updated = [...productAttributes.sizeChart];
                                updated[idx] = { ...updated[idx], length: e.target.value };
                                setProductAttributes({ ...productAttributes, sizeChart: updated });
                              }}
                              placeholder="27"
                              className="bg-zinc-900/50 border-white/10 h-8 text-xs"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setProductAttributes({
                                  ...productAttributes,
                                  sizeChart: productAttributes.sizeChart.filter((_, i) => i !== idx)
                                });
                              }}
                              className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Row: Brand + Return Eligible */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 uppercase font-bold tracking-wider">Brand (Optional)</label>
                      <Input
                        value={productAttributes.brand}
                        onChange={(e) => setProductAttributes({ ...productAttributes, brand: e.target.value })}
                        placeholder="e.g. Nike, Local Brand"
                        className="bg-zinc-900/50 border-white/10 h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 uppercase font-bold tracking-wider">Return Eligible</label>
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-900/50 h-9">
                        <span className="text-xs text-zinc-400">{productAttributes.returnEligible ? 'Yes' : 'No'}</span>
                        <button
                          type="button"
                          onClick={() => setProductAttributes({ ...productAttributes, returnEligible: !productAttributes.returnEligible })}
                          className={`relative w-9 h-5 rounded-full transition-colors ${
                            productAttributes.returnEligible ? 'bg-green-500' : 'bg-zinc-700'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                              productAttributes.returnEligible ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter product description"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="border-[#e5e5e5] rounded-[0.625rem]"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="bg-[#171717] hover:bg-[#262626] text-white rounded-[0.625rem]"
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Saving...' : product ? 'Update Product' : 'Add Product'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
