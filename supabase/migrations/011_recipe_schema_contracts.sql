-- Canonical recipe schema contracts for recipe_activations + recipe_triggers.
-- Canonical model:
--   recipe_activations: recipe_slug + recipe_status + config(jsonb)
--   recipe_triggers: recipe_slug + recipe_trigger_status + payload(jsonb)
-- Compatibility columns remain for rollback windows only.

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

ALTER TABLE recipe_triggers
  ADD COLUMN IF NOT EXISTS recipe_slug TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

UPDATE recipe_triggers
SET
  recipe_slug = COALESCE(recipe_slug, recipe_id),
  payload = COALESCE(payload, trigger_data, '{}'::jsonb),
  attempt_count = COALESCE(attempt_count, retry_count, 0),
  status = CASE
    WHEN status IS NULL AND fired = true THEN 'completed'
    WHEN status IS NULL AND fired = false THEN 'queued'
    WHEN status = 'pending' THEN 'queued'
    WHEN status = 'fired' THEN 'completed'
    ELSE status
  END;

ALTER TABLE recipe_triggers
  ALTER COLUMN recipe_slug SET NOT NULL,
  ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN attempt_count SET DEFAULT 0,
  ALTER COLUMN status SET DEFAULT 'queued';

UPDATE recipe_triggers
SET status = 'queued'
WHERE status IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recipe_triggers'
      AND column_name = 'status'
      AND udt_name <> 'recipe_trigger_status'
  ) THEN
    ALTER TABLE recipe_triggers
      ALTER COLUMN status TYPE recipe_trigger_status
      USING status::recipe_trigger_status;
  END IF;
END$$;

ALTER TABLE recipe_triggers
  ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recipe_triggers_status_fire_at_v2
  ON recipe_triggers(status, fire_at);

CREATE OR REPLACE FUNCTION assert_column_type(
  p_table_name TEXT,
  p_column_name TEXT,
  p_udt_name TEXT,
  p_is_nullable TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_udt_name TEXT;
  v_is_nullable TEXT;
BEGIN
  SELECT c.udt_name, c.is_nullable
    INTO v_udt_name, v_is_nullable
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = p_table_name
    AND c.column_name = p_column_name;

  IF v_udt_name IS NULL THEN
    RAISE EXCEPTION 'Schema contract failed: %.% is missing', p_table_name, p_column_name;
  END IF;

  IF v_udt_name <> p_udt_name THEN
    RAISE EXCEPTION 'Schema contract failed: %.% expected type %, got %',
      p_table_name,
      p_column_name,
      p_udt_name,
      v_udt_name;
  END IF;

  IF p_is_nullable IS NOT NULL AND v_is_nullable <> p_is_nullable THEN
    RAISE EXCEPTION 'Schema contract failed: %.% expected nullable %, got %',
      p_table_name,
      p_column_name,
      p_is_nullable,
      v_is_nullable;
  END IF;
END;
$$;

-- Assertions: recipe_activations canonical columns.
SELECT assert_column_type('recipe_activations', 'recipe_slug', 'text', 'NO');
SELECT assert_column_type('recipe_activations', 'status', 'recipe_status', 'YES');
SELECT assert_column_type('recipe_activations', 'config', 'jsonb', 'YES');

-- Assertions: recipe_triggers canonical columns.
SELECT assert_column_type('recipe_triggers', 'recipe_slug', 'text', 'NO');
SELECT assert_column_type('recipe_triggers', 'status', 'recipe_trigger_status', 'NO');
SELECT assert_column_type('recipe_triggers', 'payload', 'jsonb', 'YES');

DROP FUNCTION assert_column_type(TEXT, TEXT, TEXT, TEXT);
