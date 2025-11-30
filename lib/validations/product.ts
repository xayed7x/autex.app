import { z } from 'zod';

/**
 * Schema for creating a new product
 */
export const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(255),
  price: z.number().positive('Price must be positive'),
  description: z.string().optional(),
  category: z.string().optional(),
  stock_quantity: z.number().int().min(0, 'Stock quantity cannot be negative').optional(),
  variations: z.record(z.any()).optional(), // JSON object for variations
});

/**
 * Schema for updating a product (all fields optional)
 */
export const updateProductSchema = createProductSchema.partial();

/**
 * Type for create product request
 */
export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * Type for update product request
 */
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/**
 * Validates and parses FormData for product creation
 * @param formData - FormData from request
 * @returns Validated product data
 */
export function validateProductFormData(formData: FormData): CreateProductInput {
  const data = {
    name: formData.get('name') as string,
    price: parseFloat(formData.get('price') as string),
    description: formData.get('description') as string | undefined,
    category: formData.get('category') as string | undefined,
    stock_quantity: formData.get('stock_quantity') 
      ? parseInt(formData.get('stock_quantity') as string) 
      : undefined,
    variations: formData.get('variations')
      ? JSON.parse(formData.get('variations') as string)
      : undefined,
  };

  return createProductSchema.parse(data);
}

/**
 * Validates and parses FormData for product update
 * @param formData - FormData from request
 * @returns Validated product data
 */
export function validateProductUpdateFormData(formData: FormData): UpdateProductInput {
  const data: any = {};

  if (formData.has('name')) data.name = formData.get('name') as string;
  if (formData.has('price')) data.price = parseFloat(formData.get('price') as string);
  if (formData.has('description')) data.description = formData.get('description') as string;
  if (formData.has('category')) data.category = formData.get('category') as string;
  if (formData.has('stock_quantity')) {
    data.stock_quantity = parseInt(formData.get('stock_quantity') as string);
  }
  if (formData.has('variations')) {
    data.variations = JSON.parse(formData.get('variations') as string);
  }

  return updateProductSchema.parse(data);
}
