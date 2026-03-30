-- Recipe activation lifecycle: deactivated status, provisioning timestamps, integrations, uniqueness.

-- 1) recipe_status enum
DO $$ BEGIN
  ALTER TYPE recipe_status ADD VALUE 'deactivated';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) recipe_activations (deactivated_at)
ALTER TABLE recipe_activations
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- 3) One row per account + recipe (idempotency / reactivation)
CREATE UNIQUE INDEX IF NOT EXISTS recipe_activations_account_recipe_unique
  ON recipe_activations (account_id, recipe_slug);

-- 4) integration_provider — catalog keys (google_business already exists in 00001)
DO $$ BEGIN
  ALTER TYPE integration_provider ADD VALUE 'twilio';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE integration_provider ADD VALUE 'elevenlabs';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
