import { Database } from '@/types/supabase';

type Product = Database['public']['Tables']['products']['Row'];

/**
 * Facebook Generic Template Element for Product Card
 */
interface GenericTemplateElement {
  title: string;
  subtitle?: string;
  image_url?: string;
  default_action?: {
    type: 'web_url';
    url: string;
    webview_height_ratio?: 'compact' | 'tall' | 'full';
  };
  buttons?: Array<{
    type: 'postback' | 'web_url';
    title: string;
    payload?: string;
    url?: string;
  }>;
}

/**
 * Facebook Generic Template Message
 */
interface GenericTemplateMessage {
  attachment: {
    type: 'template';
    payload: {
      template_type: 'generic';
      elements: GenericTemplateElement[];
    };
  };
}

/**
 * Creates a Facebook Generic Template product card message.
 * This displays a product with image, details, and action buttons in Messenger.
 * 
 * @param product - The product to display
 * @param pageId - The Facebook Page ID (for context, not used in template)
 * @param psid - The recipient's Page-Scoped ID (for context, not used in template)
 * @returns Facebook Generic Template message object
 */
export function createProductCard(
  product: Product,
  pageId: string,
  psid: string
): GenericTemplateMessage {
  // Determine stock status
  const stockStatus = (product.stock_quantity ?? 0) > 0 ? 'Available' : 'Out of Stock';
  
  // Format price with Bangladeshi Taka symbol
  const formattedPrice = `৳${product.price.toLocaleString('en-BD')}`;
  
  // Create subtitle with price and stock info
  const subtitle = `Price: ${formattedPrice} | Stock: ${stockStatus}`;
  
  // Get the first image URL or use a placeholder
  const imageUrl = product.image_urls && product.image_urls.length > 0
    ? product.image_urls[0]
    : undefined;
  
  // Create the Generic Template element
  const element: GenericTemplateElement = {
    title: product.name,
    subtitle: subtitle,
    image_url: imageUrl,
    buttons: [
      {
        type: 'postback',
        title: '🛒 Order Now',
        payload: `ORDER_NOW_${product.id}`,
      },
      {
        type: 'postback',
        title: 'ℹ️ View Details',
        payload: `VIEW_DETAILS_${product.id}`,
      },
    ],
  };
  
  // Return the complete Generic Template message
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        elements: [element],
      },
    },
  };
}

/**
 * Creates a carousel of multiple product cards.
 * Displays up to 10 products in a horizontal scrollable carousel.
 * 
 * @param products - Array of products to display (max 10)
 * @param pageId - The Facebook Page ID
 * @param psid - The recipient's Page-Scoped ID
 * @returns Facebook Generic Template message with multiple elements
 */
export function createProductCarousel(
  products: Product[],
  pageId: string,
  psid: string
): GenericTemplateMessage {
  // Facebook limits Generic Template to 10 elements
  const limitedProducts = products.slice(0, 10);
  
  // Create an element for each product
  const elements: GenericTemplateElement[] = limitedProducts.map((product) => {
    const stockStatus = (product.stock_quantity ?? 0) > 0 ? 'Available' : 'Out of Stock';
    const formattedPrice = `৳${product.price.toLocaleString('en-BD')}`;
    const subtitle = `Price: ${formattedPrice} | Stock: ${stockStatus}`;
    const imageUrl = product.image_urls && product.image_urls.length > 0
      ? product.image_urls[0]
      : undefined;
    
    return {
      title: product.name,
      subtitle: subtitle,
      image_url: imageUrl,
      buttons: [
        {
          type: 'postback',
          title: '🛒 Order Now',
          payload: `ORDER_NOW_${product.id}`,
        },
        {
          type: 'postback',
          title: 'ℹ️ View Details',
          payload: `VIEW_DETAILS_${product.id}`,
        },
      ],
    };
  });
  
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        elements: elements,
      },
    },
  };
}

/**
 * Creates a detailed product view with full description.
 * Used when user clicks "View Details" button.
 * 
 * @param product - The product to display
 * @param pageId - The Facebook Page ID
 * @param psid - The recipient's Page-Scoped ID
 * @returns Facebook Generic Template message with detailed info
 */
export function createProductDetailsCard(
  product: Product,
  pageId: string,
  psid: string
): GenericTemplateMessage {
  const stockStatus = (product.stock_quantity ?? 0) > 0 
    ? `✅ In Stock (${product.stock_quantity} available)` 
    : '❌ Out of Stock';
  
  const formattedPrice = `৳${product.price.toLocaleString('en-BD')}`;
  
  // Create detailed subtitle with description
  let subtitle = `Price: ${formattedPrice}\n${stockStatus}`;
  
  if (product.category) {
    subtitle += `\nCategory: ${product.category}`;
  }
  
  if (product.description) {
    // Limit description to 80 characters for subtitle (Facebook limit)
    const truncatedDesc = product.description.length > 80
      ? product.description.substring(0, 77) + '...'
      : product.description;
    subtitle += `\n\n${truncatedDesc}`;
  }
  
  const imageUrl = product.image_urls && product.image_urls.length > 0
    ? product.image_urls[0]
    : undefined;
  
  const element: GenericTemplateElement = {
    title: product.name,
    subtitle: subtitle,
    image_url: imageUrl,
    buttons: [
      {
        type: 'postback',
        title: '🛒 Order Now',
        payload: `ORDER_NOW_${product.id}`,
      },
      {
        type: 'postback',
        title: '🔙 Back to Search',
        payload: 'BACK_TO_SEARCH',
      },
    ],
  };
  
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        elements: [element],
      },
    },
  };
}

/**
 * Creates a "Quick Reply" message for product search results.
 * Allows users to quickly select from search results.
 * 
 * @param text - The message text
 * @param products - Array of products for quick replies (max 13)
 * @returns Message with quick reply buttons
 */
export function createProductQuickReplies(
  text: string,
  products: Product[]
): {
  text: string;
  quick_replies: Array<{
    content_type: 'text';
    title: string;
    payload: string;
  }>;
} {
  // Facebook limits quick replies to 13
  const limitedProducts = products.slice(0, 13);
  
  const quickReplies = limitedProducts.map((product) => ({
    content_type: 'text' as const,
    title: product.name.substring(0, 20), // Max 20 characters for quick reply title
    payload: `SELECT_PRODUCT_${product.id}`,
  }));
  
  return {
    text: text,
    quick_replies: quickReplies,
  };
}
