/**
 * Reply templates for conversation bot
 * All messages in Bangla/English mix with emojis
 */

export interface ReplyParams {
  productName?: string;
  price?: number;
  name?: string;
  phone?: string;
  address?: string;
  deliveryCharge?: number;
  totalAmount?: number;
  orderId?: string;
  paymentNumber?: string;
  paymentLastTwoDigits?: string;
}

/**
 * Bot reply templates
 */
export const Replies = {
  /**
   * When product is found from image
   */
  PRODUCT_FOUND: (params: ReplyParams) => {
    const { productName, price } = params;
    return `দারুণ! এটা তো আমাদের ${productName}! 😊

📦 Product: ${productName}
💰 Price: ৳${price}
✅ Stock: Available
🚚 Delivery: ৳60 (ঢাকার মধ্যে)
🚚 Delivery: ৳120 (ঢাকার বাইরে)

অর্ডার করতে চান? 🛒`;
  },

  /**
   * When product is not found
   */
  PRODUCT_NOT_FOUND: () => {
    return `দুঃখিত! 😔 এই product টা আমাদের কাছে নেই।

আপনি চাইলে:
1️⃣ অন্য product এর ছবি পাঠান
2️⃣ অথবা আমাদের catalog দেখুন

কিভাবে সাহায্য করতে পারি? 🤔`;
  },

  /**
   * Ask for customer name
   */
  ASK_NAME: () => {
    return `দারুণ! 🎉

আপনার সম্পূর্ণ নামটি বলবেন?
(Example: Zayed Bin Hamid)`;
  },

  /**
   * Ask for phone number
   */
  ASK_PHONE: (params: ReplyParams) => {
    const { name } = params;
    return `ধন্যবাদ ${name}! 
এখন আপনার ফোন নম্বর দিন। 📱`;
  },

  /**
   * Ask for address
   */
  ASK_ADDRESS: () => {
    return `পেয়েছি! ✅
এখন আপনার ডেলিভারি ঠিকানাটি দিন।
Example: House 123, Road 4, Dhanmondi, Dhaka`;
  },

  /**
   * Invalid phone number
   */
  INVALID_PHONE: () => {
    return `⚠️ Phone number টা ঠিক মনে হচ্ছে না।

সঠিক Bangladesh phone number দিন:
Example: 01812345678

আবার চেষ্টা করুন। 📱`;
  },

  /**
   * Order summary for confirmation
   */
  ORDER_SUMMARY: (params: ReplyParams) => {
    const { name, productName, price, deliveryCharge, totalAmount, address } = params;
    return `পারফেক্ট ${name}! 👌
একটু confirm করে নিই...

📋 Order Summary:
📦 ${productName}
💰 Price: ৳${price}
🚚 Delivery: ৳${deliveryCharge}
💵 Total: ৳${totalAmount}

📍 ${address}

Confirm করতে 'YES' লিখুন। ✅`;
  },

  /**
   * Payment instructions after order confirmation
   */
  PAYMENT_INSTRUCTIONS: (params: ReplyParams) => {
    const { totalAmount, paymentNumber } = params;
    return `✅ অর্ডার confirm হয়েছে!

💰 Payment options:
৳${totalAmount} টাকা পাঠান:
${paymentNumber || '{{PAYMENT_DETAILS}}'}

Payment করার পর শেষের ২ ডিজিট (last 2 digits) পাঠান। 🔢

Example: যদি transaction ID হয় BKC123456**78**, তাহলে পাঠান: 78`;
  },

  /**
   * Ask for last 2 digits of payment
   */
  ASK_PAYMENT_DIGITS: () => {
    return `Payment করেছেন? ✅

Transaction ID এর শেষের ২ ডিজিট পাঠান। 🔢

Example: যদি transaction ID শেষে 45 থাকে, তাহলে শুধু 45 লিখুন।`;
  },

  /**
   * Invalid payment digits format
   */
  INVALID_PAYMENT_DIGITS: () => {
    return `⚠️ দুঃখিত! শুধু ২টা digit দিতে হবে।

Example: 78 বা 45

আবার চেষ্টা করুন। 🔢`;
  },

  /**
   * Payment review message
   */
  PAYMENT_REVIEW: (params: ReplyParams) => {
    const { name, paymentLastTwoDigits } = params;
    return `ধন্যবাদ ${name}! 🙏

আপনার payment digits (${paymentLastTwoDigits}) পেয়েছি। ✅

আমরা এখন payment verify করবো। সফল হলে ৩ দিনের মধ্যে আপনার order deliver করা হবে। 📦

আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉`;
  },

  /**
   * Order confirmed
   */
  ORDER_CONFIRMED: (params: ReplyParams) => {
    const { orderId, name, deliveryCharge } = params;
    return `🎉 অর্ডারটি কনফার্ম করা হয়েছে! ✅
Order ID: #${orderId}
Delivery Charge: ৳${deliveryCharge}
bKash: 01812345678

আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ ${name}! 🎉

আপনার product টি ৩-৫ কার্যদিবসের মধ্যে পৌঁছে যাবে। 🚚`;
  },

  /**
   * Order cancelled
   */
  ORDER_CANCELLED: () => {
    return `ঠিক আছে! অর্ডার cancel করা হলো। ❌

নতুন করে অর্ডার করতে চাইলে product এর ছবি পাঠান। 📸`;
  },

  /**
   * Generic error message
   */
  ERROR: () => {
    return `দুঃখিত! কিছু একটা সমস্যা হয়েছে। 😔

আবার চেষ্টা করুন অথবা আমাদের সাথে যোগাযোগ করুন:
📞 01812345678`;
  },

  /**
   * Help message
   */
  HELP: () => {
    return `আমি আপনাকে সাহায্য করতে পারি! 😊

কিভাবে অর্ডার করবেন:
1️⃣ Product এর ছবি পাঠান
2️⃣ আমি product খুঁজে দেব
3️⃣ Confirm করুন
4️⃣ নাম, ফোন, ঠিকানা দিন
5️⃣ Order confirmed! 🎉

এখনই শুরু করতে product এর ছবি পাঠান! 📸`;
  },

  /**
   * Welcome message
   */
  WELCOME: () => {
    return `স্বাগতম! 👋

আমি আপনার shopping assistant! 🛍️

Product খুঁজতে:
📸 Product এর ছবি পাঠান
অথবা
💬 Product এর নাম লিখুন

শুরু করি? 😊`;
  },

  /**
   * Detailed product information (shown when "View Details" is clicked)
   */
  PRODUCT_DETAILS: (product: {
    name: string;
    price: number;
    description?: string;
    stock: number;
    category?: string;
    variations?: {
      colors?: string[];
      sizes?: string[];
    };
  }) => {
    let message = `📦 ${product.name}\n\n`;
    
    if (product.description) {
      message += `📝 Description:\n${product.description}\n\n`;
    }
    
    message += `💰 Price: ৳${product.price.toLocaleString()}\n`;
    message += `📊 Stock: ${product.stock} units available\n`;
    
    if (product.category) {
      message += `🏷️ Category: ${product.category}\n`;
    }
    
    if (product.variations?.colors && product.variations.colors.length > 0) {
      message += `🎨 Available Colors: ${product.variations.colors.join(', ')}\n`;
    }
    
    if (product.variations?.sizes && product.variations.sizes.length > 0) {
      message += `📏 Available Sizes: ${product.variations.sizes.join(', ')}\n`;
    }
    
    message += `\n✅ Stock: ${product.stock > 0 ? 'In Stock' : 'Out of Stock'}\n`;
    message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    message += `অর্ডার করতে:\n`;
    message += `🔘 'Order Now' বাটনে ক্লিক করুন\n`;
    message += `অথবা\n`;
    message += `✍️ টাইপ করুন: "order korbo" বা "nibo"`;
    
    return message;
  },
};

/**
 * Helper to format price in Bangladeshi Taka
 */
export function formatPrice(amount: number): string {
  return `৳${amount.toLocaleString('en-BD')}`;
}

/**
 * Helper to generate order number
 */
export function generateOrderNumber(): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${timestamp}${random}`;
}
