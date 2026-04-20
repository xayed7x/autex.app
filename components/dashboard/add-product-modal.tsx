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
  onSuccess?: () => void
  businessCategory?: string
}

export function AddProductModal({ open, onClose, product, onSuccess, businessCategory }: AddProductModalProps) {
  return (
    <ProductForm
      open={open}
      onOpenChange={onClose}
      product={product}
      onSuccess={() => {
        onClose()
        onSuccess?.()
      }}
      businessCategory={businessCategory}
    />
  )
}
