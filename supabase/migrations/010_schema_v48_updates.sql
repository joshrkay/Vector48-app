-- ============================================================
-- Vector 48 — Schema v48 updates
-- Adds columns, tables, and enum values introduced in the
-- complete schema rewrite. Safe to run against existing DBs —
-- all additions use IF NOT EXISTS / ON CONFLICT guards.
-- ============================================================

-- ============================================================
-- 1. Enum additions
-- ============================================================

ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'elevenlabs';
ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'twilio';

-- ============================================================
-- 2. Pricing config — updated prices + new 'pro' plan
-- ============================================================

UPDATE pricing_config SET monthly_price_cents = 9700  WHERE plan_slug = 'starter';
UPDATE pricing_config SET monthly_price_cents = 19700 WHERE plan_slug = 'growth';

INSERT INTO pricing_config (
  plan_slug, display_name, monthly_price_cents, max_active_recipes,
  webhooks_enabled, ghl_cache_ttl_seconds, rate_limit_priority,
  features, sort_order
) VALUES (
  'pro', 'Pro', 39700, 999, true, 30, 'high',
  '{"support": "dedicated", "sms_included": -1, "advanced_reports": true, "custom_recipes": true, "voice_cloning": true}',
  3
) ON CONFLICT (plan_slug) DO NOTHING;

-- Enable RLS on pricing_config (public read)
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "pricing_config_public_read"
  ON pricing_config FOR SELECT USING (true);

-- ============================================================
-- 3. Accounts — new columns
-- ============================================================

ALTER TABLE accounts
  -- GHL sub-account tracking
  ADD COLUMN IF NOT EXISTS ghl_sub_account_id TEXT,
  -- Notification settings
  -- NOTE: if a boolean column named notification_email already exists
  -- (from a manual migration), this IF NOT EXISTS will silently skip it.
  -- In that case rename the old column first: ALTER TABLE accounts RENAME COLUMN notification_email TO notification_email_enabled;
  ADD COLUMN IF NOT EXISTS notification_email TEXT,
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS quiet_hours_start TIME,
  ADD COLUMN IF NOT EXISTS quiet_hours_end TIME,
  -- Billing health state (separate from subscription_status)
  ADD COLUMN IF NOT EXISTS billing_status TEXT
    CHECK (billing_status IN ('active', 'past_due', 'canceled', 'expired'))
    DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_accounts_ghl_sub_account ON accounts(ghl_sub_account_id);

-- ============================================================
-- 4. Recipe activations — GHL webhook tracking columns
-- ============================================================

ALTER TABLE recipe_activations
  ADD COLUMN IF NOT EXISTS ghl_webhook_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_event_types TEXT[] DEFAULT '{}';

-- ============================================================
-- 5. Automation events — execution status column
-- ============================================================

ALTER TABLE automation_events
  ADD COLUMN IF NOT EXISTS status TEXT
    CHECK (status IN ('success', 'failed', 'partial'))
    DEFAULT 'success';

-- ============================================================
-- 6. Integrations — timestamps + updated_at trigger
-- ============================================================

ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TRIGGER IF NOT EXISTS integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 7. Pricing config — updated_at trigger
-- ============================================================

CREATE TRIGGER IF NOT EXISTS pricing_config_updated_at
  BEFORE UPDATE ON pricing_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 8. Recipe triggers — align shape with v48 schema
-- (Table created in 008; add new columns to match new design.)
-- ============================================================

ALTER TABLE recipe_triggers
  -- recipe_id is the v48 replacement for recipe_slug (keep recipe_slug for compat)
  ADD COLUMN IF NOT EXISTS recipe_id TEXT,
  -- status replaces the fired boolean (keep fired for compat)
  ADD COLUMN IF NOT EXISTS status TEXT
    CHECK (status IN ('pending', 'fired', 'failed', 'cancelled'))
    DEFAULT 'pending',
  -- trigger_data replaces payload (keep payload for compat)
  ADD COLUMN IF NOT EXISTS trigger_data JSONB DEFAULT '{}',
  -- execution tracking
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS n8n_response_status INTEGER,
  ADD COLUMN IF NOT EXISTS fired_at TIMESTAMPTZ;

-- Index for status-based cron lookups (complements the existing fired=false index)
CREATE INDEX IF NOT EXISTS idx_recipe_triggers_status_pending
  ON recipe_triggers(fire_at)
  WHERE status = 'pending';

-- ============================================================
-- 9. New RLS helper — auth.uid()-based (no parameter needed)
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_account_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT account_id FROM account_users WHERE user_id = auth.uid()
$$;
