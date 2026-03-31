-- Vector 48 — Voice AI Provisioning schema additions
-- Adds: in_progress provisioning status, ghl integration provider,
--        voice agent tracking columns, recipe_triggers table.

-- =============================================================================
-- ENUM ADDITIONS
-- =============================================================================

-- Allow tracking the in-progress provisioning state
ALTER TYPE provisioning_status ADD VALUE IF NOT EXISTS 'in_progress';

-- GHL as a first-class integration provider (for sub-account tokens)
ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'ghl';

-- =============================================================================
-- ACCOUNTS — Voice AI provisioning columns
-- =============================================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS ghl_voice_agent_id text,
  ADD COLUMN IF NOT EXISTS provisioning_completed_at timestamptz;

-- =============================================================================
-- RECIPE_TRIGGERS — Scheduled recipe triggers (Pattern B)
-- Webhook events that need delayed execution (e.g., appointment reminders
-- 24h before, estimate follow-ups 24h after) are written here. A cron job
-- picks up rows where fire_at <= now() and fired = false.
-- =============================================================================

CREATE TABLE IF NOT EXISTS recipe_triggers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipe_slug     text NOT NULL,
  ghl_event_type  text NOT NULL,
  contact_id      text,
  fire_at         timestamptz NOT NULL,
  fired           boolean NOT NULL DEFAULT false,
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recipe_triggers ENABLE ROW LEVEL SECURITY;

-- Tenant isolation — users can read their own triggers
CREATE POLICY "recipe_triggers_select" ON recipe_triggers FOR SELECT USING (
  auth.uid() IN (
    SELECT user_id FROM account_users WHERE account_id = recipe_triggers.account_id
  )
);

-- Service role can insert/update (from webhook handler and cron)
CREATE POLICY "recipe_triggers_service_role" ON recipe_triggers
  FOR ALL USING (auth.role() = 'service_role');

-- Fast lookup for the cron processor
CREATE INDEX idx_recipe_triggers_pending
  ON recipe_triggers (fire_at)
  WHERE fired = false;

-- Account-scoped lookups
CREATE INDEX idx_recipe_triggers_account
  ON recipe_triggers (account_id, recipe_slug);
