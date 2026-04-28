
import { runFoodAgent } from '../lib/ai/agents/food-agent';
import { AgentInput } from '../lib/ai/shared/types';
import { WorkspaceSettings } from '../lib/workspace/settings';

const mockSettings: WorkspaceSettings = {
  businessName: "Test Bakery",
  greeting: "Hello!",
  tone: "friendly",
  bengaliPercent: 100,
  useEmojis: true,
  confidenceThreshold: 75,
  deliveryCharges: { insideDhaka: 60, outsideDhaka: 120 },
  deliveryTime: "2 days",
  paymentMethods: { bkash: { enabled: true, number: "017" }, nagad: { enabled: false, number: "" }, cod: { enabled: true } },
  paymentMessage: "Pay us",
  behaviorRules: { multiProduct: false, askSize: true, showStock: true, offerAlternatives: false, sendConfirmation: true },
  fastLaneMessages: {} as any,
  order_collection_style: 'conversational',
  quick_form_prompt: '',
  out_of_stock_message: '',
  returnPolicy: '',
  exchangePolicy: '',
  qualityGuarantee: '',
  businessCategory: 'food',
  businessAddress: '',
  customFaqs: [],
  conversationExamples: [
    { customer: "আপনার দোকান কোথায়?", agent: "আমাদের কোনো ফিজিক্যাল শপ নেই, আমরা অনলাইনে হোম ডেলিভারি দিয়ে থাকি। 😊" },
    { customer: "ডেলিভারি চার্জ কত?", agent: "ঢাকার ভিতরে ডেলিভারি চার্জ ৮০ টাকা এবং ঢাকার বাইরে ১৫০ টাকা। 🚚" }
  ],
  businessContext: 'আমরা হোম মেড কেক ডেলিভারি করি। আমাদের কোনো ফিজিক্যাল শপ নেই।',
  deliveryZones: []
};

async function testRules() {
  console.log('🧪 Testing Food Agent Bible Logic...\n');

  // TEST 1: Match in Bible
  console.log('--- TEST 1: Match in Bible (Location) ---');
  const input1: AgentInput = {
    workspaceId: '00000000-0000-0000-0000-000000000000', // Valid UUID to avoid RPC error
    fbPageId: 'test-page',
    conversationId: 'test-conv-1',
    messageText: 'আপনার দোকান কোথায়?',
    customerPsid: 'cust-1',
    conversationHistory: [],
    memorySummary: null,
    context: { cart: [], checkout: {}, metadata: {} },
    settings: mockSettings,
  };
  const result1 = await runFoodAgent(input1);
  console.log(`Response: "${result1.response}"\n`);

  // TEST 2: Unknown Query (Should be Silent)
  console.log('--- TEST 2: Unknown Query (Silence) ---');
  const input2: AgentInput = {
    ...input1,
    messageText: 'আপনার প্রিয় রং কি?',
  };
  const result2 = await runFoodAgent(input2);
  console.log(`Response: "${result2.response}" (Expected: "")\n`);

  // TEST 3: Product Image Discovery
  console.log('--- TEST 3: Product Request (UI Search) ---');
  const input3: AgentInput = {
    ...input1,
    messageText: 'কিছু কেকের ডিজাইন দেখান',
  };
  const result3 = await runFoodAgent(input3);
  console.log(`Response Text: "${result3.response}"`);
  console.log(`Tool Calls: ${JSON.stringify(result3.toolCalls?.map(t => t.function.name))}\n`);

  // TEST 4: Order Intent (No Bible match = Silence)
  console.log('--- TEST 4: Order Intent (Silence if not in Bible) ---');
  const input4: AgentInput = {
    ...input1,
    messageText: 'আমি অর্ডার করতে চাই',
  };
  const result4 = await runFoodAgent(input4);
  console.log(`Response: "${result4.response}" (Expected: "")\n`);
}

testRules().catch(console.error);
