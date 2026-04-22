-- Vector48 — Migration 015: Postgres best-practices hardening
-- Applies four classes of fixes surfaced by the supabase-postgres-best-practices
-- audit against migrations 001 through 014.
--
--   1. Enable RLS on ghl_agency_oauth and stripe_processed_events. Both were
--      created without `ENABLE ROW LEVEL SECURITY`, so every row was readable
--      by any authenticated PostgREST caller. Both tables are intended for
--      service-role-only access (OAuth tokens, webhook dedup ledger).
--
--   2. Add `SET search_path = public` to three SECURITY DEFINER functions.
--      Without it, a caller with a poisoned search_path can hijack unqualified
--      table references inside the function.
--
--   3. Wrap `auth.uid()` / `auth.role()` in `(SELECT …)` inside RLS policies.
--      Unwrapped calls are re-evaluated for every candidate row; wrapping
--      caches the result once per query (5-10x faster on large tables).
--
--   4. Add missing foreign-key indexes on
--        llm_usage_events.tenant_agent_id  (ON DELETE SET NULL)
--        accounts.plan_slug                (→ pricing_config.plan_slug)
--      Postgres does not auto-index FK columns; without these, parent-row
--      deletes/updates require a seq scan of the child table.
--
-- Deferred — cannot fix forward-only without rewriting shipped migrations:
--   • 00008_voice_ai_provisioning.sql lines 10, 13 use bare
--     `ALTER TYPE … ADD VALUE IF NOT EXISTS` which cannot run inside a
--     transaction. 00004 uses the correct `DO $$ … IF NOT EXISTS` wrapper.
--   • 010_schema_v48_updates.sql lines 34, 84, 92 use `CREATE POLICY/TRIGGER
--     IF NOT EXISTS` which is PG16+ syntax. 014 already superseded the policy
--     case; the two trigger cases are idempotent enough on modern PG.


-- ============================================================
-- 1. Enable RLS on previously-unprotected tables
-- ============================================================

ALTER TABLE ghl_agency_oauth ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ghl_agency_oauth_service_role_only" ON ghl_agency_oauth;
CREATE POLICY "ghl_agency_oauth_service_role_only"
  ON ghl_agency_oauth
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

ALTER TABLE stripe_processed_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stripe_processed_events_service_role_only" ON stripe_processed_events;
CREATE POLICY "stripe_processed_events_service_role_only"
  ON stripe_processed_events
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');


-- ============================================================
-- 2. SECURITY DEFINER functions — set explicit search_path
-- ============================================================

-- From 001_initial_schema.sql: AFTER INSERT trigger on accounts.
CREATE OR REPLACE FUNCTION create_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO account_users (account_id, user_id, role)
  VALUES (NEW.id, NEW.owner_user_id, 'admin');
  RETURN NEW;
END;
$$;

-- From 00009_paused_contact_fns.sql.
CREATE OR REPLACE FUNCTION add_paused_contact_id(
  p_activation_id UUID,
  p_contact_id    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE recipe_activations
  SET config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{paused_contact_ids}',
    COALESCE(config -> 'paused_contact_ids', '[]'::jsonb)
      || CASE
           WHEN COALESCE(config -> 'paused_contact_ids', '[]'::jsonb) @> to_jsonb(p_contact_id)
           THEN '[]'::jsonb
           ELSE to_jsonb(p_contact_id)
         END
  )
  WHERE id = p_activation_id;
END;
$$;

CREATE OR REPLACE FUNCTION remove_paused_contact_id(
  p_activation_id UUID,
  p_contact_id    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE recipe_activations
  SET config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{paused_contact_ids}',
    COALESCE(
      (
        SELECT jsonb_agg(elem)
        FROM   jsonb_array_elements(
                 COALESCE(config -> 'paused_contact_ids', '[]'::jsonb)
               ) AS elem
        WHERE  elem <> to_jsonb(p_contact_id)
      ),
      '[]'::jsonb
    )
  )
  WHERE id = p_activation_id;
END;
$$;


-- ============================================================
-- 3. RLS policies — wrap auth.uid() / auth.role() in SELECT
-- ============================================================

-- integrations (from 00004_n8n_schema_tables.sql)
DROP POLICY IF EXISTS "integrations_service_role_only" ON integrations;
CREATE POLICY "integrations_service_role_only"
  ON integrations
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- recipe_triggers service-role policy (from 00004_n8n_schema_tables.sql).
-- The separate user-facing recipe_triggers_select policy from 00010 already
-- goes through get_account_ids_for_user(auth.uid()), which wraps auth.uid()
-- inside a SELECT subquery — nothing to fix there.
DROP POLICY IF EXISTS "recipe_triggers_service_role_only" ON recipe_triggers;
CREATE POLICY "recipe_triggers_service_role_only"
  ON recipe_triggers
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- account_users admin policies (from 00010_rls_hardening.sql)
DROP POLICY IF EXISTS "account_users_insert" ON account_users;
CREATE POLICY "account_users_insert"
  ON account_users FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM account_users
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "account_users_update" ON account_users;
CREATE POLICY "account_users_update"
  ON account_users FOR UPDATE
  USING (
    account_id IN (
      SELECT account_id FROM account_users
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "account_users_delete" ON account_users;
CREATE POLICY "account_users_delete"
  ON account_users FOR DELETE
  USING (
    account_id IN (
      SELECT account_id FROM account_users
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );

-- tenant_agents admin UPDATE (from 00011_agent_runner.sql)
DROP POLICY IF EXISTS tenant_agents_update ON tenant_agents;
CREATE POLICY tenant_agents_update
  ON tenant_agents FOR UPDATE
  USING (
    account_id IN (
      SELECT account_id FROM account_users
      WHERE user_id = (SELECT auth.uid()) AND role = 'admin'
    )
  );


-- ============================================================
-- 4. Missing foreign-key indexes
-- ============================================================

-- llm_usage_events.tenant_agent_id has ON DELETE SET NULL. Without an index,
-- deleting a tenant_agent row forces a seq scan of llm_usage_events to clear
-- the FK. Partial index because tenant_agent_id is nullable and SET NULL
-- rows don't need to be found again.
CREATE INDEX IF NOT EXISTS llm_usage_events_tenant_agent_id_idx
  ON llm_usage_events (tenant_agent_id)
  WHERE tenant_agent_id IS NOT NULL;

-- accounts.plan_slug → pricing_config(plan_slug). Low-write parent but any
-- slug rename/removal would seq-scan accounts without this index.
CREATE INDEX IF NOT EXISTS idx_accounts_plan_slug
  ON accounts (plan_slug);
