export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      api_usage: {
        Row: {
          id: string
          workspace_id: string
          api_type: string
          cost: number
          image_hash: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          api_type: string
          cost: number
          image_hash?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          api_type?: string
          cost?: number
          image_hash?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          }
        ]
      }
      conversations: {
        Row: {
          id: string
          workspace_id: string
          fb_page_id: number
          customer_psid: string
          customer_name: string | null
          current_state: string | null
          context: Json | null
          last_message_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          fb_page_id: number
          customer_psid: string
          customer_name?: string | null
          current_state?: string | null
          context?: Json | null
          last_message_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          fb_page_id?: number
          customer_psid?: string
          customer_name?: string | null
          current_state?: string | null
          context?: Json | null
          last_message_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_fb_page_id_fkey"
            columns: ["fb_page_id"]
            referencedRelation: "facebook_pages"
            referencedColumns: ["id"]
          }
        ]
      }
      facebook_pages: {
        Row: {
          id: number
          workspace_id: string
          page_name: string
          encrypted_access_token: string
          created_at: string | null
        }
        Insert: {
          id: number
          workspace_id: string
          page_name: string
          encrypted_access_token: string
          created_at?: string | null
        }
        Update: {
          id?: number
          workspace_id?: string
          page_name?: string
          encrypted_access_token?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_pages_workspace_id_fkey"
            columns: ["workspace_id"]
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
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender: string
          message_text: string | null
          message_type: string | null
          attachments: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          conversation_id: string
          sender: string
          message_text?: string | null
          message_type?: string | null
          attachments?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string
          sender?: string
          message_text?: string | null
          message_type?: string | null
          attachments?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            referencedRelation: "conversations"
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
        }
        Relationships: [
          {
            foreignKeyName: "orders_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_fb_page_id_fkey"
            columns: ["fb_page_id"]
            referencedRelation: "facebook_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_conversation_id_fkey"
            columns: ["conversation_id"]
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          }
        ]
      }
      pre_registrations: {
        Row: {
          id: string
          full_name: string
          email: string
          phone_number: string | null
          selected_plan: string
          created_at: string | null
        }
        Insert: {
          id?: string
          full_name: string
          email: string
          phone_number?: string | null
          selected_plan: string
          created_at?: string | null
        }
        Update: {
          id?: string
          full_name?: string
          email?: string
          phone_number?: string | null
          selected_plan?: string
          created_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          workspace_id: string
          name: string
          price: number
          description: string | null
          category: string | null
          variations: Json | null
          stock_quantity: number | null
          image_urls: string[] | null
          image_hash: string | null
          image_hashes: string[] | null
          dominant_colors: string[] | null
          visual_features: Json | null
          search_keywords: string[] | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          name: string
          price: number
          description?: string | null
          category?: string | null
          variations?: Json | null
          stock_quantity?: number | null
          image_urls?: string[] | null
          image_hash?: string | null
          image_hashes?: string[] | null
          dominant_colors?: string[] | null
          visual_features?: Json | null
          search_keywords?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          name?: string
          price?: number
          description?: string | null
          category?: string | null
          variations?: Json | null
          stock_quantity?: number | null
          image_urls?: string[] | null
          image_hash?: string | null
          image_hashes?: string[] | null
          dominant_colors?: string[] | null
          visual_features?: Json | null
          search_keywords?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          }
        ]
      }
      users: {
        Row: {
          id: string
          full_name: string | null
          avatar_url: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          full_name?: string | null
          avatar_url?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          full_name?: string | null
          avatar_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      webhook_events: {
        Row: {
          id: string
          event_id: string
          event_type: string
          payload: Json
          processed_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          event_id: string
          event_type: string
          payload: Json
          processed_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          event_id?: string
          event_type?: string
          payload?: Json
          processed_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          workspace_id: string
          user_id: string
          role: string
          created_at: string | null
        }
        Insert: {
          workspace_id: string
          user_id: string
          role?: string
          created_at?: string | null
        }
        Update: {
          workspace_id?: string
          user_id?: string
          role?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      workspaces: {
        Row: {
          id: string
          owner_id: string
          name: string
          subscription_status: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          name: string
          subscription_status?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          name?: string
          subscription_status?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
