export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      api_usage: {
        Row: {
          api_type: string
          cost: number
          created_at: string | null
          id: string
          image_hash: string | null
          workspace_id: string
          conversation_id: string | null
          model: string | null
          prompt_tokens: number | null
          completion_tokens: number | null
          total_tokens: number | null
          feature_name: string | null
        }
        Insert: {
          api_type: string
          cost: number
          created_at?: string | null
          id?: string
          image_hash?: string | null
          workspace_id: string
          conversation_id?: string | null
          model?: string | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          total_tokens?: number | null
          feature_name?: string | null
        }
        Update: {
          api_type?: string
          cost?: number
          created_at?: string | null
          id?: string
          image_hash?: string | null
          workspace_id?: string
          conversation_id?: string | null
          model?: string | null
          prompt_tokens?: number | null
          completion_tokens?: number | null
          total_tokens?: number | null
          feature_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          }
        ]
      }
      conversations: {
        Row: {
          bot_pause_until: string | null
          control_mode: string | null
          created_at: string | null
          customer_psid: string
          customer_name: string | null
          customer_profile_pic_url: string | null
          fb_page_id: number
          id: string
          is_test: boolean | null
          last_manual_reply_at: string | null
          last_manual_reply_by: string | null
          last_message_at: string | null
          current_state: string | null
          workspace_id: string
          outcome: string | null
          needs_manual_response: boolean | null
          manual_flag_reason: string | null
          manual_flagged_at: string | null
          memory_summary: string | null
          memory_summarized_at: string | null
          context: Json | null
        }
        Insert: {
          bot_pause_until?: string | null
          control_mode?: string | null
          created_at?: string | null
          customer_psid: string
          customer_name?: string | null
          customer_profile_pic_url?: string | null
          fb_page_id: number
          id?: string
          is_test?: boolean | null
          last_manual_reply_at?: string | null
          last_manual_reply_by?: string | null
          last_message_at?: string | null
          current_state?: string | null
          workspace_id: string
          outcome?: string | null
          needs_manual_response?: boolean | null
          manual_flag_reason?: string | null
          manual_flagged_at?: string | null
          memory_summary?: string | null
          memory_summarized_at?: string | null
          context?: Json | null
        }
        Update: {
          bot_pause_until?: string | null
          control_mode?: string | null
          created_at?: string | null
          customer_psid?: string
          customer_name?: string | null
          customer_profile_pic_url?: string | null
          fb_page_id?: number
          id?: string
          is_test?: boolean | null
          last_manual_reply_at?: string | null
          last_manual_reply_by?: string | null
          last_message_at?: string | null
          current_state?: string | null
          workspace_id?: string
          outcome?: string | null
          needs_manual_response?: boolean | null
          manual_flag_reason?: string | null
          manual_flagged_at?: string | null
          memory_summary?: string | null
          memory_summarized_at?: string | null
          context?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_fb_page_id_fkey"
            columns: ["fb_page_id"]
            isOneToOne: false
            referencedRelation: "facebook_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          }
        ]
      }
      facebook_pages: {
        Row: {
          bot_enabled: boolean
          created_at: string | null
          id: number
          instagram_account_id: string | null
          ig_bot_enabled: boolean
          page_name: string
          page_username: string | null
          encrypted_access_token: string
          status: string
          workspace_id: string
        }
        Insert: {
          bot_enabled?: boolean
          created_at?: string | null
          id: number
          instagram_account_id?: string | null
          ig_bot_enabled?: boolean
          page_name: string
          page_username?: string | null
          encrypted_access_token: string
          status?: string
          workspace_id: string
        }
        Update: {
          bot_enabled?: boolean
          created_at?: string | null
          id?: number
          instagram_account_id?: string | null
          ig_bot_enabled?: boolean
          page_name?: string
          page_username?: string | null
          encrypted_access_token?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          }
        ]
      }
      image_recognition_cache: {
        Row: {
          id: string
          image_hash: string
          ai_response: Json | null
          matched_product_id: string | null
          confidence_score: number | null
          created_at: string | null
          expires_at: string | null
        }
        Insert: {
          id?: string
          image_hash: string
          ai_response?: Json | null
          matched_product_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          expires_at?: string | null
        }
        Update: {
          id?: string
          image_hash?: string
          ai_response?: Json | null
          matched_product_id?: string | null
          confidence_score?: number | null
          created_at?: string | null
          expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_recognition_cache_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          attachments: Json | null
          conversation_id: string
          created_at: string | null
          id: string
          message_text: string | null
          message_type: string | null
          sender: string
          sender_type: string | null
        }
        Insert: {
          attachments?: Json | null
          conversation_id: string
          created_at?: string | null
          id?: string
          message_text?: string | null
          message_type?: string | null
          sender: string
          sender_type?: string | null
        }
        Update: {
          attachments?: Json | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          message_text?: string | null
          message_type?: string | null
          sender?: string
          sender_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          }
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          product_id: string | null
          product_image_url: string | null
          product_name: string
          product_price: number
          quantity: number
          selected_color: string | null
          selected_size: string | null
          subtotal: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          product_id?: string | null
          product_image_url?: string | null
          product_name: string
          product_price: number
          quantity: number
          selected_color?: string | null
          selected_size?: string | null
          subtotal: number
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          product_id?: string | null
          product_image_url?: string | null
          product_name?: string
          product_price?: number
          quantity?: number
          selected_color?: string | null
          selected_size?: string | null
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      orders: {
        Row: {
          id: string
          workspace_id: string
          fb_page_id: number
          customer_name: string
          customer_phone: string
          customer_address: string
          product_details: Json | null
          status: string | null
          created_at: string | null
          product_id: string | null
          conversation_id: string | null
          quantity: number | null
          product_price: number | null
          delivery_charge: number | null
          total_amount: number | null
          payment_status: string | null
          order_number: string | null
          updated_at: string | null
          product_image_url: string | null
          product_variations: Json | null
          payment_last_two_digits: string | null
          is_test: boolean | null
          selected_size: string | null
          selected_color: string | null
          size_stock_id: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          fb_page_id: number
          customer_name: string
          customer_phone: string
          customer_address: string
          product_details?: Json | null
          status?: string | null
          created_at?: string | null
          product_id?: string | null
          conversation_id?: string | null
          quantity?: number | null
          product_price?: number | null
          delivery_charge?: number | null
          total_amount?: number | null
          payment_status?: string | null
          order_number?: string | null
          updated_at?: string | null
          product_image_url?: string | null
          product_variations?: Json | null
          payment_last_two_digits?: string | null
          is_test?: boolean | null
          selected_size?: string | null
          selected_color?: string | null
          size_stock_id?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          fb_page_id?: number
          customer_name?: string
          customer_phone?: string
          customer_address?: string
          product_details?: Json | null
          status?: string | null
          created_at?: string | null
          product_id?: string | null
          conversation_id?: string | null
          quantity?: number | null
          product_price?: number | null
          delivery_charge?: number | null
          total_amount?: number | null
          payment_status?: string | null
          order_number?: string | null
          updated_at?: string | null
          product_image_url?: string | null
          product_variations?: Json | null
          payment_last_two_digits?: string | null
          is_test?: boolean | null
          selected_size?: string | null
          selected_color?: string | null
          size_stock_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_fb_page_id_fkey"
            columns: ["fb_page_id"]
            isOneToOne: false
            referencedRelation: "facebook_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          }
        ]
      }
      payment_history: {
        Row: {
          id: string
          workspace_id: string
          amount: number
          payment_method: string
          transaction_id: string | null
          payment_proof_url: string | null
          plan_activated: string
          duration_days: number
          notes: string | null
          activated_by: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          amount: number
          payment_method?: string
          transaction_id?: string | null
          payment_proof_url?: string | null
          plan_activated: string
          duration_days?: number
          notes?: string | null
          activated_by?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          amount?: number
          payment_method?: string
          transaction_id?: string | null
          payment_proof_url?: string | null
          plan_activated?: string
          duration_days?: number
          notes?: string | null
          activated_by?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          }
        ]
      }
      pre_registrations: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          phone_number: string | null
          selected_plan: string
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          phone_number?: string | null
          selected_plan: string
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone_number?: string | null
          selected_plan?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          colors: string[] | null
          created_at: string | null
          description: string | null
          id: string
          image_urls: string[] | null
          name: string
          price: number
          pricing_policy: Json | null
          product_attributes: Json | null
          requires_size_selection: boolean | null
          search_keywords: string[] | null
          size_stock: Json | null
          sizes: string[] | null
          stock_quantity: number | null
          updated_at: string | null
          variant_stock: Json | null
          variations: Json | null
          workspace_id: string
          category: string | null
          flavors: string[] | null
          weights: string[] | null
          image_hash: string | null
          dominant_colors: string[] | null
          visual_features: Json | null
          image_hashes: string[] | null
          media_images: string[] | null
          media_videos: string[] | null
        }
        Insert: {
          colors?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_urls?: string[] | null
          name: string
          price: number
          pricing_policy?: Json | null
          product_attributes?: Json | null
          requires_size_selection?: boolean | null
          search_keywords?: string[] | null
          size_stock?: Json | null
          sizes?: string[] | null
          stock_quantity?: number | null
          updated_at?: string | null
          variant_stock?: Json | null
          variations?: Json | null
          workspace_id: string
          category?: string | null
          flavors?: string[] | null
          weights?: string[] | null
          image_hash?: string | null
          dominant_colors?: string[] | null
          visual_features?: Json | null
          image_hashes?: string[] | null
          media_images?: string[] | null
          media_videos?: string[] | null
        }
        Update: {
          colors?: string[] | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_urls?: string[] | null
          name?: string
          price?: number
          pricing_policy?: Json | null
          product_attributes?: Json | null
          requires_size_selection?: boolean | null
          search_keywords?: string[] | null
          size_stock?: Json | null
          sizes?: string[] | null
          stock_quantity?: number | null
          updated_at?: string | null
          variant_stock?: Json | null
          variations?: Json | null
          workspace_id?: string
          category?: string | null
          flavors?: string[] | null
          weights?: string[] | null
          image_hash?: string | null
          dominant_colors?: string[] | null
          visual_features?: Json | null
          image_hashes?: string[] | null
          media_images?: string[] | null
          media_videos?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          business_name: string | null
          created_at: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      webhook_events: {
        Row: {
          created_at: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string | null
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          }
        ]
      }
      workspace_settings: {
        Row: {
          id: string
          workspace_id: string
          business_name: string | null
          greeting_message: string | null
          conversation_tone: string | null
          bengali_percent: number | null
          use_emojis: boolean | null
          confidence_threshold: number | null
          show_image_confirmation: boolean | null
          delivery_charge_inside_dhaka: number | null
          delivery_charge_outside_dhaka: number | null
          delivery_time: string | null
          auto_mention_delivery: boolean | null
          payment_methods: Json | null
          payment_message: string | null
          behavior_rules: Json | null
          advanced_config: Json | null
          created_at: string | null
          updated_at: string | null
          fast_lane_messages: Json | null
          order_collection_style: string
          quick_form_prompt: string
          quick_form_error: string
          out_of_stock_message: string | null
          return_policy: string | null
          quality_guarantee: string | null
          business_category: string | null
          business_address: string | null
          exchange_policy: string | null
          custom_faqs: Json | null
        }
        Insert: {
          id?: string
          workspace_id: string
          business_name?: string | null
          greeting_message?: string | null
          conversation_tone?: string | null
          bengali_percent?: number | null
          use_emojis?: boolean | null
          confidence_threshold?: number | null
          show_image_confirmation?: boolean | null
          delivery_charge_inside_dhaka?: number | null
          delivery_charge_outside_dhaka?: number | null
          delivery_time?: string | null
          auto_mention_delivery?: boolean | null
          payment_methods?: Json | null
          payment_message?: string | null
          behavior_rules?: Json | null
          advanced_config?: Json | null
          created_at?: string | null
          updated_at?: string | null
          fast_lane_messages?: Json | null
          order_collection_style: string
          quick_form_prompt: string
          quick_form_error: string
          out_of_stock_message?: string | null
          return_policy?: string | null
          quality_guarantee?: string | null
          business_category?: string | null
          business_address?: string | null
          exchange_policy?: string | null
          custom_faqs?: Json | null
        }
        Update: {
          id?: string
          workspace_id?: string
          business_name?: string | null
          greeting_message?: string | null
          conversation_tone?: string | null
          bengali_percent?: number | null
          use_emojis?: boolean | null
          confidence_threshold?: number | null
          show_image_confirmation?: boolean | null
          delivery_charge_inside_dhaka?: number | null
          delivery_charge_outside_dhaka?: number | null
          delivery_time?: string | null
          auto_mention_delivery?: boolean | null
          payment_methods?: Json | null
          payment_message?: string | null
          behavior_rules?: Json | null
          advanced_config?: Json | null
          created_at?: string | null
          updated_at?: string | null
          fast_lane_messages?: Json | null
          order_collection_style?: string
          quick_form_prompt?: string
          quick_form_error?: string
          out_of_stock_message?: string | null
          return_policy?: string | null
          quality_guarantee?: string | null
          business_category?: string | null
          business_address?: string | null
          exchange_policy?: string | null
          custom_faqs?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          }
        ]
      }
      workspaces: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_id: string
          subscription_status: string | null
          subscription_plan: string | null
          trial_ends_at: string | null
          subscription_expires_at: string | null
          admin_paused: boolean | null
          admin_paused_at: string | null
          admin_paused_reason: string | null
          last_payment_date: string | null
          last_payment_amount: number | null
          last_payment_method: string | null
          total_paid: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_id: string
          subscription_status?: string | null
          subscription_plan?: string | null
          trial_ends_at?: string | null
          subscription_expires_at?: string | null
          admin_paused?: boolean | null
          admin_paused_at?: string | null
          admin_paused_reason?: string | null
          last_payment_date?: string | null
          last_payment_amount?: number | null
          last_payment_method?: string | null
          total_paid?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          subscription_status?: string | null
          subscription_plan?: string | null
          trial_ends_at?: string | null
          subscription_expires_at?: string | null
          admin_paused?: boolean | null
          admin_paused_at?: string | null
          admin_paused_reason?: string | null
          last_payment_date?: string | null
          last_payment_amount?: number | null
          last_payment_method?: string | null
          total_paid?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}