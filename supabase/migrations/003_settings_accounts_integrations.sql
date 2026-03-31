-- Settings (Prompt 7): accounts notification columns, timezone, GHL voice agent id,
-- vertical 'other', integration_provider 'ghl', integrations.updated_at

-- ============================================================
-- 1. Enum additions (idempotent)
-- ============================================================
DO $$ BEGIN
  ALTER TYPE vertical ADD VALUE 'other';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE integration_provider ADD VALUE 'ghl';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. Accounts
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS notification_email TEXT,
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quiet_hours_start TIME,
  ADD COLUMN IF NOT EXISTS quiet_hours_end TIME,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Phoenix',
  ADD COLUMN IF NOT EXISTS ghl_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ghl_voice_agent_id TEXT;

-- ============================================================
-- 3. Integrations — last synced
-- ============================================================
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE integrations SET updated_at = COALESCE(connected_at, now()) WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION integrations_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS integrations_set_updated_at ON integrations;
CREATE TRIGGER integrations_set_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE PROCEDURE integrations_touch_updated_at();
