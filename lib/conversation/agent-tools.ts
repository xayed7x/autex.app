import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { getDeliveryCharge, WorkspaceSettings } from '@/lib/workspace/settings-cache';

// Initialize Supabase client
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export interface ToolResult {
  toolName: string;
  success: boolean;
  result: any;
  message: string;
}

/**
 * Tools available for the AI Agent
 */
export const AgentTools = {
  
  /**
   * Check stock for a specific product
   */
  checkStock: async (workspaceId: string, searchQuery: string): Promise<ToolResult> => {
    try {
      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, stock_quantity, price, variations')
        .eq('workspace_id', workspaceId)
        .ilike('name', `%${searchQuery}%`)
        .limit(3);
        
      if (error) throw error;
      
      if (!products || products.length === 0) {
        return {
          toolName: 'checkStock',
          success: true,
          result: { found: false },
          message: `Products matching "${searchQuery}" not found.`
        };
      }
      
      // Format product info for AI
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stockInfo = (products as any[]).map(p => ({
        name: p.name,
        stock: p.stock_quantity ?? 'Unknown',
        price: p.price,
        variations: p.variations
      }));
      
      return {
        toolName: 'checkStock',
        success: true,
        result: { found: true, products: stockInfo },
        message: `Found ${products.length} products. Stock info: ${JSON.stringify(stockInfo)}`
      };
    } catch (error: any) {
      return {
        toolName: 'checkStock',
        success: false,
        result: null,
        message: `Error checking stock: ${error.message}`
      };
    }
  },

  /**
   * Track order status by phone number
   */
  trackOrder: async (workspaceId: string, phone: string): Promise<ToolResult> => {
    try {
      // Normalize phone
      const normalizedPhone = phone.replace(/[^0-9]/g, '').slice(-11);
      
      const { data: orders, error } = await supabase
        .from('orders')
        .select('order_number, status, total_amount, created_at, delivery_address')
        .eq('workspace_id', workspaceId)
        .ilike('customer_phone', `%${normalizedPhone}%`)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (error) throw error;
      
      if (!orders || orders.length === 0) {
        return {
          toolName: 'trackOrder',
          success: true,
          result: { found: false },
          message: `No recent orders found for phone ${phone}.`
        };
      }
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const order = orders[0] as any;
      
      return {
        toolName: 'trackOrder',
        success: true,
        result: { found: true, order },
        message: `Found recent order #${order.order_number}. Status: ${order.status}. Date: ${new Date(order.created_at).toLocaleDateString()}`
      };
    } catch (error: any) {
      return {
        toolName: 'trackOrder',
        success: false,
        result: null,
        message: `Error tracking order: ${error.message}`
      };
    }
  },
  
  /**
   * Calculate precise delivery charge
   */
  calculateDelivery: async (address: string, settings: WorkspaceSettings): Promise<ToolResult> => {
    const charge = getDeliveryCharge(address, settings);
    return {
      toolName: 'calculateDelivery',
      success: true,
      result: { charge },
      message: `Delivery charge for "${address}" is ৳${charge}`
    };
  }
};
