-- Durable retry policy for recipe trigger processing.
-- Allows per-row policy updates without route code changes.

ALTER TABLE recipe_triggers
  ADD COLUMN IF NOT EXISTS max_attempts integer;

ALTER TABLE recipe_triggers
  ALTER COLUMN max_attempts SET DEFAULT 3;

UPDATE recipe_triggers
SET max_attempts = 3
WHERE max_attempts IS NULL;

ALTER TABLE recipe_triggers
  ALTER COLUMN max_attempts SET NOT NULL;

ALTER TABLE recipe_triggers
  DROP CONSTRAINT IF EXISTS recipe_triggers_max_attempts_check;

ALTER TABLE recipe_triggers
  ADD CONSTRAINT recipe_triggers_max_attempts_check
  CHECK (max_attempts >= 1);
