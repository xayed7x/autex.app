import { SupabaseClient } from '@supabase/supabase-js';

export interface OrderItemStock {
  product_id: string;
  quantity: number;
  size: string | null;
  color: string | null;
  product_name?: string | null;
}

/**
 * Deducts stock for each order item after an order is confirmed.
 * Handles three priority levels:
 *   1. Variant stock (size × color combination)
 *   2. Size stock (size only)
 *   3. Total stock (fallback)
 *
 * Errors in stock deduction are logged but do not fail the overall process.
 */
export async function deductStockFromOrderItems(supabase: SupabaseClient<any, any, any>, items: OrderItemStock[]): Promise<void> {
  for (const item of items) {
    if (!item.product_id) continue;
    
    try {
      const selectedSize = item.size;
      const selectedColor = item.color;
      const orderQuantity = item.quantity || 1;

      const { data: product } = await supabase
        .from('products')
        .select('name, size_stock, variant_stock, stock_quantity')
        .eq('id', item.product_id)
        .single();

      if (!product) continue;

      if (selectedSize && selectedColor && product.variant_stock) {
        // Priority 1: Variant stock (size × color)
        await deductVariantStock(supabase, item.product_id, product, selectedSize, selectedColor, orderQuantity);
      } else if (selectedSize && product.size_stock) {
        // Priority 2: Size stock
        await deductSizeStock(supabase, item.product_id, product, selectedSize, orderQuantity);
      } else {
        // Priority 3: Total stock only
        await deductTotalStock(supabase, item.product_id, product.stock_quantity, orderQuantity, product.name);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[deduct_stock] Stock deduction failed for product ID "${item.product_id}":`, errorMessage);
    }
  }
}

async function deductVariantStock(
  supabase: SupabaseClient<any, any, any>,
  productId: string,
  product: Record<string, any>,
  selectedSize: string,
  selectedColor: string,
  quantity: number
): Promise<void> {
  const isArray = Array.isArray(product.variant_stock);
  let updatedVariantStock = isArray ? [...product.variant_stock] : { ...product.variant_stock };
  
  let beforeQuantity = 0;
  let afterQuantity = 0;
  
  if (isArray) {
    updatedVariantStock = (updatedVariantStock as any[]).map(vs => {
      if (vs.size?.toUpperCase() === selectedSize.toUpperCase() && vs.color?.toLowerCase() === selectedColor.toLowerCase()) {
        beforeQuantity = vs.quantity || 0;
        afterQuantity = Math.max(0, beforeQuantity - quantity);
        return { ...vs, quantity: afterQuantity };
      }
      return vs;
    });
  } else {
    const exactKey = `${selectedSize}_${selectedColor}`;
    const keyMatch = Object.keys(updatedVariantStock).find(k => k.toUpperCase() === exactKey.toUpperCase());
    if (keyMatch) {
       beforeQuantity = Number((updatedVariantStock as any)[keyMatch]) || 0;
       afterQuantity = Math.max(0, beforeQuantity - quantity);
       (updatedVariantStock as any)[keyMatch] = afterQuantity;
    }
  }

  let updatedSizeStock = product.size_stock ? (Array.isArray(product.size_stock) ? [...product.size_stock] : { ...product.size_stock }) : null;
  if (updatedSizeStock) {
    if (Array.isArray(updatedSizeStock)) {
      updatedSizeStock = (updatedSizeStock as any[]).map(ss => {
        if (ss.size?.toUpperCase() === selectedSize.toUpperCase()) {
            return { ...ss, quantity: Math.max(0, (ss.quantity || 0) - quantity) };
        }
        return ss;
      });
    } else {
      const sizeKeyMatch = Object.keys(updatedSizeStock).find(k => k.toUpperCase() === selectedSize.toUpperCase());
      if (sizeKeyMatch) {
         (updatedSizeStock as any)[sizeKeyMatch] = Math.max(0, (Number((updatedSizeStock as any)[sizeKeyMatch]) || 0) - quantity);
      }
    }
  }

  const updatedTotalStock = Math.max(0, (product.stock_quantity || 0) - quantity);

  await supabase
    .from('products')
    .update({
      variant_stock: updatedVariantStock,
      size_stock: updatedSizeStock,
      stock_quantity: updatedTotalStock
    })
    .eq('id', productId);
    
  console.log(`[STOCK DEDUCTED] Variant ${selectedSize} - ${selectedColor} reduced by ${quantity}. New exact stock: ${afterQuantity}`);
}

async function deductSizeStock(
  supabase: SupabaseClient<any, any, any>,
  productId: string,
  product: Record<string, any>,
  selectedSize: string,
  quantity: number
): Promise<void> {
  const isArray = Array.isArray(product.size_stock);
  let updatedSizeStock = isArray ? [...product.size_stock] : { ...product.size_stock };
  
  let beforeQuantity = 0;
  let afterQuantity = 0;

  if (isArray) {
    updatedSizeStock = (updatedSizeStock as any[]).map(ss => {
      if (ss.size?.toUpperCase() === selectedSize.toUpperCase()) {
        beforeQuantity = ss.quantity || 0;
        afterQuantity = Math.max(0, beforeQuantity - quantity);
        return { ...ss, quantity: afterQuantity };
      }
      return ss;
    });
  } else {
    const keyMatch = Object.keys(updatedSizeStock).find(k => k.toUpperCase() === selectedSize.toUpperCase());
    if (keyMatch) {
      beforeQuantity = Number((updatedSizeStock as any)[keyMatch]) || 0;
      afterQuantity = Math.max(0, beforeQuantity - quantity);
      (updatedSizeStock as any)[keyMatch] = afterQuantity;
    }
  }

  const updatedTotalStock = Math.max(0, (product.stock_quantity || 0) - quantity);

  await supabase
    .from('products')
    .update({
      size_stock: updatedSizeStock,
      stock_quantity: updatedTotalStock
    })
    .eq('id', productId);

  console.log(`[STOCK DEDUCTED] Size ${selectedSize} reduced by ${quantity}. New size stock: ${afterQuantity}`);
}

async function deductTotalStock(
  supabase: SupabaseClient<any, any, any>,
  productId: string,
  currentTotal: number,
  quantity: number,
  productName: string
): Promise<void> {
  const updatedTotalStock = Math.max(0, (currentTotal || 0) - quantity);
  await supabase
    .from('products')
    .update({ stock_quantity: updatedTotalStock })
    .eq('id', productId);
    
  console.log(`[STOCK DEDUCTED] ${productName} total stock reduced by ${quantity}. New total: ${updatedTotalStock}`);
}
