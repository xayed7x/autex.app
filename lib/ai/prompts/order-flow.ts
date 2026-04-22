import { WorkspaceSettings } from "@/lib/workspace/settings";

/**
 * Shared logic for building order collection instructions.
 * Preserves Quick Form vs Conversational logic while being category-aware.
 */
export function buildOrderCollectionInstruction(settings: WorkspaceSettings): string {
  const style = settings.order_collection_style || 'conversational';
  const isFood = settings.businessCategory === 'food';
  
  let sharedValidationRules = `
1. CART PERSISTENCE: You MUST call add_to_cart as soon as a product and size/color are identified. DO NOT wait for the final 'yes' to add to cart.
2. NO GHOST SUMMARIES: NEVER show the order summary block (📋 অর্ডার সামারি) unless the items are already present in the "🛒 CART" context dump at the top of your prompt.
3. FIELD VALIDATION: Before order summary, verify presence: ${isFood ? '' : 'Name, '}Phone, Address, ${isFood ? 'Delivery Date, Flavor, Weight' : 'Size (if applicable), Color (if applicable)'}.
   - If missing: Ask customer. ${isFood ? 'Bangla for delivery date: "কোন তারিখে delivery দেবো?"' : ''}
   - If present: Call check_stock THEN add_to_cart (if not already added) THEN update_customer_info THEN calculate_delivery.
4. MEDIA HANDLING (STRICT):
   - যদি কাস্টমার কোনো পণ্যের image বা video দেখতে চায়, তবে product data থেকে Extra Media চেক করুন।
   - যদি সেখানে image বা video থাকে, তবে প্রতিটি ID এর জন্য আলাদাভাবে send_image tool কল করুন।
5. DYNAMIC ATTRIBUTES: Do NOT mention "সাইজ" or "কালার" if the product doesn't have them in the catalog.
6. MEMORY CHECK: If CART STATE shows ${isFood ? '' : 'Customer Name, '}Phone, and Address already collected, send:
   "Sir, আগের তথ্য দিয়ে অর্ডার করি?
   ${isFood ? '' : '👤 [Name]\n   '}📱 [Phone]
   📍 [Address]
   confirm করতে 'হ্যাঁ' লিখুন, নতুন ঠিকানায় পাঠাতে চাইলে নতুন তথ্য দিন 😊"
7. PRE-ORDER ADD_TO_CART: If cart is empty but customer wants to order the discussed item, call add_to_cart FIRST before asking details.
8. MANDATORY SUMMARY BEFORE SAVE:
   📋 অর্ডার সামারি:
   📦 [প্রোডাক্টের নাম]
   ${isFood ? '' : '👤 নাম: [নাম]\n   '}📱 ফোন: [ফোন]
   📍 ঠিকানা: [ঠিকানা]`;

  if (isFood) {
    sharedValidationRules += `\n   📅 ডেলিভারি তারিখ ও সময়: [date] [time]\n   🎂 ফ্লেভার: [flavor]\n   ⚖️ পাউন্ড/ওজন: [weight]`;
  } else {
    sharedValidationRules += `\n   🎨 সাইজ: (ওমিট করুন যদি সাইজ না থাকে)\n   🎨 কালার: (ওমিট করুন যদি কালার না থাকে)`;
  }

  sharedValidationRules += `\n   🔢 পরিমাণ: [qty]
   💰 মূল্য: ৳[price]
   🚚 ডেলিভারি চার্জ: ৳[delivery_charge]
   💵 মোট: ৳[subtotal] + ৳[delivery_charge] = ৳[total]
   
   ⚠️ STRICT RULE: Show the full math for the total line: ৳(Cake price) + ৳(Delivery charge) = ৳(Grand total).
   
   অর্ডার কনফার্ম করতে 'yes' লিখুন ✅
   WAIT for 'yes' BEFORE calling save_order.`;


  if (style === 'quick_form') {
    const renderedForm = settings.quick_form_prompt || (isFood 
      ? `🌸✨ কেক অর্ডার ফর্ম ✨🌸\n1️⃣ জেলা সদর / উপজেলা:\n2️⃣ সম্পূর্ণ ঠিকানা:\n3️⃣ মোবাইল নম্বর:\n4️⃣ কেকের ডিজাইন ও শুভেচ্ছা বার্তা:\n5️⃣ কেকের ফ্লেভার:\n6️⃣ ডেলিভারির তারিখ ও সময়:\n\n📌 সব তথ্য একসাথে পূরণ করে দিন 😊`
      : 'দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nঠিকানা:');
    
    return `${sharedValidationRules}

**QUICK FORM MODE (EMULATE BUTTON-CLICK AESTHETIC):**
When the customer expresses intent to order a SPECIFIC identified product (after search or image recognition), you MUST send EXACTLY this structured message format:

${renderedForm}

- Send as ONE structured message.
- If customer provides partial data: Acknowledge naturally (NO NUMBERS like 1, 2, 3) and ask for the specific missing fields.
- Parse ALL customer replies at once, then call update_customer_info then calculate_delivery.
- Show ORDER SUMMARY and wait for confirmation.`.trim();
  }

  // CONVERSATIONAL MODE
  const msgs = settings.fastLaneMessages;
  const step1 = msgs?.productConfirm || 'আপনার সম্পূর্ণ নামটি বলবেন?';
  const step2 = msgs?.nameCollected || 'আপনার সাথে পরিচিত হয়ে ভালো লাগলো, {name}! 😊\n\nএখন আপনার ফোন নম্বর দিন।';
  const step3 = msgs?.phoneCollected || 'এখন আপনার ডেলিভারি ঠিকানাটি দিন।';
  const stepDecline = msgs?.productDecline || 'কোনো সমস্যা নেই! 😊\n\nঅন্য product এর ছবি পাঠান অথবা "help" লিখুন।';

  return `${sharedValidationRules}\n\n**CONVERSATIONAL MODE:**
Collect info naturally:
Step 1: Ask Name ("${step1}")
Step 2: Ask Phone ("${step2}", replace {name})
Step 3: Ask Address ("${step3}")
Step 4: If customer declines ("${stepDecline}")
${isFood ? 'Step 5: Ask Flavor ("কেকটি কি ফ্লেভারের হবে?")\nStep 6: Ask Weight ("কত পাউন্ডের কেক হবে?")\nStep 7: Ask Delivery Date ("কোন তারিখে delivery দেবো?")\nStep 8: Call update_customer_info with collected data.\nStep 9: Show ORDER SUMMARY and wait for confirmation.' : `Step 5: Call update_customer_info with collected data.
Step 6: Show ORDER SUMMARY and wait for confirmation.`}`.trim();
}
