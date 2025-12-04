# Order Collection Style UI - Implementation Instructions

## Summary
The backend logic is **100% complete**. You just need to add the UI card to the AI Setup page so you can toggle between conversational and quick form modes.

## Instructions

### 1. Add the UI Card

Add this card in `app/dashboard/ai-setup/page.tsx` after the "Return & Exchange Policy" card (search for the return policy card and add this after it):

```tsx
{/* Order Collection Style */}
<Card>
  <CardHeader>
    <CardTitle>Order Collection Style</CardTitle>
    <CardDescription>
      Choose how the bot collects customer information during checkout
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <RadioGroup value={orderCollectionStyle} onValueChange={(value) => setOrderCollectionStyle(value as 'conversational' | 'quick_form')}>
      <div className="flex items-start space-x-3 space-y-0">
        <RadioGroupItem value="conversational" id="conversational" />
        <div className="space-y-1">
          <Label htmlFor="conversational" className="font-medium">
            Conversational Flow (Default)
          </Label>
          <p className="text-sm text-muted-foreground">
            Ask for name, phone, and address in separate, sequential steps. More human-like interaction.
          </p>
        </div>
      </div>
      <div className="flex items-start space-x-3 space-y-0">
        <RadioGroupItem value="quick_form" id="quick_form" />
        <div className="space-y-1">
          <Label htmlFor="quick_form" className="font-medium">
            Quick Form
          </Label>
          <p className="text-sm text-muted-foreground">
            Ask for all information in a single message. Faster checkout for customers.
          </p>
        </div>
      </div>
    </RadioGroup>

    {orderCollectionStyle === 'quick_form' && (
      <>
        <div className="space-y-2">
          <Label htmlFor="quick_form_prompt">Quick Form Prompt Message</Label>
          <Textarea
            id="quick_form_prompt"
            value={quickFormPrompt}
            onChange={(e) => setQuickFormPrompt(e.target.value)}
            placeholder="Message asking for name, phone, and address..."
            rows={6}
          />
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
        </div>
      </>
    )}
  </CardContent>
</Card>
```

### 2. Update the Save Handler

Find the save handler function (search for where you're building the payload to send to `/api/settings/ai`) and add these fields:

```typescript
order_collection_style: orderCollectionStyle,
quick_form_prompt: quickFormPrompt,
quick_form_error: quickFormError,
```

### 3. Update the Reset Handler

Find the reset handler (where you reset all states to defaults) and add:

```typescript
setOrderCollectionStyle('conversational')
setQuickFormPrompt('দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:')
setQuickFormError('দুঃখিত, আমি আপনার তথ্যটি সঠিকভাবে বুঝতে পারিনি। 😔\n\nঅনুগ্রহ করে নিচের ফর্ম্যাটে আবার দিন:\n\nনাম: আপনার নাম\nফোন: 017XXXXXXXX\nঠিকানা: আপনার সম্পূর্ণ ঠিকানা\n\nঅথবা একটি লাইন করে দিতে পারেন:\nআপনার নাম\n017XXXXXXXX\nআপনার সম্পূর্ণ ঠিকানা')
```

## Testing

After adding the UI:

1. **Test Conversational Mode:**
   - Keep setting as "Conversational Flow"
   - Send product image
   - Say "yes"
   - Should ask for name, then phone, then address separately ✅

2. **Test Quick Form Mode:**
   - Switch to "Quick Form"
   - Save settings
   - Send product image
   - Say "yes"
   - Should ask for all details at once
   - Reply with:
     ```
     Abdul Hamid
     01712345678
     House 123, Dhaka
     ```
   - Should show order summary ✅

3. **Test Quick Form with Labels:**
   ```
   নাম: Abdul Hamid
   ফোন: 01712345678
   ঠিকানা: House 123, Dhaka
   ```

4. **Test Error Handling:**
   - Send incomplete info (missing phone)
   - Should show error message and re-prompt

## Already Implemented (Backend ✅)

- ✅ Database columns created
- ✅ TypeScript types updated
- ✅ Multi-strategy parsing (labeled format + positional)
- ✅ Phone detection and normalization
- ✅ Validation and error handling
- ✅ Failure logging for debugging
- ✅ State machine updated
- ✅ Load handler updated (already loads the settings)

## What's Left

Just the 3 steps above! The API will automatically save the new fields to the database since the columns exist.
