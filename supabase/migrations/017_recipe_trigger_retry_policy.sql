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

CREATE OR REPLACE FUNCTION public.get_due_recipe_triggers(
  p_now timestamptz,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  account_id uuid,
  recipe_slug text,
  payload jsonb,
  attempt_count integer,
  max_attempts integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    rt.id,
    rt.account_id,
    rt.recipe_slug,
    rt.payload,
    rt.attempt_count,
    rt.max_attempts
  FROM recipe_triggers rt
  WHERE rt.status = 'queued'
    AND rt.fire_at <= p_now
    AND rt.attempt_count < rt.max_attempts
  ORDER BY rt.fire_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500)
$$;
