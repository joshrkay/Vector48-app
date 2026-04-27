-- Backfill tenant_agents.tool_config for existing lead-qualification rows.
--
-- Before Phase 1 the lead-qualification recipe ran as a single-shot SMS
-- handler that didn't read tool_config. Existing tenant_agents rows for
-- this recipe therefore have an empty (or enabledTools-less) tool_config,
-- and the new multi-turn handler short-circuits with skipped_no_enabled_tools.
--
-- Copy the archetype defaults onto every existing row so it can run.
-- New activations populate tool_config from the archetype on insert (see
-- lib/recipes/runner/seedAgent.ts), so this is a one-time backfill.
--
-- The tenant_agents_protect_immutable trigger forbids tool_config edits
-- from anyone other than service_role. Direct SQL migrations don't carry
-- a JWT, so set the claim locally for this transaction; this matches the
-- intent of the trigger ("operators can edit tool_config; tenants can't").

DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    true
  );

  UPDATE tenant_agents
  SET tool_config = jsonb_set(
    COALESCE(tool_config, '{}'::jsonb),
    '{enabledTools}',
    '["sendSms", "lookupContact", "createTask", "checkCalendar"]'::jsonb,
    true
  )
  WHERE recipe_slug = 'lead-qualification'
    AND (
      tool_config IS NULL
      OR NOT (tool_config ? 'enabledTools')
      OR jsonb_typeof(tool_config -> 'enabledTools') <> 'array'
      OR tool_config -> 'enabledTools' = '[]'::jsonb
    );
END $$;
