
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
  conversationExamples: [],
  businessContext: '',
  deliveryZones: []
};

async function testRules() {
  console.log('🧪 Testing Food Agent Rules...\n');

  // TEST 1: Rule 1 - Image Silence
  console.log('--- TEST 1: Image Only (Silence) ---');
  const input1: AgentInput = {
    workspaceId: 'test-ws',
    fbPageId: 'test-page',
    conversationId: 'test-conv-1',
    messageText: '', // Image only
    customerPsid: 'cust-1',
    imageRecognitionResult: {
      url: 'http://example.com/cake.jpg',
      timestamp: Date.now(),
      recognitionResult: {
        success: false,
        isInspiration: true,
        aiAnalysis: 'A beautiful birthday cake with blue frosting.'
      }
    },
    conversationHistory: [],
    memorySummary: null,
    context: { cart: [], checkout: {}, metadata: { activeCustomDesign: true } },
    settings: mockSettings,
  };
  const result1 = await runFoodAgent(input1);
  console.log(`Response: "${result1.response}" (Expected: "")\n`);

  // TEST 2: Rule 2 - Customization Acknowledgment
  console.log('--- TEST 2: Customization Description ---');
  const input2: AgentInput = {
    ...input1,
    messageText: 'এই ডিজাইনটা কি নীল কালারের হবে?',
    conversationHistory: [{ role: 'user', content: '[Customer sent an image]' }],
    context: { cart: [], checkout: {}, metadata: { activeCustomDesign: true } },
  };
  const result2 = await runFoodAgent(input2);
  console.log(`Response: "${result2.response}"\n`);

  // TEST 3: Rule 3 - Price Wait Message (First Time)
  console.log('--- TEST 3: Price Ask (First Time) ---');
  const input3: AgentInput = {
    ...input2,
    messageText: 'এটার দাম কত হবে?',
    conversationHistory: [
      { role: 'user', content: '[Customer sent an image]' },
      { role: 'user', content: 'এই ডিজাইনটা কি নীল কালারের হবে?' },
      { role: 'assistant', content: result2.response }
    ],
  };
  const result3 = await runFoodAgent(input3);
  console.log(`Response: "${result3.response}"\n`);

  // TEST 4: Rule 3 - Price Wait Message (Repeat)
  console.log('--- TEST 4: Price Ask (Repeat) ---');
  const input4: AgentInput = {
    ...input3,
    messageText: 'ভাই দামটা বলেন',
    conversationHistory: [
      ...input3.conversationHistory,
      { role: 'user', content: 'এটার দাম কত হবে?' },
      { role: 'assistant', content: result3.response }
    ],
  };
  const result4 = await runFoodAgent(input4);
  console.log(`Response: "${result4.response}" (Expected: "")\n`);
}

testRules().catch(console.error);
