-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.api_usage (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL,
  api_type text NOT NULL,
  cost numeric NOT NULL,
  image_hash text,
  created_at timestamp with time zone DEFAULT now(),
  conversation_id uuid,
  model text,
  prompt_tokens integer DEFAULT 0,
  completion_tokens integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  feature_name text,
  CONSTRAINT api_usage_pkey PRIMARY KEY (id),
  CONSTRAINT api_usage_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id),
  CONSTRAINT api_usage_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL,
  fb_page_id bigint NOT NULL,
  customer_psid text NOT NULL,
  customer_name text,
  current_state text DEFAULT 'IDLE'::text,
  context jsonb,
  last_message_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  is_test boolean DEFAULT false,
  customer_profile_pic_url text,
  control_mode text DEFAULT 'bot'::text CHECK (control_mode = ANY (ARRAY['bot'::text, 'manual'::text, 'hybrid'::text])),
  last_manual_reply_at timestamp with time zone,
  last_manual_reply_by text,
  bot_pause_until timestamp with time zone,
  outcome text,
  needs_manual_response boolean DEFAULT false,
  manual_flag_reason text,
  manual_flagged_at timestamp with time zone,
  memory_summary text,
  memory_summarized_at timestamp with time zone,
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id),
  CONSTRAINT conversations_fb_page_id_fkey FOREIGN KEY (fb_page_id) REFERENCES public.facebook_pages(id)
);
CREATE TABLE public.facebook_pages (
  id bigint NOT NULL,
  workspace_id uuid NOT NULL,
  page_name text NOT NULL,
  encrypted_access_token text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  status text NOT NULL DEFAULT 'connected'::text CHECK (status = ANY (ARRAY['connected'::text, 'disconnected'::text])),
  bot_enabled boolean NOT NULL DEFAULT true,
  page_username text,
  instagram_account_id text,
  ig_bot_enabled boolean DEFAULT true,
  CONSTRAINT facebook_pages_pkey PRIMARY KEY (id),
  CONSTRAINT facebook_pages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id)
);
CREATE TABLE public.image_recognition_cache (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  image_hash text NOT NULL UNIQUE,
  ai_response jsonb,
  matched_product_id uuid,
  confidence_score numeric,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval),
  CONSTRAINT image_recognition_cache_pkey PRIMARY KEY (id),
  CONSTRAINT image_recognition_cache_matched_product_id_fkey FOREIGN KEY (matched_product_id) REFERENCES public.products(id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL,
  sender text NOT NULL,
  message_text text,
  message_type text,
  attachments jsonb,
  created_at timestamp with time zone DEFAULT now(),
  sender_type text DEFAULT 'customer'::text CHECK (sender_type = ANY (ARRAY['customer'::text, 'bot'::text, 'owner'::text])),
  mid text,
  image_url text,
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL,
  product_id uuid,
  product_name text NOT NULL,
  product_price numeric NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  selected_size text,
  selected_color text,
  subtotal numeric NOT NULL,
  product_image_url text,
  created_at timestamp with time zone DEFAULT now(),
  selected_flavor text,
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL,
  fb_page_id bigint NOT NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_address text NOT NULL,
  product_details jsonb,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  product_id uuid,
  conversation_id uuid,
  quantity integer DEFAULT 1,
  product_price numeric,
  delivery_charge numeric DEFAULT 60,
  total_amount numeric,
  payment_status text DEFAULT 'unpaid'::text,
  order_number text UNIQUE,
  updated_at timestamp with time zone DEFAULT now(),
  product_image_url text,
  product_variations jsonb,
  payment_last_two_digits text,
  is_test boolean DEFAULT false,
  selected_size text,
  selected_color text,
  size_stock_id text,
  delivery_date text,
  flavor text,
  custom_message text,
  cake_category text,
  customer_description text,
  inspiration_image text,
  delivery_zone text,
  delivery_time text,
  staff_note text,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id),
  CONSTRAINT orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT orders_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id),
  CONSTRAINT orders_fb_page_id_fkey FOREIGN KEY (fb_page_id) REFERENCES public.facebook_pages(id)
);
CREATE TABLE public.payment_history (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL,
  amount numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'bkash'::text,
  transaction_id text,
  payment_proof_url text,
  plan_activated text NOT NULL,
  duration_days integer NOT NULL DEFAULT 30,
  notes text,
  activated_by text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_history_pkey PRIMARY KEY (id),
  CONSTRAINT payment_history_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id)
);
CREATE TABLE public.pre_registrations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone_number text,
  selected_plan text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pre_registrations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL,
  description text,
  variations jsonb,
  stock_quantity integer DEFAULT 0,
  image_urls ARRAY,
  image_hash text,
  dominant_colors ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  visual_features jsonb,
  image_hashes ARRAY DEFAULT '{}'::text[],
  search_keywords ARRAY DEFAULT '{}'::text[],
  colors ARRAY DEFAULT '{}'::text[],
  sizes ARRAY DEFAULT '{}'::text[],
  size_stock jsonb DEFAULT '[]'::jsonb,
  requires_size_selection boolean DEFAULT true,
  variant_stock jsonb DEFAULT '[]'::jsonb,
  pricing_policy jsonb DEFAULT '{}'::jsonb,
  product_attributes jsonb DEFAULT '{}'::jsonb,
  media_images ARRAY,
  media_videos ARRAY,
  category text,
  flavor text,
  flavors jsonb DEFAULT '[]'::jsonb,
  food_category text,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  business_name text,
  phone text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.webhook_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT webhook_events_pkey PRIMARY KEY (id)
);
CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id),
  CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.workspace_settings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL UNIQUE,
  business_name text,
  greeting_message text DEFAULT 'আসসালামু আলাইকুম! 👋
আমি আপনার AI assistant।
আপনি কোন product খুঁজছেন?'::text,
  conversation_tone text DEFAULT 'friendly'::text CHECK (conversation_tone = ANY (ARRAY['friendly'::text, 'professional'::text, 'casual'::text])),
  bengali_percent integer DEFAULT 80 CHECK (bengali_percent >= 0 AND bengali_percent <= 100),
  use_emojis boolean DEFAULT true,
  confidence_threshold integer DEFAULT 75 CHECK (confidence_threshold >= 50 AND confidence_threshold <= 100),
  show_image_confirmation boolean DEFAULT true,
  delivery_charge_inside_dhaka numeric DEFAULT 60,
  delivery_charge_outside_dhaka numeric DEFAULT 120,
  delivery_time text DEFAULT '3-5 business days'::text,
  auto_mention_delivery boolean DEFAULT true,
  payment_methods jsonb DEFAULT '{"cod": {"enabled": false}, "bkash": {"number": "", "enabled": true}, "nagad": {"number": "", "enabled": true}}'::jsonb,
  payment_message text DEFAULT 'Payment করতে আমাদের bKash এ send করুন।
Screenshot পাঠালে আমরা verify করব।'::text,
  behavior_rules jsonb DEFAULT '{"askSize": true, "showStock": true, "multiProduct": false, "sendConfirmation": true, "offerAlternatives": false}'::jsonb,
  advanced_config jsonb DEFAULT '{"model": "gpt-4-turbo", "maxTokens": 1000, "temperature": 0.7}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  fast_lane_messages jsonb DEFAULT '{"name_collected": "আপনার সাথে পরিচিত হয়ে ভালো লাগলো, {name}! 😊\n\nএখন আপনার ফোন নম্বর দিন। 📱\n(Example: 01712345678)", "order_cancelled": "অর্ডার cancel করা হয়েছে। 😊\n\nকোনো সমস্যা নেই! নতুন অর্ডার করতে product এর ছবি পাঠান।", "order_confirmed": "✅ অর্ডারটি কনফার্ম করা হয়েছে!\n\nআপনার অর্ডার সফলভাবে সম্পন্ন হয়েছে। শীঘ্রই আমরা আপনার সাথে যোগাযোগ করবো।\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉", "phone_collected": "পেয়েছি! 📱\n\nএখন আপনার ডেলিভারি ঠিকানাটি দিন। 📍\n(Example: House 123, Road 4, Dhanmondi, Dhaka)", "product_confirm": "দারুণ! 🎉\n\nআপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)", "product_decline": "কোনো সমস্যা নেই! 😊\n\nঅন্য product এর ছবি পাঠান অথবা \"help\" লিখুন।"}'::jsonb,
  order_collection_style text NOT NULL DEFAULT 'conversational'::text CHECK (order_collection_style = ANY (ARRAY['conversational'::text, 'quick_form'::text])),
  quick_form_prompt text NOT NULL DEFAULT 'দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:

নাম:
ফোন:
সম্পূর্ণ ঠিকানা:'::text,
  quick_form_error text NOT NULL DEFAULT 'দুঃখিত, আমি আপনার তথ্যটি সঠিকভাবে বুঝতে পারিনি। 😔

অনুগ্রহ করে নিচের ফর্ম্যাটে আবার দিন:

নাম: আপনার নাম
ফোন: 017XXXXXXXX
ঠিকানা: আপনার সম্পূর্ণ ঠিকানা

অথবা একটি লাইন করে দিতে পারেন:
আপনার নাম
017XXXXXXXX
আপনার সম্পূর্ণ ঠিকানা'::text,
  out_of_stock_message text DEFAULT 'দুঃখিত! 😔 "{productName}" এখন স্টকে নেই।

আপনি চাইলে অন্য পণ্যের নাম লিখুন বা স্ক্রিনশট পাঠান। আমরা সাহায্য করতে পারবো! 🛍️'::text,
  return_policy text,
  quality_guarantee text,
  business_category text,
  business_address text,
  exchange_policy text,
  custom_faqs jsonb DEFAULT '[]'::jsonb,
  conversation_examples jsonb DEFAULT '[]'::jsonb,
  custom_ai_instructions text,
  delivery_zones jsonb DEFAULT '[]'::jsonb,
  business_context text,
  CONSTRAINT workspace_settings_pkey PRIMARY KEY (id),
  CONSTRAINT workspace_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id)
);
CREATE TABLE public.workspaces (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  subscription_status text DEFAULT 'trial'::text CHECK (subscription_status = ANY (ARRAY['trial'::text, 'active'::text, 'expired'::text])),
  created_at timestamp with time zone DEFAULT now(),
  subscription_plan text,
  trial_ends_at timestamp with time zone,
  subscription_expires_at timestamp with time zone,
  admin_paused boolean DEFAULT false,
  admin_paused_at timestamp with time zone,
  admin_paused_reason text,
  last_payment_date timestamp with time zone,
  last_payment_amount numeric,
  last_payment_method text,
  total_paid numeric DEFAULT 0,
  CONSTRAINT workspaces_pkey PRIMARY KEY (id),
  CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id)
);