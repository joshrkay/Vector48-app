-- Vector 48 — n8n schema alignment
-- Aligns integrations, recipe_activations, recipe_triggers, and event_log
-- with the n8n implementation requirements.

-- =============================================================================
-- INTEGRATIONS — include GHL provider and lock down to service_role only
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'integration_provider' AND e.enumlabel = 'ghl'
  ) THEN
    ALTER TYPE integration_provider ADD VALUE 'ghl';
  END IF;
END$$;

ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill updated_at for existing rows.
UPDATE integrations
SET updated_at = connected_at
WHERE updated_at IS NULL;

-- Ensure one integration per account/provider.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'integrations_account_provider_key'
  ) THEN
    ALTER TABLE integrations
      ADD CONSTRAINT integrations_account_provider_key UNIQUE (account_id, provider);
  END IF;
END$$;

-- Replace user-facing policies with service-role-only access.
DROP POLICY IF EXISTS "integrations_select" ON integrations;
DROP POLICY IF EXISTS "integrations_insert" ON integrations;
DROP POLICY IF EXISTS "integrations_update" ON integrations;
DROP POLICY IF EXISTS "integrations_delete" ON integrations;
DROP POLICY IF EXISTS "integrations_service_role_only" ON integrations;

CREATE POLICY "integrations_service_role_only"
  ON integrations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- RECIPE TRIGGERS — queued scheduled executions
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recipe_trigger_status') THEN
    CREATE TYPE recipe_trigger_status AS ENUM (
      'queued',
      'processing',
      'completed',
      'failed',
      'cancelled'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS recipe_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipe_id text NOT NULL,
  status recipe_trigger_status NOT NULL DEFAULT 'queued',
  fire_at timestamptz NOT NULL,
  payload jsonb,
  attempt_count int NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recipe_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipe_triggers_service_role_only" ON recipe_triggers;
CREATE POLICY "recipe_triggers_service_role_only"
  ON recipe_triggers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_recipe_triggers_fire_at ON recipe_triggers(fire_at);
CREATE INDEX IF NOT EXISTS idx_recipe_triggers_status_fire_at ON recipe_triggers(status, fire_at);
CREATE INDEX IF NOT EXISTS idx_recipe_triggers_account_id ON recipe_triggers(account_id);

-- =============================================================================
-- RECIPE ACTIVATIONS — add recipe_id + ghl webhook tracking
-- =============================================================================

ALTER TABLE recipe_activations
  ADD COLUMN IF NOT EXISTS recipe_id text,
  ADD COLUMN IF NOT EXISTS webhook_id text;

UPDATE recipe_activations
SET recipe_id = recipe_slug
WHERE recipe_id IS NULL;

ALTER TABLE recipe_activations
  ALTER COLUMN recipe_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_activations_account_recipe_id
  ON recipe_activations(account_id, recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipe_activations_webhook_id
  ON recipe_activations(webhook_id)
  WHERE webhook_id IS NOT NULL;

-- =============================================================================
-- EVENT LOG — ensure account_id lookup index exists
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_event_log_account_id ON event_log(account_id);
