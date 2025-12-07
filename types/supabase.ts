export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
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
        }
        Insert: {
          api_type: string
          cost: number
          created_at?: string | null
          id?: string
          image_hash?: string | null
          workspace_id: string
        }
        Update: {
          api_type?: string
          cost?: number
          created_at?: string | null
          id?: string
          image_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          context: Json | null
          created_at: string | null
          current_state: string | null
          customer_name: string | null
          customer_psid: string
          fb_page_id: number
          id: string
          last_message_at: string | null
          workspace_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          current_state?: string | null
          customer_name?: string | null
          customer_psid: string
          fb_page_id: number
          id?: string
          last_message_at?: string | null
          workspace_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          current_state?: string | null
          customer_name?: string | null
          customer_psid?: string
          fb_page_id?: number
          id?: string
          last_message_at?: string | null
          workspace_id?: string
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
          },
        ]
      }
      facebook_pages: {
        Row: {
          created_at: string | null
          encrypted_access_token: string
          id: number
          page_name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          encrypted_access_token: string
          id: number
          page_name: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          encrypted_access_token?: string
          id?: number
          page_name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_pages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      image_recognition_cache: {
        Row: {
          ai_response: Json | null
          confidence_score: number | null
          created_at: string | null
          expires_at: string | null
          id: string
          image_hash: string
          matched_product_id: string | null
        }
        Insert: {
          ai_response?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          image_hash: string
          matched_product_id?: string | null
        }
        Update: {
          ai_response?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          image_hash?: string
          matched_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_recognition_cache_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
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
        }
        Insert: {
          attachments?: Json | null
          conversation_id: string
          created_at?: string | null
          id?: string
          message_text?: string | null
          message_type?: string | null
          sender: string
        }
        Update: {
          attachments?: Json | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          message_text?: string | null
          message_type?: string | null
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          customer_address: string
          customer_name: string
          customer_phone: string
          delivery_charge: number | null
          fb_page_id: number
          id: string
          order_number: string | null
          payment_status: string | null
          product_details: Json | null
          product_id: string | null
          product_price: number | null
          quantity: number | null
          selected_size: string | null
          selected_color: string | null
          size_stock_id: string | null
          status: string | null
          total_amount: number | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          customer_address: string
          customer_name: string
          customer_phone: string
          delivery_charge?: number | null
          fb_page_id: number
          id?: string
          order_number?: string | null
          payment_status?: string | null
          product_details?: Json | null
          product_id?: string | null
          product_price?: number | null
          quantity?: number | null
          selected_size?: string | null
          selected_color?: string | null
          size_stock_id?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          customer_address?: string
          customer_name?: string
          customer_phone?: string
          delivery_charge?: number | null
          fb_page_id?: number
          id?: string
          order_number?: string | null
          payment_status?: string | null
          product_details?: Json | null
          product_id?: string | null
          product_price?: number | null
          quantity?: number | null
          selected_size?: string | null
          selected_color?: string | null
          size_stock_id?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          workspace_id?: string
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
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          product_price: number
          quantity: number
          selected_size: string | null
          selected_color: string | null
          subtotal: number
          product_image_url: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          product_price: number
          quantity?: number
          selected_size?: string | null
          selected_color?: string | null
          subtotal: number
          product_image_url?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          product_price?: number
          quantity?: number
          selected_size?: string | null
          selected_color?: string | null
          subtotal?: number
          product_image_url?: string | null
          created_at?: string | null
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
          },
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
          category: string | null
          colors: string[] | null
          created_at: string | null
          description: string | null
          dominant_colors: string[] | null
          id: string
          image_hash: string | null
          image_hashes: string[] | null
          image_urls: string[] | null
          name: string
          price: number
          requires_size_selection: boolean | null
          search_keywords: string[] | null
          size_stock: Json | null
          sizes: string[] | null
          stock_quantity: number | null
          updated_at: string | null
          variations: Json | null
          visual_features: Json | null
          workspace_id: string
        }
        Insert: {
          category?: string | null
          colors?: string[] | null
          created_at?: string | null
          description?: string | null
          dominant_colors?: string[] | null
          id?: string
          image_hash?: string | null
          image_hashes?: string[] | null
          image_urls?: string[] | null
          name: string
          price: number
          requires_size_selection?: boolean | null
          search_keywords?: string[] | null
          size_stock?: Json | null
          sizes?: string[] | null
          stock_quantity?: number | null
          updated_at?: string | null
          variations?: Json | null
          visual_features?: Json | null
          workspace_id: string
        }
        Update: {
          category?: string | null
          colors?: string[] | null
          created_at?: string | null
          description?: string | null
          dominant_colors?: string[] | null
          id?: string
          image_hash?: string | null
          image_hashes?: string[] | null
          image_urls?: string[] | null
          name?: string
          price?: number
          requires_size_selection?: boolean | null
          search_keywords?: string[] | null
          size_stock?: Json | null
          sizes?: string[] | null
          stock_quantity?: number | null
          updated_at?: string | null
          variations?: Json | null
          visual_features?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
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
        Relationships: []
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
        Relationships: []
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
          },
        ]
      }
      workspace_settings: {
        Row: {
          advanced_config: Json | null
          auto_mention_delivery: boolean | null
          behavior_rules: Json | null
          bengali_percent: number | null
          business_name: string | null
          confidence_threshold: number | null
          conversation_tone: string | null
          created_at: string | null
          delivery_charge_inside_dhaka: number | null
          delivery_charge_outside_dhaka: number | null
          delivery_time: string | null
          fast_lane_messages: Json | null
          greeting_message: string | null
          id: string
          payment_message: string | null
          payment_methods: Json | null
          show_image_confirmation: boolean | null
          updated_at: string | null
          use_emojis: boolean | null
          workspace_id: string
        }
        Insert: {
          advanced_config?: Json | null
          auto_mention_delivery?: boolean | null
          behavior_rules?: Json | null
          bengali_percent?: number | null
          business_name?: string | null
          confidence_threshold?: number | null
          conversation_tone?: string | null
          created_at?: string | null
          delivery_charge_inside_dhaka?: number | null
          delivery_charge_outside_dhaka?: number | null
          delivery_time?: string | null
          fast_lane_messages?: Json | null
          greeting_message?: string | null
          id?: string
          payment_message?: string | null
          payment_methods?: Json | null
          show_image_confirmation?: boolean | null
          updated_at?: string | null
          use_emojis?: boolean | null
          workspace_id: string
        }
        Update: {
          advanced_config?: Json | null
          auto_mention_delivery?: boolean | null
          behavior_rules?: Json | null
          bengali_percent?: number | null
          business_name?: string | null
          confidence_threshold?: number | null
          conversation_tone?: string | null
          created_at?: string | null
          delivery_charge_inside_dhaka?: number | null
          delivery_charge_outside_dhaka?: number | null
          delivery_time?: string | null
          fast_lane_messages?: Json | null
          greeting_message?: string | null
          id?: string
          payment_message?: string | null
          payment_methods?: Json | null
          show_image_confirmation?: boolean | null
          updated_at?: string | null
          use_emojis?: boolean | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_id: string
          subscription_status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_id: string
          subscription_status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          subscription_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_webhooks: { Args: never; Returns: undefined }
      is_member_of_workspace: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

// =============================================
// Convenience type exports for common tables
// =============================================

/** Order type - main order with customer info and totals */
export type Order = Database['public']['Tables']['orders']['Row']
export type OrderInsert = Database['public']['Tables']['orders']['Insert']
export type OrderUpdate = Database['public']['Tables']['orders']['Update']

/** OrderItem type - individual products within an order */
export type OrderItem = Database['public']['Tables']['order_items']['Row']
export type OrderItemInsert = Database['public']['Tables']['order_items']['Insert']
export type OrderItemUpdate = Database['public']['Tables']['order_items']['Update']

/** Order with items - for queries that join order_items */
export type OrderWithItems = Order & {
  order_items: OrderItem[]
}
