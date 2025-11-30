-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.api_usage (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL,
  api_type text NOT NULL,
  cost numeric NOT NULL,
  image_hash text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT api_usage_pkey PRIMARY KEY (id),
  CONSTRAINT api_usage_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id)
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
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
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
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id),
  CONSTRAINT orders_fb_page_id_fkey FOREIGN KEY (fb_page_id) REFERENCES public.facebook_pages(id),
  CONSTRAINT orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT orders_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
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
  category text,
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
CREATE TABLE public.workspaces (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  subscription_status text DEFAULT 'free_trial'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT workspaces_pkey PRIMARY KEY (id),
  CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id)
);