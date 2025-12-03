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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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
  AlertTriangle,
} from "lucide-react"
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
        fastLaneMessages
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
    
    toast.success("Settings reset to default")
  }

  return (
    <>
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
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Test Your Bot</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <p className="text-sm text-muted-foreground">
                    Chat with your bot to see how it behaves. This is a test environment - no real orders.
                  </p>
                  <div className="h-64 rounded-lg bg-muted/30 border border-border p-4">
                    <div className="bg-muted rounded-lg px-4 py-2 max-w-[80%]">
                      <p className="text-sm whitespace-pre-line">
                        আসসালামু আলাইকুম! 👋{"\n"}
                        আমি Code and Cortex এর AI assistant।{"\n"}
                        আপনি কোন product খুঁজছেন?
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Type a message..." className="flex-1" />
                    <Button>Send</Button>
                  </div>
                </div>
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

          {/* Conversation Style */}
          <Card className="bg-card border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Conversation Style</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Tone Selection</Label>
                <RadioGroup value={tone} onValueChange={setTone} className="mt-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="friendly" id="friendly" />
                    <Label htmlFor="friendly" className="font-normal">
                      Friendly (default)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="professional" id="professional" />
                    <Label htmlFor="professional" className="font-normal">
                      Professional
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="casual" id="casual" />
                    <Label htmlFor="casual" className="font-normal">
                      Casual
                    </Label>
                  </div>
                </RadioGroup>
              </div>

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

          {/* Product Matching */}
          <Card className="bg-card border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Package className="h-4 w-4" />
                Product Matching Confidence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span>Minimum confidence to auto-confirm</span>
                  <span className="font-semibold text-lg">{confidence[0]}%</span>
                </div>
                <Slider value={confidence} onValueChange={setConfidence} min={50} max={100} step={5} />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>Lower = More matches (less accurate)</span>
                  <span>Higher = Fewer matches (more accurate)</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="image-confirm" 
                  checked={showImageConfirmation}
                  onCheckedChange={(c) => setShowImageConfirmation(!!c)}
                />
                <Label htmlFor="image-confirm" className="font-normal text-sm">
                  Always show image confirmation (recommended)
                </Label>
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
            <div>
              <Label htmlFor="product-confirm">Product Confirmation</Label>
              <Textarea
                id="product-confirm"
                rows={3}
                value={fastLaneMessages.product_confirm}
                onChange={(e) => setFastLaneMessages({...fastLaneMessages, product_confirm: e.target.value})}
                placeholder="Message when user confirms product..."
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Shown when user says YES to a product
              </p>
            </div>

            <div>
              <Label htmlFor="product-decline">Product Decline</Label>
              <Textarea
                id="product-decline"
                rows={2}
                value={fastLaneMessages.product_decline}
                onChange={(e) => setFastLaneMessages({...fastLaneMessages, product_decline: e.target.value})}
                placeholder="Message when user declines product..."
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Shown when user says NO to a product
              </p>
            </div>

            <div>
              <Label htmlFor="name-collected">Name Collected</Label>
              <Textarea
                id="name-collected"
                rows={3}
                value={fastLaneMessages.name_collected}
                onChange={(e) => setFastLaneMessages({...fastLaneMessages, name_collected: e.target.value})}
                placeholder="Message after collecting name..."
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {"{name}"} placeholder for customer name
              </p>
            </div>

            <div>
              <Label htmlFor="phone-collected">Phone Collected</Label>
              <Textarea
                id="phone-collected"
                rows={3}
                value={fastLaneMessages.phone_collected}
                onChange={(e) => setFastLaneMessages({...fastLaneMessages, phone_collected: e.target.value})}
                placeholder="Message after collecting phone..."
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Shown after user provides phone number
              </p>
            </div>

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
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border">
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
    </>
  )
}
