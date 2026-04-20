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
  // Order Status Notification Messages
  statusConfirmed: string;
  statusDelivered: string;
  statusCancelled: string;
}

export interface ConversationExample {
  id: string;
  customer: string;
  agent: string;
  scenario?: 'negotiation' | 'greeting' | 'complaint' | 'product_inquiry' | 'out_of_stock';
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
  out_of_stock_message: string;
  // Business Policies
  returnPolicy: string;
  exchangePolicy: string;
  qualityGuarantee: string;
  businessCategory: string;
  businessAddress: string;
  customFaqs: Array<{ question: string; answer: string }>;
  conversationExamples: ConversationExample[];
  businessContext: string;
  deliveryZones: Array<{ label: string; amount: number }>;
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
    bkash: { enabled: false, number: "" },
    nagad: { enabled: false, number: "" },
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
    orderConfirmed: "আলহামদুলিল্লাহ! অর্ডারটা confirm হয়ে গেছে ✅\n\nআমরা ২৪ ঘণ্টার মধ্যে call দেব, তারপর ৩-৫ দিনে delivery হবে ইনশাআল্লাহ 🚚\n\nআপনার product টার জন্য অপেক্ষা করেন — হতাশ হবেন না ইনশাআল্লাহ! 😊\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🙏",
    orderCancelled: "অর্ডার cancel করা হয়েছে। 😊\n\nকোনো সমস্যা নেই! নতুন অর্ডার করতে product এর ছবি পাঠান।",
    paymentInstructions: "💰 ডেলিভারি চার্জ ৳{deliveryCharge} টাকা advance পাঠান:\n{paymentNumber}\n\n✅ Payment করার পর transaction ID এর শেষ ২ ডিজিট পাঠান।\n\nExample: যদি transaction ID হয় BKC123456**78**, তাহলে পাঠান: 78",
    paymentReview: "ধন্যবাদ {name}! 🙏\n\nআপনার payment digits ({digits}) পেয়েছি। ✅\n\nআমরা এখন payment verify করবো। সফল হলে ৩ দিনের মধ্যে আপনার order deliver করা হবে। 📦\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉",
    invalidPaymentDigits: "⚠️ দুঃখিত! শুধু ২টা digit দিতে হবে।\n\nExample: 78 বা 45\n\nআবার চেষ্টা করুন। 🔢",
    // Dynamic interruption messages
    deliveryInfo: "[Configure in AI Setup]",
    returnPolicy: "[Configure in AI Setup]",
    paymentInfo: "[Configure in AI Setup]",
    urgencyResponse: "🚀 চিন্তার কারণ নেই! আমরা দ্রুত ডেলিভারি নিশ্চিত করি।",
    objectionResponse: "✨ আপনি নিশ্চিন্তে অর্ডার করতে পারেন!",
    sellerInfo: "[Configure in AI Setup]",
    // Order Status Notification Messages
    statusConfirmed: "আলহামদুলিল্লাহ {name} ভাইয়া! 🎉\nআপনার অর্ডারটি confirm করা হয়েছে।\nআপনার পণ্য ইনশাআল্লাহ {deliveryDays} দিনের মধ্যে পৌঁছে যাবে। 📦\nআমাদের সাথে কেনাকাটার জন্য অনেক ধন্যবাদ! 🙏",
    statusDelivered: "আলহামদুলিল্লাহ {name}! আপনার পার্সেলটি সফলভাবে ডেলিভারি করা হয়েছে। 📦\nপণ্যটি হাতে পেয়ে কেমন লেগেছে, তা জানাতে ভুলবেন না! 😍\nআমাদের সাথে থাকার জন্য ধন্যবাদ! 🙏",
    statusCancelled: "দুঃখিত {name}, আপনার অর্ডারটি (Order #{orderNumber}) কোনো কারণবশত cancel করা হয়েছে। 😔\nযদি কোনো প্রশ্ন থাকে, তাহলে দয়া করে আমাদের জানাবেন। 🙏"
  },
  order_collection_style: 'conversational',
  quick_form_prompt: 'দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:',
  quick_form_error: 'দুঃখিত, আমি আপনার তথ্যটি সঠিকভাবে বুঝতে পারিনি। 😔\n\nঅনুগ্রহ করে নিচের ফর্ম্যাটে আবার দিন:\n\nনাম: আপনার নাম\nফোন: 017XXXXXXXX\nঠিকানা: আপনার সম্পূর্ণ ঠিকানা\n\nঅথবা একটি লাইন করে দিতে পারেন:\nআপনার নাম\n017XXXXXXXX\nআপনার সম্পূর্ণ ঠিকানা',
  out_of_stock_message: 'দুঃখিত! 😔 "{productName}" এখন স্টকে নেই।\n\nআপনি চাইলে অন্য পণ্যের নাম লিখুন বা স্ক্রিনশট পাঠান। আমরা সাহায্য করতে পারবো! 🛍️',
  // Business Policies
  returnPolicy: '',
  exchangePolicy: '',
  qualityGuarantee: '',
  businessCategory: '',
  businessAddress: '',
  customFaqs: [],
  conversationExamples: [],
  businessContext: '',
  deliveryZones: [
    { label: "জেলা সদর", amount: 150 },
    { label: "উপজেলা", amount: 200 }
  ],
};

/**
 * Transform fast_lane_messages from database (snake_case) to TypeScript (camelCase)
 */
function transformFastLaneMessages(dbMessages: any): FastLaneMessages | null {
  if (!dbMessages) return null;
  
  return {
    productConfirm: dbMessages.product_confirm || dbMessages.productConfirm,
    productDecline: dbMessages.product_decline || dbMessages.productDecline,
    nameCollected: dbMessages.name_collected || dbMessages.nameCollected,
    phoneCollected: dbMessages.phone_collected || dbMessages.phoneCollected,
    orderConfirmed: dbMessages.order_confirmed || dbMessages.orderConfirmed,
    orderCancelled: dbMessages.order_cancelled || dbMessages.orderCancelled,
    paymentInstructions: dbMessages.paymentInstructions || dbMessages.payment_instructions,
    paymentReview: dbMessages.paymentReview || dbMessages.payment_review,
    invalidPaymentDigits: dbMessages.invalidPaymentDigits || dbMessages.invalid_payment_digits,
    deliveryInfo: dbMessages.delivery_info || dbMessages.deliveryInfo,
    returnPolicy: dbMessages.return_policy || dbMessages.returnPolicy,
    paymentInfo: dbMessages.payment_info || dbMessages.paymentInfo,
    urgencyResponse: dbMessages.urgency_response || dbMessages.urgencyResponse,
    objectionResponse: dbMessages.objection_response || dbMessages.objectionResponse,
    sellerInfo: dbMessages.seller_info || dbMessages.sellerInfo,
    statusConfirmed: dbMessages.status_confirmed || dbMessages.statusConfirmed,
    statusDelivered: dbMessages.status_delivered || dbMessages.statusDelivered,
    statusCancelled: dbMessages.status_cancelled || dbMessages.statusCancelled,
  };
}

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
      // Transform fast_lane_messages from snake_case to camelCase
      fastLaneMessages: transformFastLaneMessages((settings as any).fast_lane_messages) || DEFAULT_SETTINGS.fastLaneMessages,
      order_collection_style: (settings as any).order_collection_style || DEFAULT_SETTINGS.order_collection_style,
      quick_form_prompt: (settings as any).quick_form_prompt || DEFAULT_SETTINGS.quick_form_prompt,
      quick_form_error: (settings as any).quick_form_error || DEFAULT_SETTINGS.quick_form_error,
      out_of_stock_message: (settings as any).out_of_stock_message || DEFAULT_SETTINGS.out_of_stock_message,
      // Business Policies
      returnPolicy: (settings as any).return_policy || DEFAULT_SETTINGS.returnPolicy,
      exchangePolicy: (settings as any).exchange_policy || DEFAULT_SETTINGS.exchangePolicy,
      qualityGuarantee: (settings as any).quality_guarantee || DEFAULT_SETTINGS.qualityGuarantee,
      businessCategory: (settings as any).business_category || DEFAULT_SETTINGS.businessCategory,
      businessAddress: (settings as any).business_address || DEFAULT_SETTINGS.businessAddress,
      customFaqs: (settings as any).custom_faqs || DEFAULT_SETTINGS.customFaqs,
      conversationExamples: (settings as any).conversation_examples || DEFAULT_SETTINGS.conversationExamples,
      businessContext: (settings as any).business_context || DEFAULT_SETTINGS.businessContext,
      deliveryZones: (settings as any).delivery_zones || DEFAULT_SETTINGS.deliveryZones,
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
