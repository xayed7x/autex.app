/**
 * Workspace Settings Helper
 * Loads AI configuration settings for a workspace
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

export interface FastLaneMessages {
  productConfirm: string;
  productDecline: string;
  nameCollected: string;
  phoneCollected: string;
  orderConfirmed: string;
  orderCancelled: string;
  paymentInstructions: string;
  paymentReview: string;
  invalidPaymentDigits: string;
  // Dynamic interruption messages
  deliveryInfo: string;
  returnPolicy: string;
  paymentInfo: string;
  urgencyResponse: string;
  objectionResponse: string;
  sellerInfo: string;
}

export interface WorkspaceSettings {
  businessName: string;
  greeting: string;
  tone: 'friendly' | 'professional' | 'casual';
  bengaliPercent: number;
  useEmojis: boolean;
  confidenceThreshold: number;
  deliveryCharges: {
    insideDhaka: number;
    outsideDhaka: number;
  };
  deliveryTime: string;
  paymentMethods: {
    bkash: { enabled: boolean; number: string };
    nagad: { enabled: boolean; number: string };
    cod: { enabled: boolean };
  };
  paymentMessage: string;
  behaviorRules: {
    multiProduct: boolean;
    askSize: boolean;
    showStock: boolean;
    offerAlternatives: boolean;
    sendConfirmation: boolean;
  };
  fastLaneMessages: FastLaneMessages;
  order_collection_style: 'conversational' | 'quick_form';
  quick_form_prompt: string;
  quick_form_error: string;
}

const DEFAULT_SETTINGS: WorkspaceSettings = {
  businessName: "Your Business",
  greeting: "আসসালামু আলাইকুম! 👋\nআমি আপনার AI assistant।\nআপনি কোন product খুঁজছেন?",
  tone: "friendly",
  bengaliPercent: 80,
  useEmojis: true,
  confidenceThreshold: 75,
  deliveryCharges: {
    insideDhaka: 60,
    outsideDhaka: 120,
  },
  deliveryTime: "3-5 business days",
  paymentMethods: {
    bkash: { enabled: true, number: "01915969330" },
    nagad: { enabled: true, number: "01915969330" },
    cod: { enabled: false },
  },
  paymentMessage: "Payment করতে আমাদের bKash এ send করুন।\nScreenshot পাঠালে আমরা verify করব।",
  behaviorRules: {
    multiProduct: false,
    askSize: true,
    showStock: true,
    offerAlternatives: false,
    sendConfirmation: true,
  },
  fastLaneMessages: {
    productConfirm: "দারুণ! 🎉\n\nআপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)",
    productDecline: "কোনো সমস্যা নেই! 😊\n\nঅন্য product এর ছবি পাঠান অথবা \"help\" লিখুন।",
    nameCollected: "আপনার সাথে পরিচিত হয়ে ভালো লাগলো, {name}! 😊\n\nএখন আপনার ফোন নম্বর দিন। 📱\n(Example: 01712345678)",
    phoneCollected: "পেয়েছি! 📱\n\nএখন আপনার ডেলিভারি ঠিকানাটি দিন। 📍\n(Example: House 123, Road 4, Dhanmondi, Dhaka)",
    orderConfirmed: "✅ অর্ডারটি কনফার্ম করা হয়েছে!\n\nআপনার অর্ডার সফলভাবে সম্পন্ন হয়েছে। শীঘ্রই আমরা আপনার সাথে যোগাযোগ করবো।\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉",
    orderCancelled: "অর্ডার cancel করা হয়েছে। 😊\n\nকোনো সমস্যা নেই! নতুন অর্ডার করতে product এর ছবি পাঠান।",
    paymentInstructions: "✅ অর্ডার confirm হয়েছে!\n\n💰 Payment options:\n৳{totalAmount} টাকা পাঠান:\n{paymentNumber}\n\nPayment করার পর শেষের ২ ডিজিট (last 2 digits) পাঠান। 🔢\n\nExample: যদি transaction ID হয় BKC123456**78**, তাহলে পাঠান: 78",
    paymentReview: "ধন্যবাদ {name}! 🙏\n\nআপনার payment digits ({digits}) পেয়েছি। ✅\n\nআমরা এখন payment verify করবো। সফল হলে ৩ দিনের মধ্যে আপনার order deliver করা হবে। 📦\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉",
    invalidPaymentDigits: "⚠️ দুঃখিত! শুধু ২টা digit দিতে হবে।\n\nExample: 78 বা 45\n\nআবার চেষ্টা করুন। 🔢",
    // Dynamic interruption messages
    deliveryInfo: "🚚 Delivery Information:\n• ঢাকার মধ্যে: ৳60\n• ঢাকার বাইরে: ৳120\n• Delivery সময়: 3-5 business days",
    returnPolicy: "🔄 Return Policy:\nপণ্য হাতে পাওয়ার পর যদি মনে হয় এটা সঠিক নয়, তাহলে ২ দিনের মধ্যে ফেরত দিতে পারবেন।\n\n• পণ্য অব্যবহৃত থাকতে হবে\n• Original packaging এ থাকতে হবে\n• ২ দিনের মধ্যে আমাদের জানাতে হবে",
    paymentInfo: "💳 Payment Methods:\nআমরা নিম্নলিখিত payment methods গ্রহণ করি:\n\n• bKash: 01915969330\n• Nagad: 01915969330\n• Cash on Delivery\n\nযেকোনো method দিয়ে payment করতে পারবেন।",
    urgencyResponse: "🚀 চিন্তার কারণ নেই! আমরা দ্রুত ডেলিভারি নিশ্চিত করি।\nঢাকার মধ্যে ২-৩ দিন এবং বাইরে ৩-৫ দিনের মধ্যে পেয়ে যাবেন।",
    objectionResponse: "✨ আমাদের প্রতিটি পণ্য ১০০% অথেনটিক এবং হাই কোয়ালিটি।\nআপনি নিশ্চিন্তে অর্ডার করতে পারেন, পছন্দ না হলে রিটার্ন করার সুযোগ তো থাকছেই!",
    sellerInfo: "🏢 আমাদের অফিস মিরপুর, ঢাকা।\n📞 প্রয়োজনে কল করুন: 01915969330\n⏰ আমরা প্রতিদিন সকাল ১০টা থেকে রাত ১০টা পর্যন্ত খোলা আছি।",
  },
  order_collection_style: 'conversational',
  quick_form_prompt: 'দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:',
  quick_form_error: 'দুঃখিত, আমি আপনার তথ্যটি সঠিকভাবে বুঝতে পারিনি। 😔\n\nঅনুগ্রহ করে নিচের ফর্ম্যাটে আবার দিন:\n\nনাম: আপনার নাম\nফোন: 017XXXXXXXX\nঠিকানা: আপনার সম্পূর্ণ ঠিকানা\n\nঅথবা একটি লাইন করে দিতে পারেন:\nআপনার নাম\n017XXXXXXXX\nআপনার সম্পূর্ণ ঠিকানা',
};

/**
 * Loads workspace settings from database
 * Returns default settings if none exist
 */
export async function loadWorkspaceSettings(
  workspaceId: string
): Promise<WorkspaceSettings> {
  try {
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

    const { data: settings, error } = await supabase
      .from('workspace_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !settings) {
      console.log('No workspace settings found, using defaults');
      return DEFAULT_SETTINGS;
    }

    return {
      businessName: (settings as any).business_name || DEFAULT_SETTINGS.businessName,
      greeting: (settings as any).greeting_message || DEFAULT_SETTINGS.greeting,
      tone: ((settings as any).conversation_tone as any) || DEFAULT_SETTINGS.tone,
      bengaliPercent: (settings as any).bengali_percent || DEFAULT_SETTINGS.bengaliPercent,
      useEmojis: (settings as any).use_emojis ?? DEFAULT_SETTINGS.useEmojis,
      confidenceThreshold: (settings as any).confidence_threshold || DEFAULT_SETTINGS.confidenceThreshold,
      deliveryCharges: {
        insideDhaka: (settings as any).delivery_charge_inside_dhaka || DEFAULT_SETTINGS.deliveryCharges.insideDhaka,
        outsideDhaka: (settings as any).delivery_charge_outside_dhaka || DEFAULT_SETTINGS.deliveryCharges.outsideDhaka,
      },
      deliveryTime: (settings as any).delivery_time || DEFAULT_SETTINGS.deliveryTime,
      paymentMethods: ((settings as any).payment_methods as any) || DEFAULT_SETTINGS.paymentMethods,
      paymentMessage: (settings as any).payment_message || DEFAULT_SETTINGS.paymentMessage,
      behaviorRules: ((settings as any).behavior_rules as any) || DEFAULT_SETTINGS.behaviorRules,
      fastLaneMessages: ((settings as any).fast_lane_messages as any) || DEFAULT_SETTINGS.fastLaneMessages,
      order_collection_style: (settings as any).order_collection_style || DEFAULT_SETTINGS.order_collection_style,
      quick_form_prompt: (settings as any).quick_form_prompt || DEFAULT_SETTINGS.quick_form_prompt,
      quick_form_error: (settings as any).quick_form_error || DEFAULT_SETTINGS.quick_form_error,
    };
  } catch (error) {
    console.error('Error loading workspace settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Gets delivery charge based on address
 */
export function getDeliveryCharge(
  address: string,
  settings: WorkspaceSettings
): number {
  const isDhaka = address.toLowerCase().includes('dhaka') || 
                  address.toLowerCase().includes('ঢাকা');
  
  return isDhaka 
    ? settings.deliveryCharges.insideDhaka 
    : settings.deliveryCharges.outsideDhaka;
}
