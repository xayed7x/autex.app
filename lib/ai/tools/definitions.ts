/**
 * Tool Definitions — OpenAI Function Calling Schemas
 *
 * Defines the JSON schemas for every tool the AI agent can call.
 * These are passed to the OpenAI `tools` parameter.
 *
 * Important: The AI never sees or controls `workspaceId`.
 * That is injected by the orchestrator at execution time.
 *
 * @module lib/ai/tools/definitions
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

// ============================================
// TOOL SCHEMAS
// ============================================

const searchProducts: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_products',
    description:
      'Search for products in the catalog by name, description, color, or category. ' +
      'Use when a customer asks about a product, wants to see options, or describes what they want.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query. Examples: "red saree", "polo t-shirt", "shoes".',
        },
        size: {
          type: 'string',
          description: 'Specific size requested by customer (e.g., "M", "XL"). Optional.',
        },
        color: {
          type: 'string',
          description: 'Specific color requested by customer (e.g., "Red", "Blue"). Optional.',
        },
      },
      required: ['query'],
    },
  },
};

const addToCart: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'add_to_cart',
    description:
      'Add a product to the customer\'s shopping cart. ' +
      'Use after the customer confirms they want a product.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID to add.',
        },
        quantity: {
          type: 'number',
          description: 'Number of items to add. Defaults to 1.',
        },
        selectedSize: {
          type: 'string',
          description: 'Selected size (e.g., "M", "L", "XL"). Only if customer specified.',
        },
        selectedColor: {
          type: 'string',
          description: 'Selected color (e.g., "Red", "Blue"). Only if customer specified.',
        },
        negotiatedPrice: {
          type: 'number',
          description: 'If a price was negotiated and customer agreed, pass the final agreed price here. This overrides the listed price.',
        },
      },
      required: ['productId'],
    },
  },
};

const removeFromCart: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'remove_from_cart',
    description:
      'Remove a product from the customer\'s cart. ' +
      'Use when the customer says they don\'t want a product anymore.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID to remove from cart.',
        },
      },
      required: ['productId'],
    },
  },
};

const updateCustomerInfo: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'update_customer_info',
    description:
      'Save or update the customer\'s checkout details (name, phone, address). ' +
      'MUST be called if memory has info that is missing from the Cart State. ' +
      'You can update one or more fields at a time.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Customer\'s full name.',
        },
        phone: {
          type: 'string',
          description: 'Customer\'s phone number (Bangladesh format: 01XXXXXXXXX).',
        },
        address: {
          type: 'string',
          description: 'Customer\'s full delivery address.',
        },
        size: {
          type: 'string',
          description: 'Customer\'s selected product size, if applicable (e.g., "M", "L").',
        },
        color: {
          type: 'string',
          description: 'Customer\'s selected product color, if applicable (e.g., "Red", "Blue").',
        },
        quantity: {
          type: 'number',
          description: 'Number of items the customer wants to order. Defaults to 1 if not specified.',
        },
      },
      required: ['name', 'phone', 'address'],
    },
  },
};

const saveOrder: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'save_order',
    description:
      'Finalize and save the customer\'s order to the database. ' +
      'Call this ONLY when all required information is collected: ' +
      'cart has items, customer name, valid phone number, and delivery address. ' +
      'Do NOT generate order confirmation or payment messages after calling this — the system handles those automatically.',
    parameters: {
      type: 'object',
      properties: {
        customerName: {
          type: 'string',
          description: 'Customer\'s full name.',
        },
        customerPhone: {
          type: 'string',
          description: 'Customer\'s phone number.',
        },
        customerAddress: {
          type: 'string',
          description: 'Full delivery address.',
        },
        note: {
          type: 'string',
          description: 'Optional delivery note.',
        },
      },
      required: ['customerName', 'customerPhone', 'customerAddress'],
    },
  },
};

const flagForReview: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'flag_for_review',
    description:
      'Flag this conversation for manual review by the business owner. ' +
      'Use when you cannot answer the customer\'s question, when something feels wrong, ' +
      'or when the customer requests to speak with a human.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason for flagging (e.g., "Customer asking about warranty policy not in my knowledge").',
        },
      },
      required: ['reason'],
    },
  },
};

const checkStock: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'check_stock',
    description:
      'Check the current stock availability for a product. ' +
      'Use when a customer asks if something is available or in stock.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Product name or search query to check stock for.',
        },
        size: {
          type: 'string',
          description: 'Specific size requested by customer (e.g., "M", "XL"). Optional.',
        },
        color: {
          type: 'string',
          description: 'Specific color requested by customer (e.g., "Red", "Blue"). Optional.',
        },
      },
      required: ['query'],
    },
  },
};

const trackOrder: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'track_order',
    description:
      'Look up a customer\'s recent order by their phone number. ' +
      'Use when a customer asks about their order status.',
    parameters: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Customer\'s phone number to look up orders for.',
        },
      },
      required: ['phone'],
    },
  },
};

const calculateDelivery: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'calculate_delivery',
    description:
      'Calculate the delivery charge for a given address. ' +
      'Use when the customer provides their address or asks about delivery costs.',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'The delivery address to calculate shipping cost for.',
        },
      },
      required: ['address'],
    },
  },
};

const collectPaymentDigits: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'collect_payment_digits',
    description:
      'Save the last 2 digits of the customer\'s bKash/Nagad transaction ID. ' +
      'Use when the customer sends exactly 2 digits after making a payment.',
    parameters: {
      type: 'object',
      properties: {
        digits: {
          type: 'string',
          description: 'Exactly 2 numeric digits from the customer\'s payment transaction.',
        },
      },
      required: ['digits'],
    },
  },
};

const recordNegotiationAttempt: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'record_negotiation_attempt',
    description:
      'Call this EVERY TIME a customer asks for a price discount or negotiation. ' +
      'This tracks which negotiation round we are on.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID the customer is negotiating for. (Optional: the tool finds it automatically from context).',
        },
        customerOfferedPrice: {
          type: 'number',
          description: 'The price requested by the customer (if they specified one).',
        },
      },
    },
  },
};

// ============================================
// EXPORTS
// ============================================

/** All tool definitions, ready to pass to OpenAI's `tools` parameter. */
export const AGENT_TOOL_DEFINITIONS: ChatCompletionTool[] = [
  searchProducts,
  addToCart,
  removeFromCart,
  updateCustomerInfo,
  saveOrder,
  flagForReview,
  checkStock,
  trackOrder,
  calculateDelivery,
  collectPaymentDigits,
  recordNegotiationAttempt,
];

/** Tool names as a union type for type-safe dispatch. */
export type AgentToolName =
  | 'search_products'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'update_customer_info'
  | 'save_order'
  | 'flag_for_review'
  | 'check_stock'
  | 'track_order'
  | 'calculate_delivery'
  | 'collect_payment_digits'
  | 'record_negotiation_attempt';
