-- Vector 48 — Initial Schema
-- Run against a Supabase project (Postgres 15+)

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE vertical AS ENUM (
  'hvac', 'plumbing', 'electrical', 'roofing', 'landscaping'
);

CREATE TYPE provisioning_status AS ENUM (
  'pending', 'complete', 'error'
);

CREATE TYPE account_role AS ENUM (
  'admin', 'viewer'
);

CREATE TYPE recipe_status AS ENUM (
  'active', 'paused', 'error'
);

CREATE TYPE integration_provider AS ENUM (
  'jobber', 'servicetitan', 'google_business'
);

CREATE TYPE integration_status AS ENUM (
  'connected', 'disconnected'
);

CREATE TYPE rate_limit_priority AS ENUM (
  'low', 'standard', 'high'
);

-- =============================================================================
-- TABLES
-- =============================================================================

-- Pricing config — publicly readable, no RLS
CREATE TABLE pricing_config (
  plan_slug            text PRIMARY KEY,
  display_name         text NOT NULL,
  monthly_price_cents  int NOT NULL DEFAULT 0,
  max_active_recipes   int NOT NULL DEFAULT 3,
  webhooks_enabled     boolean NOT NULL DEFAULT false,
  ghl_cache_ttl_secs   int NOT NULL DEFAULT 300,
  rate_limit_priority  rate_limit_priority NOT NULL DEFAULT 'low',
  stripe_price_id      text NOT NULL DEFAULT '',
  is_active            boolean NOT NULL DEFAULT true
);

ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing_config_public_read" ON pricing_config
  FOR SELECT USING (true);

-- Accounts — tenant root
CREATE TABLE accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name         text NOT NULL,
  phone                 text,
  vertical              vertical NOT NULL,
  ghl_location_id       text,
  ghl_token_encrypted   text,
  onboarding_done_at    timestamptz,
  trial_ends_at         timestamptz DEFAULT (now() + interval '14 days'),
  stripe_customer_id    text,
  plan_slug             text NOT NULL DEFAULT 'trial' REFERENCES pricing_config(plan_slug),
  provisioning_status   provisioning_status NOT NULL DEFAULT 'pending',
  provisioning_error    text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Account users — access control join table
CREATE TABLE account_users (
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        account_role NOT NULL DEFAULT 'admin',
  PRIMARY KEY (account_id, user_id)
);

ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;

-- Recipe activations — per-customer recipe state
CREATE TABLE recipe_activations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipe_slug       text NOT NULL,
  status            recipe_status NOT NULL DEFAULT 'active',
  config            jsonb,
  n8n_workflow_id   text,
  activated_at      timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz
);

ALTER TABLE recipe_activations ENABLE ROW LEVEL SECURITY;

-- Automation events — activity feed
CREATE TABLE automation_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipe_slug   text NOT NULL,
  event_type    text NOT NULL,
  summary       text NOT NULL,
  detail        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE automation_events ENABLE ROW LEVEL SECURITY;

-- Integrations — third-party connections
CREATE TABLE integrations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider                integration_provider NOT NULL,
  status                  integration_status NOT NULL DEFAULT 'disconnected',
  credentials_encrypted   jsonb,
  connected_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES — tenant isolation via account_users
-- =============================================================================

-- Helper: check if current user belongs to a given account
-- Used in all tenant RLS policies below

-- accounts: user can see/modify their own accounts
CREATE POLICY "accounts_select" ON accounts FOR SELECT USING (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = id)
);
CREATE POLICY "accounts_insert" ON accounts FOR INSERT WITH CHECK (
  owner_user_id = auth.uid()
);
CREATE POLICY "accounts_update" ON accounts FOR UPDATE USING (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = id)
);
CREATE POLICY "accounts_delete" ON accounts FOR DELETE USING (
  owner_user_id = auth.uid()
);

-- account_users: user can see their own memberships
CREATE POLICY "account_users_select" ON account_users FOR SELECT USING (
  auth.uid() = user_id
  OR auth.uid() IN (SELECT user_id FROM account_users au WHERE au.account_id = account_users.account_id)
);
CREATE POLICY "account_users_insert" ON account_users FOR INSERT WITH CHECK (
  -- Account owner can always add members (bootstraps first row)
  auth.uid() IN (SELECT owner_user_id FROM accounts WHERE id = account_users.account_id)
  OR
  -- Existing admins can add members
  auth.uid() IN (
    SELECT user_id FROM account_users au
    WHERE au.account_id = account_users.account_id AND au.role = 'admin'
  )
);
CREATE POLICY "account_users_delete" ON account_users FOR DELETE USING (
  auth.uid() IN (
    SELECT user_id FROM account_users WHERE account_id = account_users.account_id AND role = 'admin'
  )
);

-- recipe_activations
CREATE POLICY "recipe_activations_select" ON recipe_activations FOR SELECT USING (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = recipe_activations.account_id)
);
CREATE POLICY "recipe_activations_insert" ON recipe_activations FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = recipe_activations.account_id)
);
CREATE POLICY "recipe_activations_update" ON recipe_activations FOR UPDATE USING (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = recipe_activations.account_id)
);
CREATE POLICY "recipe_activations_delete" ON recipe_activations FOR DELETE USING (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = recipe_activations.account_id)
);

-- automation_events
CREATE POLICY "automation_events_select" ON automation_events FOR SELECT USING (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = automation_events.account_id)
);
CREATE POLICY "automation_events_insert" ON automation_events FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = automation_events.account_id)
);

-- integrations
CREATE POLICY "integrations_select" ON integrations FOR SELECT USING (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = integrations.account_id)
);
CREATE POLICY "integrations_insert" ON integrations FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = integrations.account_id)
);
CREATE POLICY "integrations_update" ON integrations FOR UPDATE USING (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = integrations.account_id)
);
CREATE POLICY "integrations_delete" ON integrations FOR DELETE USING (
  auth.uid() IN (SELECT user_id FROM account_users WHERE account_id = integrations.account_id)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_accounts_owner ON accounts(owner_user_id);
CREATE INDEX idx_account_users_user ON account_users(user_id);
CREATE INDEX idx_recipe_activations_account ON recipe_activations(account_id);
CREATE INDEX idx_automation_events_account ON automation_events(account_id);
CREATE INDEX idx_automation_events_created ON automation_events(account_id, created_at DESC);
CREATE INDEX idx_integrations_account ON integrations(account_id);

-- =============================================================================
-- REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE automation_events;

-- =============================================================================
-- SEED DATA — pricing tiers
-- =============================================================================

INSERT INTO pricing_config (plan_slug, display_name, monthly_price_cents, max_active_recipes, webhooks_enabled, ghl_cache_ttl_secs, rate_limit_priority, stripe_price_id, is_active) VALUES
  ('trial',   'Trial',   0,     3,  false, 300, 'low',      'price_placeholder_trial',   true),
  ('starter', 'Starter', 9900,  7,  true,  120, 'standard', 'price_placeholder_starter', true),
  ('growth',  'Growth',  24900, 14, true,  60,  'high',     'price_placeholder_growth',  true);
