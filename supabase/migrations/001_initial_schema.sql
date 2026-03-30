-- Vector 40 — Supabase Migration: 001_initial_schema.sql
-- Generated from PRD v4.1 + CORE-03 prompt spec
-- Run via: supabase db push or paste into Supabase SQL Editor

-- ============================================================
-- 0. Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. Enums
-- ============================================================
CREATE TYPE vertical AS ENUM (
  'hvac', 'plumbing', 'electrical', 'roofing', 'landscaping'
);

CREATE TYPE account_role AS ENUM ('admin', 'viewer');

CREATE TYPE recipe_status AS ENUM ('active', 'paused', 'error', 'deactivated');

CREATE TYPE integration_provider AS ENUM (
  'jobber', 'servicetitan', 'google_business'
);

CREATE TYPE integration_status AS ENUM ('connected', 'disconnected', 'error');

CREATE TYPE provisioning_status AS ENUM (
  'pending', 'in_progress', 'complete', 'failed'
);

CREATE TYPE subscription_status AS ENUM (
  'trialing', 'active', 'past_due', 'canceled', 'paused'
);

CREATE TYPE rate_limit_priority AS ENUM ('low', 'standard', 'high');

-- ============================================================
-- 2. Pricing Config (public read — no RLS)
-- ============================================================
CREATE TABLE pricing_config (
  plan_slug       TEXT PRIMARY KEY,
  display_name    TEXT NOT NULL,
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  max_active_recipes  INTEGER NOT NULL DEFAULT 3,
  webhooks_enabled    BOOLEAN DEFAULT false,
  ghl_cache_ttl_seconds INTEGER DEFAULT 300,
  rate_limit_priority   rate_limit_priority DEFAULT 'low',
  stripe_price_id TEXT,
  features        JSONB DEFAULT '{}',
  is_active       BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed pricing tiers
INSERT INTO pricing_config (plan_slug, display_name, monthly_price_cents, max_active_recipes, webhooks_enabled, ghl_cache_ttl_seconds, rate_limit_priority, features, sort_order) VALUES
  ('trial',   'Free Trial', 0,     3,   false, 300, 'low',      '{"trial_days": 7}',                            0),
  ('starter', 'Starter',    4900,  3,   false, 300, 'low',      '{"support": "email", "sms_included": 500}',    1),
  ('growth',  'Growth',     14900, 999, true,  60,  'standard', '{"support": "priority", "sms_included": 2000, "advanced_reports": true}', 2),
  ('custom',  'Custom',     0,     999, true,  30,  'high',     '{"support": "dedicated", "sms_included": -1, "advanced_reports": true, "custom_recipes": true}', 3);

-- ============================================================
-- 3. Accounts
-- ============================================================
CREATE TABLE accounts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name           TEXT NOT NULL DEFAULT '',
  phone                   TEXT,
  email                   TEXT,
  address_city            TEXT,
  address_state           TEXT,
  address_zip             TEXT,
  vertical                vertical,
  business_hours          JSONB DEFAULT '{}',
  -- GHL
  ghl_location_id         TEXT,
  ghl_token_encrypted     TEXT,
  ghl_provisioning_status provisioning_status DEFAULT 'pending',
  ghl_provisioning_error  TEXT,
  ghl_health_status       TEXT DEFAULT 'healthy',
  ghl_last_health_check   TIMESTAMPTZ,
  -- Voice
  elevenlabs_voice_id     TEXT,
  voice_gender            TEXT CHECK (voice_gender IN ('male', 'female')),
  greeting_text           TEXT,
  greeting_name           TEXT,
  greeting_audio_url      TEXT,
  -- Notifications
  notification_contact_name  TEXT,
  notification_contact_phone TEXT,
  notification_preferences   JSONB DEFAULT '{"sms": true, "email": false, "alerts": {"new_lead": true, "missed_call": true, "negative_sentiment": true, "appointment_cancel": true, "recipe_error": true}}',
  -- Onboarding
  onboarding_step         INTEGER DEFAULT 0,
  onboarding_completed_at TIMESTAMPTZ,
  activate_recipe_1       BOOLEAN DEFAULT false,
  -- Billing
  plan_slug               TEXT REFERENCES pricing_config(plan_slug) DEFAULT 'trial',
  trial_ends_at           TIMESTAMPTZ,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  subscription_status     subscription_status DEFAULT 'trialing',
  -- Timestamps
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_accounts_owner ON accounts(owner_user_id);
CREATE UNIQUE INDEX idx_accounts_ghl_location ON accounts(ghl_location_id) WHERE ghl_location_id IS NOT NULL;
CREATE UNIQUE INDEX idx_accounts_stripe_customer ON accounts(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ============================================================
-- 4. Account Users (multi-tenant, v2-ready)
-- ============================================================
CREATE TABLE account_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        account_role DEFAULT 'admin',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, user_id)
);

CREATE INDEX idx_account_users_user ON account_users(user_id);
CREATE INDEX idx_account_users_account ON account_users(account_id);

-- ============================================================
-- 5. Recipe Activations
-- ============================================================
CREATE TABLE recipe_activations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipe_slug      TEXT NOT NULL,
  status           recipe_status DEFAULT 'active',
  config           JSONB DEFAULT '{}',
  n8n_workflow_id  TEXT,
  activated_at     TIMESTAMPTZ DEFAULT now(),
  last_triggered_at TIMESTAMPTZ,
  deactivated_at   TIMESTAMPTZ,
  error_message    TEXT,
  UNIQUE(account_id, recipe_slug)
);

CREATE INDEX idx_recipe_activations_account_status ON recipe_activations(account_id, status);

-- ============================================================
-- 6. Automation Events (activity feed + recipe stats)
-- ============================================================
CREATE TABLE automation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipe_slug     TEXT,
  event_type      TEXT NOT NULL,
  ghl_event_type  TEXT,
  ghl_event_id    TEXT,
  contact_id      TEXT,
  contact_phone   TEXT,
  contact_name    TEXT,
  summary         TEXT NOT NULL,
  detail          JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_automation_events_feed ON automation_events(account_id, created_at DESC);
CREATE INDEX idx_automation_events_recipe ON automation_events(account_id, recipe_slug, created_at DESC);
CREATE INDEX idx_automation_events_contact ON automation_events(account_id, contact_id);
CREATE UNIQUE INDEX idx_automation_events_ghl_dedup ON automation_events(account_id, ghl_event_id) WHERE ghl_event_id IS NOT NULL;

-- ============================================================
-- 7. Integrations
-- ============================================================
CREATE TABLE integrations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider                integration_provider NOT NULL,
  status                  integration_status DEFAULT 'disconnected',
  credentials_encrypted   JSONB,
  metadata                JSONB DEFAULT '{}',
  connected_at            TIMESTAMPTZ,
  disconnected_at         TIMESTAMPTZ,
  error_message           TEXT,
  UNIQUE(account_id, provider)
);

CREATE INDEX idx_integrations_account ON integrations(account_id);

-- ============================================================
-- 8. Estimate Audit Log (V2 recipe)
-- ============================================================
CREATE TABLE estimate_audit_log (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                 UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id                 TEXT,
  job_type                   TEXT,
  vertical                   vertical,
  original_estimate_text     TEXT,
  suggestions                JSONB DEFAULT '[]',
  accepted_suggestions       JSONB DEFAULT '[]',
  total_estimated_value_cents INTEGER DEFAULT 0,
  created_at                 TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_estimate_audit_account ON estimate_audit_log(account_id, created_at DESC);

-- ============================================================
-- 9. RLS Helper Function
-- ============================================================
CREATE OR REPLACE FUNCTION get_account_ids_for_user(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_id FROM account_users WHERE user_id = p_user_id;
$$;

-- ============================================================
-- 10. Row Level Security
-- ============================================================

-- pricing_config: public read, no RLS
-- (Intentionally no RLS enabled on this table)

-- accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own accounts"
  ON accounts FOR SELECT
  USING (id IN (SELECT get_account_ids_for_user(auth.uid())));

CREATE POLICY "Users can update their own accounts"
  ON accounts FOR UPDATE
  USING (id IN (SELECT get_account_ids_for_user(auth.uid())));

-- INSERT for accounts is special: new users create their own account
-- via service role key in the signup flow. No user-facing INSERT policy.
-- The trigger auto-creates the account_users row.

CREATE POLICY "Service role can insert accounts"
  ON accounts FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

-- account_users
ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memberships"
  ON account_users FOR SELECT
  USING (user_id = auth.uid());

-- INSERT restricted to account owners (v2: admin role check)
CREATE POLICY "Account owners can add members"
  ON account_users FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Account owners can remove members"
  ON account_users FOR DELETE
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE owner_user_id = auth.uid()
    )
  );

-- recipe_activations
ALTER TABLE recipe_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their recipe activations"
  ON recipe_activations FOR SELECT
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

CREATE POLICY "Users can insert recipe activations"
  ON recipe_activations FOR INSERT
  WITH CHECK (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

CREATE POLICY "Users can update recipe activations"
  ON recipe_activations FOR UPDATE
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

-- automation_events
ALTER TABLE automation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their automation events"
  ON automation_events FOR SELECT
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

-- INSERT for automation_events comes from webhooks (service role) and
-- N8N execution endpoints (service role). No user-facing INSERT needed.
-- But we add one for Realtime subscriptions to work with RLS:
CREATE POLICY "Service role inserts automation events"
  ON automation_events FOR INSERT
  WITH CHECK (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

-- integrations
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their integrations"
  ON integrations FOR SELECT
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

CREATE POLICY "Users can manage their integrations"
  ON integrations FOR INSERT
  WITH CHECK (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

CREATE POLICY "Users can update their integrations"
  ON integrations FOR UPDATE
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

CREATE POLICY "Users can delete their integrations"
  ON integrations FOR DELETE
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

-- estimate_audit_log
ALTER TABLE estimate_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their estimate audits"
  ON estimate_audit_log FOR SELECT
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

CREATE POLICY "Users can create estimate audits"
  ON estimate_audit_log FOR INSERT
  WITH CHECK (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

CREATE POLICY "Users can update estimate audits"
  ON estimate_audit_log FOR UPDATE
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

-- ============================================================
-- 11. Triggers
-- ============================================================

-- Auto-set trial_ends_at on account creation
CREATE OR REPLACE FUNCTION set_trial_end()
RETURNS TRIGGER AS $$
BEGIN
  NEW.trial_ends_at := COALESCE(NEW.trial_ends_at, now() + interval '7 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accounts_set_trial
  BEFORE INSERT ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION set_trial_end();

-- Auto-create account_users row for the owner
CREATE OR REPLACE FUNCTION create_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO account_users (account_id, user_id, role)
  VALUES (NEW.id, NEW.owner_user_id, 'admin');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_accounts_create_owner
  AFTER INSERT ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION create_owner_membership();

-- Auto-update updated_at on accounts
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 12. Supabase Realtime (for activity feed)
-- ============================================================

-- Enable realtime on automation_events for the activity feed
ALTER PUBLICATION supabase_realtime ADD TABLE automation_events;

-- ============================================================
-- 13. Storage Bucket (for voice greetings)
-- ============================================================
-- Run in Supabase Dashboard > Storage > New Bucket:
--   Name: voice-greetings
--   Public: true
--   File size limit: 5MB
--   Allowed MIME types: audio/mpeg, audio/wav, audio/mp3

-- Or via SQL (if using Supabase CLI):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('voice-greetings', 'voice-greetings', true);
