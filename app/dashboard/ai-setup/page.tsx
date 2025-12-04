"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { TopBar } from "@/components/dashboard/top-bar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Bot,
  MessageSquare,
  Package,
  Truck,
  CreditCard,
  Settings,
  ChevronDown,
  Save,
  RotateCcw,
  Eye,
  Plus,
  ExternalLink,
  AlertTriangle,
} from "lucide-react"
import { TestChatWidget } from "@/components/chat/test-chat-widget"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { RequireFacebookPage } from "@/components/dashboard/require-facebook-page"

import { AISetupSkeleton } from "@/components/skeletons/ai-setup-skeleton"

export default function AISetupPage() {
  // State for all settings
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [businessName, setBusinessName] = useState("Code and Cortex Fashion")
  const [greeting, setGreeting] = useState(`আসসালামু আলাইকুম! 👋
আমি Code and Cortex এর AI assistant।
আপনি কোন product খুঁজছেন?`)
  const [tone, setTone] = useState("friendly")
  const [bengaliPercent, setBengaliPercent] = useState([80])
  const [confidence, setConfidence] = useState([75])
  const [useEmojis, setUseEmojis] = useState(true)
  
  // Delivery
  const [deliveryInsideDhaka, setDeliveryInsideDhaka] = useState(60)
  const [deliveryOutsideDhaka, setDeliveryOutsideDhaka] = useState(120)
  const [deliveryTime, setDeliveryTime] = useState("3-5 business days")
  const [autoDelivery, setAutoDelivery] = useState(true)
  
  // Payment
  const [bkashEnabled, setBkashEnabled] = useState(true)
  const [bkashNumber, setBkashNumber] = useState("01915969330")
  const [nagadEnabled, setNagadEnabled] = useState(true)
  const [nagadNumber, setNagadNumber] = useState("01915969330")
  const [codEnabled, setCodEnabled] = useState(false)

  // Behavior Rules
  const [multiProduct, setMultiProduct] = useState(false)
  const [askSize, setAskSize] = useState(true)
  const [showStock, setShowStock] = useState(true)
  const [offerAlternatives, setOfferAlternatives] = useState(false)
  const [sendConfirmation, setSendConfirmation] = useState(true)
  const [showImageConfirmation, setShowImageConfirmation] = useState(true)

  // Fast Lane Messages
  const [fastLaneMessages, setFastLaneMessages] = useState({
    product_confirm: "দারুণ! 🎉\n\nআপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)",
    product_decline: "কোনো সমস্যা নেই! 😊\n\nঅন্য product এর ছবি পাঠান অথবা \"help\" লিখুন।",
    name_collected: "আপনার সাথে পরিচিত হয়ে ভালো লাগলো, {name}! 😊\n\nএখন আপনার ফোন নম্বর দিন। 📱\n(Example: 01712345678)",
    phone_collected: "পেয়েছি! 📱\n\nএখন আপনার ডেলিভারি ঠিকানাটি দিন। 📍\n(Example: House 123, Road 4, Dhanmondi, Dhaka)",
    order_confirmed: "✅ অর্ডারটি কনফার্ম করা হয়েছে!\n\nআপনার অর্ডার সফলভাবে সম্পন্ন হয়েছে। শীঘ্রই আমরা আপনার সাথে যোগাযোগ করবো।\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉",
    order_cancelled: "অর্ডার cancel করা হয়েছে। 😊\n\nকোনো সমস্যা নেই! নতুন অর্ডার করতে product এর ছবি পাঠান।",
    paymentInstructions: "✅ অর্ডার confirm হয়েছে!\n\n💰 Payment options:\n৳{totalAmount} টাকা পাঠান:\n{paymentNumber}\n\nPayment করার পর শেষের ২ ডিজিট (last 2 digits) পাঠান। 🔢\n\nExample: যদি transaction ID হয় BKC123456**78**, তাহলে পাঠান: 78",
    paymentReview: "ধন্যবাদ {name}! 🙏\n\nআপনার payment digits ({digits}) পেয়েছি। ✅\n\nআমরা এখন payment verify করবো। সফল হলে ৩ দিনের মধ্যে আপনার order deliver করা হবে। 📦\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉",
    invalidPaymentDigits: "⚠️ দুঃখিত! শুধু ২টা digit দিতে হবে।\n\nExample: 78 বা 45\n\nআবার চেষ্টা করুন। 🔢",
    // Dynamic interruption messages
    delivery_info: "🚚 Delivery Information:\n• ঢাকার মধ্যে: ৳60\n• ঢাকার বাইরে: ৳120\n• Delivery সময়: 3-5 business days",
    return_policy: "🔄 Return Policy:\nপণ্য হাতে পাওয়ার পর যদি মনে হয় এটা সঠিক নয়, তাহলে ২ দিনের মধ্যে ফেরত দিতে পারবেন।\n\n• পণ্য অব্যবহৃত থাকতে হবে\n• Original packaging এ থাকতে হবে\n• ২ দিনের মধ্যে আমাদের জানাতে হবে",
    payment_info: "💳 Payment Methods:\nআমরা নিম্নলিখিত payment methods গ্রহণ করি:\n\n• bKash: 01915969330\n• Nagad: 01915969330\n• Cash on Delivery\n\nযেকোনো method দিয়ে payment করতে পারবেন।"
  })

  // Order Collection Style
  const [orderCollectionStyle, setOrderCollectionStyle] = useState<'conversational' | 'quick_form'>('quick_form')
  const [quickFormPrompt, setQuickFormPrompt] = useState('দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:')
  const [quickFormError, setQuickFormError] = useState('দুঃখিত, আমি আপনার তথ্যটি সঠিকভাবে বুঝতে পারিনি। 😔\n\nঅনুগ্রহ করে নিচের ফর্ম্যাটে আবার দিন:\n\nনাম: আপনার নাম\nফোন: 017XXXXXXXX\nঠিকানা: আপনার সম্পূর্ণ ঠিকানা\n\nঅথবা একটি লাইন করে দিতে পারেন:\nআপনার নাম\n017XXXXXXXX\nআপনার সম্পূর্ণ ঠিকানা')

  const [advancedOpen, setAdvancedOpen] = useState(false)

  const toneExamples = {
    friendly: "দারুণ! এটা আমাদের Red Saree! 😊 Price: ৳3,000",
    professional: "This is our Red Saree. Price: ৳3,000. Delivery available.",
    casual: "Aye! Red Saree ta kemon? ৳3,000 only!",
  }

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings/ai')
        const data = await response.json()
        
        if (data.settings) {
          const s = data.settings
          setBusinessName(s.business_name || "Code and Cortex Fashion")
          setGreeting(s.greeting_message || greeting)
          setTone(s.conversation_tone || "friendly")
          setBengaliPercent([s.bengali_percent || 80])
          setConfidence([s.confidence_threshold || 75])
          setUseEmojis(s.use_emojis ?? true)
          
          setDeliveryInsideDhaka(s.delivery_charge_inside_dhaka || 60)
          setDeliveryOutsideDhaka(s.delivery_charge_outside_dhaka || 120)
          setDeliveryTime(s.delivery_time || "3-5 business days")
          setAutoDelivery(s.auto_mention_delivery ?? true)
          
          // Payment
          if (s.payment_methods) {
            setBkashEnabled(s.payment_methods.bkash?.enabled ?? true)
            setBkashNumber(s.payment_methods.bkash?.number || "01915969330")
            setNagadEnabled(s.payment_methods.nagad?.enabled ?? true)
            setNagadNumber(s.payment_methods.nagad?.number || "01915969330")
            setCodEnabled(s.payment_methods.cod?.enabled ?? false)
          }

          
          // Behavior
          if (s.behavior_rules) {
            setMultiProduct(s.behavior_rules.multiProduct ?? false)
            setAskSize(s.behavior_rules.askSize ?? true)
            setShowStock(s.behavior_rules.showStock ?? true)
            setOfferAlternatives(s.behavior_rules.offerAlternatives ?? false)
            setSendConfirmation(s.behavior_rules.sendConfirmation ?? true)
          }
          setShowImageConfirmation(s.show_image_confirmation ?? true)
          
          // Fast Lane
          if (s.fast_lane_messages) {
            setFastLaneMessages({ ...fastLaneMessages, ...s.fast_lane_messages })
          }
          
          // Order Collection Style
          setOrderCollectionStyle(s.order_collection_style || 'conversational')
          setQuickFormPrompt(s.quick_form_prompt || quickFormPrompt)
          setQuickFormError(s.quick_form_error || quickFormError)
        }
      } catch (error) {
        console.error("Error fetching settings:", error)
        toast.error("Failed to load settings")
      } finally {
        setLoading(false)
      }
    }
    
    fetchSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        businessName,
        greeting,
        tone,
        bengaliPercent: bengaliPercent[0],
        confidenceThreshold: confidence[0],
        useEmojis,
        deliveryCharges: {
          insideDhaka: deliveryInsideDhaka,
          outsideDhaka: deliveryOutsideDhaka
        },
        deliveryTime,
        autoMentionDelivery: autoDelivery,
        paymentMethods: {
          bkash: { enabled: bkashEnabled, number: bkashNumber },
          nagad: { enabled: nagadEnabled, number: nagadNumber },
          cod: { enabled: codEnabled }
        },

        behaviorRules: {
          multiProduct,
          askSize,
          showStock,
          offerAlternatives,
          sendConfirmation
        },
        showImageConfirmation,
        fastLaneMessages,
        order_collection_style: orderCollectionStyle,
        quick_form_prompt: quickFormPrompt,
        quick_form_error: quickFormError,
      }

      const response = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        toast.success("Settings saved successfully!")
      } else {
        throw new Error("Failed to save")
      }
    } catch (error) {
      console.error("Error saving settings:", error)
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setBusinessName("Code and Cortex Fashion")
    setGreeting(`আসসালামু আলাইকুম! 👋
আমি Code and Cortex এর AI assistant।
আপনি কোন product খুঁজছেন?`)
    setTone("friendly")
    setBengaliPercent([80])
    setConfidence([75])
    setUseEmojis(true)
    
    setDeliveryInsideDhaka(60)
    setDeliveryOutsideDhaka(120)
    setDeliveryTime("3-5 business days")
    setAutoDelivery(true)
    
    setBkashEnabled(true)
    setBkashNumber("01915969330")
    setNagadEnabled(true)
    setNagadNumber("01915969330")
    setCodEnabled(false)
    
    setMultiProduct(false)
    setAskSize(true)
    setShowStock(true)
    setOfferAlternatives(false)
    setSendConfirmation(true)
    setShowImageConfirmation(true)
    
    setFastLaneMessages({
      product_confirm: "দারুণ! 🎉\n\nআপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)",
      product_decline: "কোনো সমস্যা নেই! 😊\n\nঅন্য product এর ছবি পাঠান অথবা \"help\" লিখুন।",
      name_collected: "আপনার সাথে পরিচিত হয়ে ভালো লাগলো, {name}! 😊\n\nএখন আপনার ফোন নম্বর দিন। 📱\n(Example: 01712345678)",
      phone_collected: "পেয়েছি! 📱\n\nএখন আপনার ডেলিভারি ঠিকানাটি দিন। 📍\n(Example: House 123, Road 4, Dhanmondi, Dhaka)",
      order_confirmed: "✅ অর্ডারটি কনফার্ম করা হয়েছে!\n\nআপনার অর্ডার সফলভাবে সম্পন্ন হয়েছে। শীঘ্রই আমরা আপনার সাথে যোগাযোগ করবো।\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉",
      order_cancelled: "অর্ডার cancel করা হয়েছে। 😊\n\nকোনো সমস্যা নেই! নতুন অর্ডার করতে product এর ছবি পাঠান।",
      paymentInstructions: "✅ অর্ডার confirm হয়েছে!\n\n💰 Payment options:\n৳{totalAmount} টাকা পাঠান:\n{paymentNumber}\n\nPayment করার পর শেষের ২ ডিজিট (last 2 digits) পাঠান। 🔢\n\nExample: যদি transaction ID হয় BKC123456**78**, তাহলে পাঠান: 78",
      paymentReview: "ধন্যবাদ {name}! 🙏\n\nআপনার payment digits ({digits}) পেয়েছি। ✅\n\nআমরা এখন payment verify করবো। সফল হলে ৩ দিনের মধ্যে আপনার order deliver করা হবে। 📦\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉",
      invalidPaymentDigits: "⚠️ দুঃখিত! শুধু ২টা digit দিতে হবে।\n\nExample: 78 বা 45\n\nআবার চেষ্টা করুন। 🔢",
      // Dynamic interruption messages
      delivery_info: "🚚 Delivery Information:\n• ঢাকার মধ্যে: ৳60\n• ঢাকার বাইরে: ৳120\n• Delivery সময়: 3-5 business days",
      return_policy: "🔄 Return Policy:\nপণ্য হাতে পাওয়ার পর যদি মনে হয় এটা সঠিক নয়, তাহলে ২ দিনের মধ্যে ফেরত দিতে পারবেন।\n\n• পণ্য অব্যবহৃত থাকতে হবে\n• Original packaging এ থাকতে হবে\n• ২ দিনের মধ্যে আমাদের জানাতে হবে",
      payment_info: "💳 Payment Methods:\nআমরা নিম্নলিখিত payment methods গ্রহণ করি:\n\n• bKash: 01915969330\n• Nagad: 01915969330\n• Cash on Delivery\n\nযেকোনো method দিয়ে payment করতে পারবেন।"
    })
    
    setOrderCollectionStyle('conversational')
    setQuickFormPrompt('দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:')
    setQuickFormError('দুঃখিত, আমি আপনার তথ্যটি সঠিকভাবে বুঝতে পারিনি। 😔\n\nঅনুগ্রহ করে নিচের ফর্ম্যাটে আবার দিন:\n\nনাম: আপনার নাম\nফোন: 017XXXXXXXX\nঠিকানা: আপনার সম্পূর্ণ ঠিকানা\n\nঅথবা একটি লাইন করে দিতে পারেন:\nআপনার নাম\n017XXXXXXXX\nআপনার সম্পূর্ণ ঠিকানা')
    
    toast.success("Settings reset to default")
  }

  if (loading) {
    return <AISetupSkeleton />
  }

  return (
    <RequireFacebookPage>
      <TopBar title="AI Setup" />

      <div className="p-4 lg:p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Bot className="h-6 w-6" />
              AI Assistant Settings
            </h2>
            <p className="text-muted-foreground mt-1">Customize how your bot talks to customers</p>
          </div>
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Bot
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
                {/* Header is now part of the widget or we can keep it separate, 
                    but since widget has its own header, let's remove the dialog header 
                    or simplify it. The widget has a header, so let's just render the widget. 
                    Actually, the widget header is nice. Let's remove the DialogHeader here 
                    to avoid double headers or keep it if we remove widget header. 
                    The widget header has "Clear" button. Let's keep widget header.
                */}
                <TestChatWidget />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bot Personality */}
          <Card className="bg-card border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Bot Personality
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="business-name">Business Name</Label>
                <Input 
                  id="business-name" 
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="mt-1.5" 
                />
                <p className="text-xs text-muted-foreground mt-1">Shown to customers in messages</p>
              </div>
              <div>
                <Label htmlFor="greeting">Greeting Message</Label>
                <Textarea
                  id="greeting"
                  className="mt-1.5"
                  rows={4}
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          { /* Order Collection Style */}
          <Card className="bg-card border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Order Collection Style</CardTitle>
              <CardDescription>
                Choose how the bot collects customer information during checkout
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={orderCollectionStyle} onValueChange={(value) => setOrderCollectionStyle(value as 'conversational' | 'quick_form')}>
                <div className="flex items-start space-x-3 space-y-0">
                  <RadioGroupItem value="quick_form" id="quick_form" />
                  <div className="space-y-1">
                    <Label htmlFor="quick_form" className="font-medium">
                      Quick Form (Default)
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Ask for all information in a single message. Faster checkout for customers.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 space-y-0">
                  <RadioGroupItem value="conversational" id="conversational" />
                  <div className="space-y-1">
                    <Label htmlFor="conversational" className="font-medium">
                      Conversational Flow
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Ask for name, phone, and address in separate, sequential steps. More human-like interaction.
                    </p>
                  </div>
                </div>
              </RadioGroup>

              {orderCollectionStyle === 'quick_form' && (
                <div className="space-y-4 pt-2 border-t border-border mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="quick_form_prompt">Quick Form Prompt Message</Label>
                    <Textarea
                      id="quick_form_prompt"
                      value={quickFormPrompt}
                      onChange={(e) => setQuickFormPrompt(e.target.value)}
                      placeholder="Message asking for name, phone, and address..."
                      rows={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      This message is shown when customer confirms they want to order the product
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="quick_form_error">Quick Form Error Message</Label>
                    <Textarea
                      id="quick_form_error"
                      value={quickFormError}
                      onChange={(e) => setQuickFormError(e.target.value)}
                      placeholder="Error message when parsing fails..."
                      rows={8}
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown when the bot cannot parse the customer's information. Include format examples.
                    </p>
                  </div>
                </div>
              )}

              {orderCollectionStyle === 'conversational' && (
                <div className="space-y-4 pt-2 border-t border-border mt-2">
                  <div className="space-y-2">
                    <Label htmlFor="product-confirm">Product Confirmation (Ask for Name)</Label>
                    <Textarea
                      id="product-confirm"
                      rows={3}
                      value={fastLaneMessages.product_confirm}
                      onChange={(e) => setFastLaneMessages({...fastLaneMessages, product_confirm: e.target.value})}
                      placeholder="Message when user confirms product..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown when user says YES. Should ask for their name.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name-collected">Name Collected (Ask for Phone)</Label>
                    <Textarea
                      id="name-collected"
                      rows={3}
                      value={fastLaneMessages.name_collected}
                      onChange={(e) => setFastLaneMessages({...fastLaneMessages, name_collected: e.target.value})}
                      placeholder="Message after collecting name..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown after user gives name. Should ask for phone number. Use {"{name}"}.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone-collected">Phone Collected (Ask for Address)</Label>
                    <Textarea
                      id="phone-collected"
                      rows={3}
                      value={fastLaneMessages.phone_collected}
                      onChange={(e) => setFastLaneMessages({...fastLaneMessages, phone_collected: e.target.value})}
                      placeholder="Message after collecting phone..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown after user gives phone. Should ask for delivery address.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="product-decline">Product Decline Message</Label>
                    <Textarea
                      id="product-decline"
                      rows={2}
                      value={fastLaneMessages.product_decline}
                      onChange={(e) => setFastLaneMessages({...fastLaneMessages, product_decline: e.target.value})}
                      placeholder="Message when user declines product..."
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Conversation Style */}
          <Card className="bg-card border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Conversation Style</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Language Mix</Label>
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span>Bengali</span>
                      <span className="font-medium">{bengaliPercent[0]}%</span>
                    </div>
                    <Slider value={bengaliPercent} onValueChange={setBengaliPercent} max={100} step={10} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span>English</span>
                      <span className="font-medium">{100 - bengaliPercent[0]}%</span>
                    </div>
                    <Slider value={[100 - bengaliPercent[0]]} max={100} step={10} disabled />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="emojis">Use Emojis</Label>
                <Switch id="emojis" checked={useEmojis} onCheckedChange={setUseEmojis} />
              </div>

              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground mb-2">Example response:</p>
                <p className="text-sm">{toneExamples[tone as keyof typeof toneExamples]}</p>
              </div>
            </CardContent>
          </Card>


          {/* Delivery Information */}
          <Card className="bg-card border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Delivery Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dhaka-charge">Inside Dhaka (৳)</Label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">৳</span>
                    <Input 
                      id="dhaka-charge" 
                      type="number" 
                      value={deliveryInsideDhaka}
                      onChange={(e) => setDeliveryInsideDhaka(Number(e.target.value))}
                      className="pl-8 font-mono" 
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="outside-charge">Outside Dhaka (৳)</Label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">৳</span>
                    <Input 
                      id="outside-charge" 
                      type="number" 
                      value={deliveryOutsideDhaka}
                      onChange={(e) => setDeliveryOutsideDhaka(Number(e.target.value))}
                      className="pl-8 font-mono" 
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="delivery-time">Estimated Delivery Time</Label>
                <Input 
                  id="delivery-time" 
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                  className="mt-1.5" 
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="auto-delivery" 
                  checked={autoDelivery}
                  onCheckedChange={(c) => setAutoDelivery(!!c)}
                />
                <Label htmlFor="auto-delivery" className="font-normal text-sm">
                  Auto-mention delivery info in conversations
                </Label>
              </div>
              <div>
                <Label htmlFor="delivery-msg">Delivery Information Message</Label>
                <Textarea
                  id="delivery-msg"
                  rows={4}
                  value={fastLaneMessages.delivery_info}
                  onChange={(e) => setFastLaneMessages({...fastLaneMessages, delivery_info: e.target.value})}
                  placeholder="Message when customer asks about delivery..."
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Shown when customer asks: "delivery charge?", "কত দিন?", etc.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Return Policy */}
          <Card className="bg-card border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Package className="h-4 w-4" />
                Return & Exchange Policy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="return-policy-msg">Return Policy Message</Label>
                <Textarea
                  id="return-policy-msg"
                  rows={6}
                  value={fastLaneMessages.return_policy}
                  onChange={(e) => setFastLaneMessages({...fastLaneMessages, return_policy: e.target.value})}
                  placeholder="Your return and exchange policy..."
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Shown when customer asks: "return?", "exchange?", "ফেরত?", etc.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Payment Instructions */}
          <Card className="bg-card border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Instructions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Payment Methods</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="bkash" 
                      checked={bkashEnabled}
                      onCheckedChange={(c) => setBkashEnabled(!!c)}
                    />
                    <Label htmlFor="bkash" className="font-normal">
                      bKash
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="nagad" 
                      checked={nagadEnabled}
                      onCheckedChange={(c) => setNagadEnabled(!!c)}
                    />
                    <Label htmlFor="nagad" className="font-normal">
                      Nagad
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="cod" 
                      checked={codEnabled}
                      onCheckedChange={(c) => setCodEnabled(!!c)}
                    />
                    <Label htmlFor="cod" className="font-normal">
                      Cash on Delivery
                    </Label>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bkash-number">bKash Number</Label>
                  <Input 
                    id="bkash-number" 
                    value={bkashNumber}
                    onChange={(e) => setBkashNumber(e.target.value)}
                    className="mt-1.5 font-mono" 
                  />
                </div>
                <div>
                  <Label htmlFor="nagad-number">Nagad Number</Label>
                  <Input 
                    id="nagad-number" 
                    value={nagadNumber}
                    onChange={(e) => setNagadNumber(e.target.value)}
                    className="mt-1.5 font-mono" 
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="payment-info-msg">Payment Information Message</Label>
                <Textarea
                  id="payment-info-msg"
                  rows={5}
                  value={fastLaneMessages.payment_info}
                  onChange={(e) => setFastLaneMessages({...fastLaneMessages, payment_info: e.target.value})}
                  placeholder="Message when customer asks about payment methods..."
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Shown when customer asks: "payment?", "কিভাবে?", "bKash?", etc.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* AI Behavior Rules */}
          <Card className="bg-card border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4" />
                AI Behavior Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="multi-product" 
                  checked={multiProduct}
                  onCheckedChange={(c) => setMultiProduct(!!c)}
                />
                <Label htmlFor="multi-product" className="font-normal text-sm">
                  Allow multiple products in one order
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="ask-size" 
                  checked={askSize}
                  onCheckedChange={(c) => setAskSize(!!c)}
                />
                <Label htmlFor="ask-size" className="font-normal text-sm">
                  Ask for size/color if available
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="show-stock" 
                  checked={showStock}
                  onCheckedChange={(c) => setShowStock(!!c)}
                />
                <Label htmlFor="show-stock" className="font-normal text-sm">
                  Show stock availability
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="alternatives" 
                  checked={offerAlternatives}
                  onCheckedChange={(c) => setOfferAlternatives(!!c)}
                />
                <Label htmlFor="alternatives" className="font-normal text-sm">
                  Offer alternatives if out of stock
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="confirmation" 
                  checked={sendConfirmation}
                  onCheckedChange={(c) => setSendConfirmation(!!c)}
                />
                <Label htmlFor="confirmation" className="font-normal text-sm">
                  Send order confirmation message
                </Label>
              </div>

              <Button variant="outline" size="sm" className="mt-4 bg-transparent">
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Rule
              </Button>
            </CardContent>
          </Card>
        </div>


        {/* Fast Lane Messages */}
        <Card className="bg-card border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Fast Lane Messages
            </CardTitle>
            <CardDescription>
              Customize bot responses for common interactions. Use {"{name}"} as placeholder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Conversational steps moved to Order Collection Style */}

            <div>
              <Label htmlFor="order-confirmed">Order Confirmed</Label>
              <Textarea
                id="order-confirmed"
                rows={4}
                value={fastLaneMessages.order_confirmed}
                onChange={(e) => setFastLaneMessages({...fastLaneMessages, order_confirmed: e.target.value})}
                placeholder="Message when order is confirmed..."
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Final success message after order confirmation
              </p>
            </div>

            <div>
              <Label htmlFor="order-cancelled">Order Cancelled</Label>
              <Textarea
                id="order-cancelled"
                rows={2}
                value={fastLaneMessages.order_cancelled}
                onChange={(e) => setFastLaneMessages({...fastLaneMessages, order_cancelled: e.target.value})}
                placeholder="Message when order is cancelled..."
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Shown when user cancels the order
              </p>
            </div>

            <div>
              <Label htmlFor="payment-instructions">Payment Instructions</Label>
              <Textarea
                id="payment-instructions"
                rows={6}
                value={fastLaneMessages.paymentInstructions}
                onChange={(e) => setFastLaneMessages({...fastLaneMessages, paymentInstructions: e.target.value})}
                placeholder="Message with payment instructions..."
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {"{totalAmount}"} and {"{paymentNumber}"} placeholders. {"{paymentNumber}"} will be replaced with all enabled payment methods (bKash, Nagad, etc.)
              </p>
            </div>

            <div>
              <Label htmlFor="payment-review">Payment Review</Label>
              <Textarea
                id="payment-review"
                rows={4}
                value={fastLaneMessages.paymentReview}
                onChange={(e) => setFastLaneMessages({...fastLaneMessages, paymentReview: e.target.value})}
                placeholder="Message after receiving payment digits..."
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {"{name}"} and {"{digits}"} placeholders
              </p>
            </div>

            <div>
              <Label htmlFor="invalid-payment-digits">Invalid Payment Digits</Label>
              <Textarea
                id="invalid-payment-digits"
                rows={3}
                value={fastLaneMessages.invalidPaymentDigits}
                onChange={(e) => setFastLaneMessages({...fastLaneMessages, invalidPaymentDigits: e.target.value})}
                placeholder="Error message for invalid digits..."
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Shown when input is not 2 digits
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <Card className="bg-card border border-border shadow-sm">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <CardTitle className="text-base font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Advanced (JSON Configuration)
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                </CardTitle>
                <CardDescription>For developers only</CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 mb-4">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-sm text-yellow-800 dark:text-yellow-200">
                    Modifying this configuration may affect bot behavior
                  </span>
                </div>
                <ScrollArea className="h-64">
                  <pre className="p-4 rounded-lg bg-muted/50 text-xs font-mono overflow-x-auto">
                    {`{
  "model": "gpt-4-turbo",
  "temperature": 0.7,
  "maxTokens": 1000,
  "systemPrompt": "You are a helpful shopping assistant for Code and Cortex Fashion...",
  "responseFormat": {
    "greeting": true,
    "productInfo": true,
    "priceFormat": "BDT"
  },
  "fallbackBehavior": {
    "unknownProduct": "ask_clarification",
    "outOfStock": "suggest_alternatives"
  }
}`}
                  </pre>
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Footer Actions */}
        <div className="sticky bottom-[3.8rem] lg:bottom-0 z-10 -mx-4 lg:-mx-6 -mb-4 lg:-mb-6 p-4 lg:p-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border flex flex-col sm:flex-row sm:justify-end gap-3 mt-6">
          <Button size="lg" className="sm:order-2" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                className="text-destructive border-destructive/50 hover:bg-destructive/10 sm:order-1 bg-transparent"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to Default
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all settings?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will revert all your AI settings, including messages and payment instructions, to their original default values. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset} className="bg-transparent text-destructive border border-destructive hover:bg-destructive/10">
                  Yes, Reset Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </RequireFacebookPage>
  )
}
