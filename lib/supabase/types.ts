export type Database = {
  public: {
    Tables: {
      pricing_config: {
        Row: {
          plan_slug: string;
          display_name: string;
          monthly_price_cents: number;
          max_active_recipes: number;
          webhooks_enabled: boolean;
          ghl_cache_ttl_secs: number;
          rate_limit_priority: "low" | "standard" | "high";
          stripe_price_id: string;
          is_active: boolean;
        };
        Insert: {
          plan_slug: string;
          display_name: string;
          monthly_price_cents: number;
          max_active_recipes: number;
          webhooks_enabled?: boolean;
          ghl_cache_ttl_secs?: number;
          rate_limit_priority?: "low" | "standard" | "high";
          stripe_price_id: string;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["pricing_config"]["Insert"]>;
      };
      accounts: {
        Row: {
          id: string;
          owner_user_id: string;
          business_name: string;
          phone: string | null;
          vertical: "hvac" | "plumbing" | "electrical" | "roofing" | "landscaping";
          ghl_location_id: string | null;
          ghl_token_encrypted: string | null;
          onboarding_done_at: string | null;
          trial_ends_at: string | null;
          stripe_customer_id: string | null;
          plan_slug: string;
          provisioning_status: "pending" | "complete" | "error";
          provisioning_error: string | null;
          created_at: string;
          service_area: string | null;
          business_hours: Record<string, unknown> | null;
          voice_gender: string | null;
          voice_greeting: string | null;
          notification_sms: boolean;
          notification_email: boolean;
          notification_contact: string | null;
          onboarding_step: number;
        };
        Insert: {
          id?: string;
          owner_user_id: string;
          business_name: string;
          phone?: string | null;
          vertical: "hvac" | "plumbing" | "electrical" | "roofing" | "landscaping";
          ghl_location_id?: string | null;
          ghl_token_encrypted?: string | null;
          onboarding_done_at?: string | null;
          trial_ends_at?: string | null;
          stripe_customer_id?: string | null;
          plan_slug?: string;
          provisioning_status?: "pending" | "complete" | "error";
          provisioning_error?: string | null;
          created_at?: string;
          service_area?: string | null;
          business_hours?: Record<string, unknown> | null;
          voice_gender?: string | null;
          voice_greeting?: string | null;
          notification_sms?: boolean;
          notification_email?: boolean;
          notification_contact?: string | null;
          onboarding_step?: number;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
      };
      account_users: {
        Row: {
          account_id: string;
          user_id: string;
          role: "admin" | "viewer";
        };
        Insert: {
          account_id: string;
          user_id: string;
          role?: "admin" | "viewer";
        };
        Update: Partial<Database["public"]["Tables"]["account_users"]["Insert"]>;
      };
      recipes: {
        Row: {
          slug: string;
          name: string;
          description: string;
          category: string;
          vertical: "hvac" | "plumbing" | "electrical" | "roofing" | "landscaping" | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          slug: string;
          name: string;
          description?: string;
          category?: string;
          vertical?: "hvac" | "plumbing" | "electrical" | "roofing" | "landscaping" | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recipes"]["Insert"]>;
      };
      recipe_activations: {
        Row: {
          id: string;
          account_id: string;
          recipe_slug: string;
          status: "active" | "paused" | "error";
          config: Record<string, unknown> | null;
          n8n_workflow_id: string | null;
          activated_at: string;
          last_triggered_at: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          recipe_slug: string;
          status?: "active" | "paused" | "error";
          config?: Record<string, unknown> | null;
          n8n_workflow_id?: string | null;
          activated_at?: string;
          last_triggered_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["recipe_activations"]["Insert"]>;
      };
      event_log: {
        Row: {
          id: string;
          account_id: string;
          recipe_slug: string;
          event_type: string;
          summary: string;
          detail: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          recipe_slug: string;
          event_type: string;
          summary: string;
          detail?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["event_log"]["Insert"]>;
      };
      integrations: {
        Row: {
          id: string;
          account_id: string;
          provider: "jobber" | "servicetitan" | "google_business";
          status: "connected" | "disconnected";
          credentials_encrypted: Record<string, unknown> | null;
          connected_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          provider: "jobber" | "servicetitan" | "google_business";
          status?: "connected" | "disconnected";
          credentials_encrypted?: Record<string, unknown> | null;
          connected_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["integrations"]["Insert"]>;
      };
    };
    Enums: {
      vertical: "hvac" | "plumbing" | "electrical" | "roofing" | "landscaping";
      provisioning_status: "pending" | "complete" | "error";
      account_role: "admin" | "viewer";
      recipe_status: "active" | "paused" | "error";
      integration_provider: "jobber" | "servicetitan" | "google_business";
      integration_status: "connected" | "disconnected";
      rate_limit_priority: "low" | "standard" | "high";
    };
  };
};
