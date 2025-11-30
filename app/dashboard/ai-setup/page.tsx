"use client"

import { useState } from "react"
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

export default function AISetupPage() {
  const [tone, setTone] = useState("friendly")
  const [bengaliPercent, setBengaliPercent] = useState([80])
  const [confidence, setConfidence] = useState([75])
  const [useEmojis, setUseEmojis] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const toneExamples = {
    friendly: "দারুণ! এটা আমাদের Red Saree! 😊 Price: ৳3,000",
    professional: "This is our Red Saree. Price: ৳3,000. Delivery available.",
    casual: "Aye! Red Saree ta kemon? ৳3,000 only!",
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
                <Input id="business-name" defaultValue="Code and Cortex Fashion" className="mt-1.5" />
                <p className="text-xs text-muted-foreground mt-1">Shown to customers in messages</p>
              </div>
              <div>
                <Label htmlFor="greeting">Greeting Message</Label>
                <Textarea
                  id="greeting"
                  className="mt-1.5"
                  rows={4}
                  defaultValue={`আসসালামু আলাইকুম! 👋
আমি Code and Cortex এর AI assistant।
আপনি কোন product খুঁজছেন?`}
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
                <Checkbox id="image-confirm" defaultChecked />
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
                    <Input id="dhaka-charge" type="number" defaultValue={60} className="pl-8 font-mono" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="outside-charge">Outside Dhaka (৳)</Label>
                  <div className="relative mt-1.5">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">৳</span>
                    <Input id="outside-charge" type="number" defaultValue={120} className="pl-8 font-mono" />
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="delivery-time">Estimated Delivery Time</Label>
                <Input id="delivery-time" defaultValue="3-5 business days" className="mt-1.5" />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="auto-delivery" defaultChecked />
                <Label htmlFor="auto-delivery" className="font-normal text-sm">
                  Auto-mention delivery info in conversations
                </Label>
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
                    <Checkbox id="bkash" defaultChecked />
                    <Label htmlFor="bkash" className="font-normal">
                      bKash
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="nagad" defaultChecked />
                    <Label htmlFor="nagad" className="font-normal">
                      Nagad
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="cod" />
                    <Label htmlFor="cod" className="font-normal">
                      Cash on Delivery
                    </Label>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bkash-number">bKash Number</Label>
                  <Input id="bkash-number" defaultValue="01812345678" className="mt-1.5 font-mono" />
                </div>
                <div>
                  <Label htmlFor="nagad-number">Nagad Number</Label>
                  <Input id="nagad-number" defaultValue="01912345678" className="mt-1.5 font-mono" />
                </div>
              </div>
              <div>
                <Label htmlFor="payment-message">Custom Payment Message</Label>
                <Textarea
                  id="payment-message"
                  className="mt-1.5"
                  rows={3}
                  defaultValue={`Payment করতে আমাদের bKash এ send করুন।
Screenshot পাঠালে আমরা verify করব।`}
                />
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
                <Checkbox id="multi-product" />
                <Label htmlFor="multi-product" className="font-normal text-sm">
                  Allow multiple products in one order
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="ask-size" defaultChecked />
                <Label htmlFor="ask-size" className="font-normal text-sm">
                  Ask for size/color if available
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="show-stock" defaultChecked />
                <Label htmlFor="show-stock" className="font-normal text-sm">
                  Show stock availability
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="alternatives" />
                <Label htmlFor="alternatives" className="font-normal text-sm">
                  Offer alternatives if out of stock
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="confirmation" defaultChecked />
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
                defaultValue="দারুণ! 🎉&#10;&#10;আপনার সম্পূর্ণ নামটি বলবেন?&#10;(Example: Zayed Bin Hamid)"
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
                defaultValue="কোনো সমস্যা নেই! 😊&#10;&#10;অন্য product এর ছবি পাঠান অথবা &quot;help&quot; লিখুন।"
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
                defaultValue="আপনার সাথে পরিচিত হয়ে ভালো লাগলো, {name}! 😊&#10;&#10;এখন আপনার ফোন নম্বর দিন। 📱&#10;(Example: 01712345678)"
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
                defaultValue="পেয়েছি! 📱&#10;&#10;এখন আপনার ডেলিভারি ঠিকানাটি দিন। 📍&#10;(Example: House 123, Road 4, Dhanmondi, Dhaka)"
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
                defaultValue="✅ অর্ডারটি কনফার্ম করা হয়েছে!&#10;&#10;আপনার অর্ডার সফলভাবে সম্পন্ন হয়েছে। শীঘ্রই আমরা আপনার সাথে যোগাযোগ করবো।&#10;&#10;আমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉"
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
                defaultValue="অর্ডার cancel করা হয়েছে। 😊&#10;&#10;কোনো সমস্যা নেই! নতুন অর্ডার করতে product এর ছবি পাঠান।"
                placeholder="Message when order is cancelled..."
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Shown when user cancels the order
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
          <Button size="lg" className="sm:order-2">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="text-destructive border-destructive/50 hover:bg-destructive/10 sm:order-1 bg-transparent"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
        </div>
      </div>
    </>
  )
}
