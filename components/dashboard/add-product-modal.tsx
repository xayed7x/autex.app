"use client"

import { ProductForm } from "@/components/products/product-form"

interface Product {
  id: string
  name: string
  price: number
  stock_quantity: number
  description?: string
  category?: string
  image_urls?: string[]
  image_hash: string | null
}

interface AddProductModalProps {
  open: boolean
  onClose: () => void
  product?: Product | null
}

export function AddProductModal({ open, onClose, product }: AddProductModalProps) {
  return (
    <ProductForm
      open={open}
      onOpenChange={onClose}
      product={product}
      onSuccess={() => {
        onClose()
        // Parent component will handle success toast and refresh
      }}
    />
  )
}
