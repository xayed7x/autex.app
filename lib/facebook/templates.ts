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
 */
export function createProductCard(
  product: any,
  pageId: string,
  psid: string,
  businessCategory?: string
): GenericTemplateMessage {
  const isFood = businessCategory === 'food';
  const formattedPrice = `${product.price.toLocaleString('en-BD')}`;
  
  let subtitle = '';
  let buttons = [];

  if (isFood) {
    subtitle = formattedPrice;
    
    buttons = [
      {
        type: 'postback' as const,
        title: 'Order now',
        payload: `ORDER_NOW_${product.id}`,
      },
    ];
  } else {
    const stockStatus = (product.stock_quantity ?? 0) > 0 ? 'Available' : 'Out of Stock';
    subtitle = `Price: ${formattedPrice} | Stock: ${stockStatus}`;
    
    buttons = [
      {
        type: 'postback' as const,
        title: 'Order now',
        payload: `ORDER_NOW_${product.id}`,
      },
      {
        type: 'postback' as const,
        title: 'ℹ️ View Details',
        payload: `VIEW_DETAILS_${product.id}`,
      },
    ];
  }
  
  const imageUrl = product.imageUrl || (product.image_urls && product.image_urls.length > 0 ? product.image_urls[0] : undefined);
  
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        image_aspect_ratio: isFood ? 'square' : 'horizontal',
        elements: [
          {
            title: `2 pound — ${product.price.toLocaleString('en-BD')}`,
            subtitle: isFood ? undefined : subtitle,
            image_url: imageUrl,
            buttons: buttons,
          },
        ],
      },
    },
  };
}

/**
 * Creates a carousel of multiple product cards.
 */
export function createProductCarousel(
  products: any[],
  pageId: string,
  psid: string,
  businessCategory?: string
): GenericTemplateMessage {
  const isFood = businessCategory === 'food';
  const limitedProducts = products.slice(0, 10);
  
  const elements: GenericTemplateElement[] = limitedProducts.map((product) => {
    const formattedPrice = `${product.price.toLocaleString('en-BD')}`;
    let subtitle = '';
    let buttons = [];

    if (isFood) {
      subtitle = formattedPrice;
      
      buttons = [
        {
          type: 'postback' as const,
          title: 'Order now',
          payload: `ORDER_NOW_${product.id}`,
        },
      ];
    } else {
      const stockStatus = (product.stock_quantity ?? 0) > 0 ? 'Available' : 'Out of Stock';
      subtitle = `Price: ${formattedPrice} | Stock: ${stockStatus}`;
      
      buttons = [
        {
          type: 'postback' as const,
          title: 'Order now',
          payload: `ORDER_NOW_${product.id}`,
        },
        {
          type: 'postback' as const,
          title: 'ℹ️ View Details',
          payload: `VIEW_DETAILS_${product.id}`,
        },
      ];
    }

    const imageUrl = product.imageUrl || (product.image_urls && product.image_urls.length > 0 ? product.image_urls[0] : undefined);
    
    return {
      title: `2 pound — ${product.price.toLocaleString('en-BD')}`,
      subtitle: isFood ? undefined : subtitle,
      image_url: imageUrl,
      buttons: buttons,
    };
  });
  
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        image_aspect_ratio: isFood ? 'square' : 'horizontal',
        elements: elements,
      },
    },
  };
}

/**
 * Creates a detailed product view with full description.
 */
export function createProductDetailsCard(
  product: any,
  pageId: string,
  psid: string,
  businessCategory?: string
): GenericTemplateMessage {
  const isFood = businessCategory === 'food';
  const formattedPrice = `${product.price.toLocaleString('en-BD')}`;
  
  let subtitle = formattedPrice;
  
  if (product.description) {
    const truncatedDesc = product.description.length > 80
      ? product.description.substring(0, 77) + '...'
      : product.description;
    subtitle += `\n\n${truncatedDesc}`;
  }
  
  const imageUrl = product.imageUrl || (product.image_urls && product.image_urls.length > 0 ? product.image_urls[0] : undefined);
  
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        image_aspect_ratio: isFood ? 'square' : 'horizontal',
        elements: [
          {
            title: product.name,
            subtitle: subtitle,
            image_url: imageUrl,
            buttons: [
              {
                type: 'postback' as const,
                title: 'Order now',
                payload: `ORDER_NOW_${product.id}`,
              },
              {
                type: 'postback' as const,
                title: '🔙 Back',
                payload: 'BACK_TO_SEARCH',
              },
            ],
          },
        ],
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
