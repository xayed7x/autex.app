'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

interface Product {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  description?: string | null;
  category?: string | null;
  image_urls?: string[];
  image_hash: string | null;
}

interface ProductTableProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (productId: string) => void;
}

export function ProductTable({ products, onEdit, onDelete }: ProductTableProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-12 text-[#737373]">
        <p>No products found. Add your first product to get started.</p>
      </div>
    );
  }

  return (
    <div className="border border-[#e5e5e5] rounded-[0.625rem] overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-[#e5e5e5]">
            <TableHead className="w-[80px] text-[#171717] font-medium">Image</TableHead>
            <TableHead className="text-[#171717] font-medium">Name</TableHead>
            <TableHead className="text-[#171717] font-medium">Category</TableHead>
            <TableHead className="text-right text-[#171717] font-medium">Price</TableHead>
            <TableHead className="text-right text-[#171717] font-medium">Stock</TableHead>
            <TableHead className="w-[70px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id} className="border-b border-[#e5e5e5] last:border-0">
              <TableCell>
                {product.image_urls?.[0] ? (
                  <div className="relative w-12 h-12 rounded-md overflow-hidden bg-[#f5f5f5]">
                    <Image
                      src={product.image_urls[0]}
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-md bg-[#f5f5f5] flex items-center justify-center text-xs text-[#737373]">
                    No image
                  </div>
                )}
              </TableCell>
              <TableCell className="font-medium text-[#171717]">{product.name}</TableCell>
              <TableCell>
                {product.category ? (
                  <Badge variant="outline" className="border-[#e5e5e5] text-[#171717]">
                    {product.category}
                  </Badge>
                ) : (
                  <span className="text-[#737373] text-sm">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-medium text-[#171717]">
                ৳{product.price.toFixed(2)}
              </TableCell>
              <TableCell className="text-right text-[#171717]">
                {product.stock_quantity}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="border-[#e5e5e5]">
                    <DropdownMenuItem onClick={() => onEdit(product)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(product.id)}
                      className="text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
