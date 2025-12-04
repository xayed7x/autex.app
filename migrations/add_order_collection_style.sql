-- Add Order Collection Style feature columns
-- Allows workspace owners to choose between conversational and quick form order collection

ALTER TABLE public.workspace_settings
ADD COLUMN order_collection_style TEXT NOT NULL DEFAULT 'conversational',
ADD COLUMN quick_form_prompt TEXT NOT NULL DEFAULT 'দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:

নাম:
ফোন:
সম্পূর্ণ ঠিকানা:',
ADD COLUMN quick_form_error TEXT NOT NULL DEFAULT 'দুঃখিত, আমি আপনার তথ্যটি সঠিকভাবে বুঝতে পারিনি। 😔

অনুগ্রহ করে নিচের ফর্ম্যাটে আবার দিন:

নাম: আপনার নাম
ফোন: 017XXXXXXXX
ঠিকানা: আপনার সম্পূর্ণ ঠিকানা

অথবা একটি লাইন করে দিতে পারেন:
আপনার নাম
017XXXXXXXX
আপনার সম্পূর্ণ ঠিকানা';

-- Add constraint to ensure only valid styles are stored
ALTER TABLE public.workspace_settings
ADD CONSTRAINT valid_order_collection_style
CHECK (order_collection_style IN ('conversational', 'quick_form'));

-- Add comment for documentation
COMMENT ON COLUMN public.workspace_settings.order_collection_style IS 'Order collection mode: conversational (sequential) or quick_form (single message)';
COMMENT ON COLUMN public.workspace_settings.quick_form_prompt IS 'Prompt message shown when using quick form mode';
COMMENT ON COLUMN public.workspace_settings.quick_form_error IS 'Error message shown when quick form parsing fails';
