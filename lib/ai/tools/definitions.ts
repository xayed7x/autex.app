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
      'Search the product catalog and send visual cards. ' +
      'MANDATORY CALL: Whenever a customer asks to see cakes, designs, or products. ' +
      'This is the ONLY tool that can send pictures to the customer. ' +
      'STRICT PROHIBITION: DO NOT call this if the customer has sent a custom image for pricing (Scenario 2).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query. Examples: "red saree", "polo t-shirt". Optional: If empty, the tool searches all products.',
        },
        category: {
          type: 'string',
          description: 'Filter by category: "Anniversary", "Birthday", "Wedding", "Baby Shower", "Engagement", "Islamic/Traditional", "Congratulation", "Gift/Love", or "Other". ALWAYS extract and pass this if mentioned.',
        },
        size: {
          type: 'string',
          description: 'Specific size requested by customer (e.g., "M", "XL"). Optional.',
        },
        color: {
          type: 'string',
          description: 'Specific color requested by customer (e.g., "Red", "Blue"). Optional.',
        },
        limit: {
          type: 'number',
          description: 'Number of products to return. Default: 50.',
        },
        offset: {
          type: 'number',
          description: 'Offset for pagination. For the next 20 products, use offset: 20. Default: 0.',
        },
        sendCard: {
          type: 'boolean',
          description: 'Set to TRUE only if the customer explicitly asked to SEE designs, products, or pictures. Set to FALSE if you are searching to answer a price/availability question only. If FALSE, results will be used internally but NO card will be shown to customer.',
        },
      },
      required: [],
    },
  },
};

const getAddToCart = (category: string): ChatCompletionTool => {
  const isFood = category === 'food';
  const properties: any = {
    productId: {
      type: 'string',
      description: 'The product UUID (id field) obtained from a prior search_products or check_stock tool call result. NEVER pass a product name here.',
    },
    quantity: {
      type: 'number',
      description: 'Number of items to add. Defaults to 1.',
    },
    negotiatedPrice: {
      type: 'number',
      description: 'If a price was negotiated and customer agreed, pass the final agreed price here. This overrides the listed price.',
    },
  };

  if (isFood) {
    Object.assign(properties, {
      delivery_date: {
        type: 'string',
        description: 'Required. The requested date for delivery. Format: DD/MM/YYYY.',
      },
      flavor: {
        type: 'string',
        description: 'The selected flavor (e.g. Chocolate, Vanilla).',
      },
      custom_message: {
        type: 'string',
        description: 'Custom text to write on the cake. Optional.',
      },
      customer_description: {
        type: 'string',
        description: "Detailed description of what the customer wants. Example: 'chocolate cake with red roses'.",
      },
      delivery_zone: {
        type: 'string',
        description: "The selected delivery zone label.",
      },
      inspiration_image: {
        type: 'string',
        description: "URL of the image the customer sent as reference.",
      },
    });
  } else {
    Object.assign(properties, {
      selectedSize: {
        type: 'string',
        description: 'Selected size (e.g., "M", "L", "XL"). Required for clothing.',
      },
      selectedColor: {
        type: 'string',
        description: 'Selected color (e.g., "Red", "Blue"). Required for clothing.',
      },
    });
  }

  return {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description:
        'Add a product to the cart. ' +
        'CALL WHEN: Customer explicitly confirms they want to order. ' +
        (isFood ? 'Must collect delivery_date first.' : 'Must confirm size AND color first.') +
        ' DO NOT CALL without a productId UUID.',
      parameters: {
        type: 'object',
        properties,
        required: ['productId'],
      },
    },
  };
};


const removeFromCart: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'remove_from_cart',
    description:
      'Remove a product from the cart. ' +
      'CALL WHEN: Customer says they no longer want a specific item (\'বাদ দিন\', \'cancel করুন\', \'এটা লাগবে না\'). ' +
      'DO NOT CALL based on general hesitation — only on explicit removal intent.',
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
      'Save customer\'s name, phone, and address. ' +
      'CALL WHEN: Customer provides their delivery details (any of: name, phone, address). ' +
      'CALL ONCE with all fields you have — do not call multiple times per turn. ' +
      'Phone validation is handled server-side — pass whatever the customer gave, the system will fix the format. ' +
      'If this returns success: false, communicate the "message" from the tool result clearly to the customer. DO NOT flag_for_review for validation errors; just ask the customer for the corrected information. ',
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

const getSaveOrder = (category: string): ChatCompletionTool => {
  const isFood = category === 'food';
  const properties: any = {
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
  };

  if (isFood) {
    Object.assign(properties, {
      delivery_date: {
        type: 'string',
        description: 'Required. Delivery date (DD/MM/YYYY).',
      },
      delivery_time: {
        type: 'string',
        description: 'Delivery time/slot (e.g., "before 3 PM").',
      },
      flavor: {
        type: 'string',
        description: 'Selected flavor.',
      },
      weight: {
        type: 'string',
        description: 'Selected weight.',
      },
      custom_message: {
        type: 'string',
        description: 'Text to write on cake.',
      },
      pounds_ordered: {
        type: 'number',
        description: 'Pounds ordered.',
      },
      customer_description: {
        type: 'string',
        description: "Detailed vision description.",
      },
      delivery_zone: {
        type: 'string',
        description: "Delivery zone label.",
      },
      inspiration_image: {
        type: 'string',
        description: "URL of reference image.",
      },
    });
  }

  return {
    type: 'function',
    function: {
      name: 'save_order',
      description:
        'Finalize and save order. ' +
        'CALL ONLY WHEN ALL fields (Name, Phone, Address' + (isFood ? ', Delivery Date' : '') + ') are confirmed AND customer says yes to summary. ' +
        'DO NOT call before summary confirmation.',
      parameters: {
        type: 'object',
        properties,
        required: (isFood ? [] : ['customerName']).concat(['customerPhone', 'customerAddress']).concat(isFood ? ['delivery_date'] : []),
      },
    },
  };
};


const flagForReview: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'flag_for_review',
    description:
      'Escalate this conversation to the business owner for manual handling. ⚠️ SILENT ACTION: NEVER mention "flag_for_review" to the customer. ' +
      'CALL ONLY FOR: (1) complaint about a received order, (2) customer explicitly asks to speak with a human, (3) a technical error or tool failure. ' +
      '\n\nDO NOT CALL FOR: custom design requests, price inquiries, weight/size questions, delivery charges, payment methods, or any question you can answer from your context. ' +
      'Handle custom designs per the rules in your prompt (Scenario 2). Overuse of this tool is a critical failure.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason for flagging (e.g., "Customer asking about warranty policy not in my knowledge", "Serious complaint about product damage", "Explicit request for human support").',
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
      'Check live stock availability for a specific product+variant combination. ' +
      'CALL WHEN: You need to verify a specific size+color is available BEFORE adding to cart. Also call when customer asks \'আছে?\' about a specific variant. ' +
      'USE INSTEAD OF search_products when the productId is already known. ' +
      'DO NOT confuse with search_products — this is for stock verification, not product discovery.',
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
        sendCard: {
          type: 'boolean',
          description: 
            'Whether to send a visual product card to the customer. ' +
            'Set false if the product card was already sent or the customer already saw the product. ' +
            'Default: false.',
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
      'Look up an existing order by the customer\'s phone number. ' +
      'CALL WHEN: Customer asks about a previous order status, delivery update, or says \'আমার অর্ডার কোথায়?\'. ' +
      'AFTER calling: Always flag_for_review — order tracking requires human confirmation. Do not make up status.',
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
      'Calculate delivery charge for an address. ' +
      'CALL WHEN: Customer provides their delivery address during order flow. ' +
      'CALL BEFORE showing the order summary — the delivery charge MUST come from this tool result, never from memory or assumption. ' +
      'DO NOT estimate or guess delivery charge under any circumstance.',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'The delivery address to calculate shipping cost for.',
        },
        delivery_zone: {
          type: 'string',
          description: 'Optional: The selected delivery zone label (e.g., জেলা সদর, উপজেলা). Use this to ensure accuracy if the address is ambiguous.',
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
      'Save the last 2 digits of the customer\'s bKash/Nagad transaction. ' +
      'CALL WHEN: awaitingPaymentDigits is true in metadata AND customer sends a message containing exactly 2 digits (even inside a sentence like \'আমার last digit 54\'). ' +
      'DO NOT call for any other purpose. After calling successfully, STOP — do not restart order flow.',
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
      'MUST be called BEFORE writing any counter-price in your response. ' +
      'CALL WHEN: Customer asks for a discount, offers a lower price, or says anything like \'কমবে?\', \'একটু কম হবে?\', \'৳X দেবো\'. ' +
      'CRITICAL SEQUENCE: Call this tool FIRST → read the result (currentRound, minPrice, negotiable, bulkDiscount) → THEN write your response using those numbers. ' +
      'NEVER write a price in your response before calling this tool when negotiation is happening. ' +
      'If negotiable: false in result, decline warmly and do not call again.',
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

const sendImage: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'send_image',
    description: 
      'Send a standalone image or video attachment to the customer. ' +
      'CALL WHEN: Customer asks for "real photos", "photos", or "videos" of a product. ' +
      'Use the media identifiers provided in the Extra Media section. ' +
      'Call this once per mediaId you want to send. ' +
      'CRITICAL: Calling this tool DELIVERS the media directly. ' +
      'DO NOT include any image identifiers in your text response.',
    parameters: {
      type: 'object',
      properties: {
        mediaId: {
          type: 'string',
          description: 'The identifier of the image or video to send (e.g., "image_1", "video_1").',
        },
      },
      required: ['mediaId'],
    },
  },
};

const triggerQuickForm: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'trigger_quick_form',
    description:
      'Triggers the system to send the official Quick Form template configured in the AI Setup dashboard. ' +
      'CALL WHEN: A customer is ready to complete their order. ' +
      'STRICT RULE: Do NOT type the form fields in your response. Call this tool and stay SILENT or provide a warm confirmation.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

// ============================================
// EXPORTS
// ============================================

/** 
 * Factory to get tool definitions based on business category.
 * This enforces strict "Two Worlds" isolation at the API level.
 */
export function getToolsForCategory(category: string): ChatCompletionTool[] {
  return [
    searchProducts,
    getAddToCart(category),
    removeFromCart,
    updateCustomerInfo,
    getSaveOrder(category),
    flagForReview,
    checkStock,
    trackOrder,
    calculateDelivery,
    collectPaymentDigits,
    recordNegotiationAttempt,
    sendImage,
    triggerQuickForm,
  ];
}

/** 
 * Default definitions (for backward compatibility or non-categorized systems)
 */
export const AGENT_TOOL_DEFINITIONS = getToolsForCategory('general');


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
  | 'record_negotiation_attempt'
  | 'send_image'
  | 'trigger_quick_form';
