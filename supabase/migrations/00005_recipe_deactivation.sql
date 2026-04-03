-- Recipe deactivation: distinct status + timestamp for audit

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'recipe_status' AND e.enumlabel = 'inactive'
  ) THEN
    ALTER TYPE recipe_status ADD VALUE 'inactive';
  END IF;
END$$;

ALTER TABLE recipe_activations
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
