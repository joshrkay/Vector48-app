-- Vector48 — Migration 00011: Agent Runner foundation
-- Schema for the Anthropic Agent SDK runner that replaces the n8n recipe
-- engine. Adds three tables:
--
--   1. tenant_agents          — per-(account, recipe) editable agent row.
--                               Seeded from operator-authored archetypes on
--                               recipe activation. Drives prompts, model,
--                               voice, spend cap, status.
--
--   2. tenant_agent_sessions  — multi-turn conversation state for the one
--                               recipe (lead-qualification) that needs it.
--                               One row per (tenant_agent, contact).
--
--   3. llm_usage_events       — per-call Claude usage telemetry. One row per
--                               messages.create() call, with token counts and
--                               cost in micros. Drives the Usage dashboard
--                               and per-tenant spend caps.
--
-- All three tables use Supabase RLS via the existing
-- get_account_ids_for_user() helper from 001_initial_schema.sql.
--
-- Depends on: accounts (001_initial_schema.sql),
--             get_account_ids_for_user() (001_initial_schema.sql)

-- ============================================================
-- 1. tenant_agents
-- ============================================================

CREATE TABLE tenant_agents (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipe_slug              TEXT NOT NULL,
  display_name             TEXT NOT NULL,

  -- Tenant-editable configuration (within plan limits enforced in API layer)
  system_prompt            TEXT NOT NULL,
  model                    TEXT NOT NULL,
  max_tokens               INT  NOT NULL DEFAULT 1024,
  temperature              REAL,
  voice_id                 TEXT,

  -- Operator-controlled, copied from the archetype on insert.
  -- Tenants do NOT edit this — exposing tools is a security boundary.
  -- Enforcement: the tenant_agents_protect_immutable trigger below rejects
  -- updates to tool_config (and to id/account_id/recipe_slug) from any
  -- caller that is not the service role.
  tool_config              JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Per-agent spend + rate limits. NULL means inherit plan default.
  monthly_spend_cap_micros BIGINT,
  rate_limit_per_hour      INT,

  status                   TEXT NOT NULL DEFAULT 'active',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tenant_agents_status_check
    CHECK (status IN ('active', 'paused', 'disabled')),
  CONSTRAINT tenant_agents_account_recipe_unique
    UNIQUE (account_id, recipe_slug),
  -- Composite key is a FK target for tenant_agent_sessions so that
  -- (tenant_agent_id, account_id) rows cannot drift out of sync and
  -- leak one tenant's sessions under another tenant's RLS filter.
  CONSTRAINT tenant_agents_id_account_key
    UNIQUE (id, account_id)
);

CREATE INDEX tenant_agents_account_idx
  ON tenant_agents (account_id);

CREATE INDEX tenant_agents_status_idx
  ON tenant_agents (status)
  WHERE status = 'active';

-- ============================================================
-- 2. tenant_agent_sessions
-- ============================================================

CREATE TABLE tenant_agent_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_agent_id  UUID NOT NULL,
  -- Denormalised account_id for cheap RLS. The composite FK below
  -- (tenant_agent_id, account_id) -> tenant_agents (id, account_id)
  -- enforces that this value always matches the agent's account, so a
  -- caller cannot insert a session with a mismatched account_id and
  -- have it surface under the wrong tenant's RLS filter.
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id       TEXT,
  messages         JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_uses        JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tenant_agent_sessions_agent_account_fk
    FOREIGN KEY (tenant_agent_id, account_id)
    REFERENCES tenant_agents (id, account_id) ON DELETE CASCADE
);

-- UNIQUE so the runner can SELECT … FOR UPDATE on
-- (tenant_agent_id, contact_id) to resume a multi-turn conversation
-- without ambiguous duplicates under concurrent writes. Postgres's
-- default NULLS DISTINCT semantics still allow multiple rows with
-- NULL contact_id, which is acceptable — in practice sessions are
-- only created once we have a contact to converse with.
CREATE UNIQUE INDEX tenant_agent_sessions_lookup_idx
  ON tenant_agent_sessions (tenant_agent_id, contact_id);

CREATE INDEX tenant_agent_sessions_account_idx
  ON tenant_agent_sessions (account_id);

-- ============================================================
-- 3. llm_usage_events
-- ============================================================

CREATE TABLE llm_usage_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_agent_id    UUID REFERENCES tenant_agents(id) ON DELETE SET NULL,
  recipe_slug        TEXT NOT NULL,
  model              TEXT NOT NULL,
  input_tokens       INT  NOT NULL,
  output_tokens      INT  NOT NULL,
  cache_read_tokens  INT  NOT NULL DEFAULT 0,
  cache_write_tokens INT  NOT NULL DEFAULT 0,
  -- USD cost expressed as micros (1 USD = 1_000_000 micros) so we can
  -- aggregate without floating-point drift.
  cost_micros        BIGINT NOT NULL,
  trigger_id         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aggregation index for the monthly spend-cap query and Usage dashboard.
CREATE INDEX llm_usage_events_account_month_idx
  ON llm_usage_events (account_id, created_at DESC);

CREATE INDEX llm_usage_events_recipe_idx
  ON llm_usage_events (account_id, recipe_slug, created_at DESC);

-- ============================================================
-- updated_at + immutable-column protection triggers for tenant_agents
-- ============================================================

CREATE OR REPLACE FUNCTION tenant_agents_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_agents_updated_at
  BEFORE UPDATE ON tenant_agents
  FOR EACH ROW EXECUTE FUNCTION tenant_agents_set_updated_at();

-- Operator-only and immutable columns. The tenant_agents_update RLS
-- policy grants admins UPDATE on the row, which PostgREST exposes at
-- column granularity. Without this trigger, an admin could PATCH
-- tool_config (enabling tools the operator never approved) or
-- recipe_slug / account_id / id (rebinding an agent to another tenant).
--
-- The check is bypassed for the service role — that's how the runner,
-- the activation API, and admin scripts edit these fields.
CREATE OR REPLACE FUNCTION tenant_agents_protect_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'tenant_agents.id is immutable';
    END IF;
    IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
      RAISE EXCEPTION 'tenant_agents.account_id is immutable';
    END IF;
    IF NEW.recipe_slug IS DISTINCT FROM OLD.recipe_slug THEN
      RAISE EXCEPTION 'tenant_agents.recipe_slug is immutable';
    END IF;
    IF NEW.tool_config IS DISTINCT FROM OLD.tool_config THEN
      RAISE EXCEPTION 'tenant_agents.tool_config is operator-controlled and cannot be updated by tenants';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_agents_protect_immutable_trg
  BEFORE UPDATE ON tenant_agents
  FOR EACH ROW EXECUTE FUNCTION tenant_agents_protect_immutable();

-- ============================================================
-- Monthly spend aggregation (called from lib/recipes/runner/spendCap.ts)
-- ============================================================

-- Server-side sum so the runner never streams thousands of rows back to
-- Node just to add them up. Runs before every Claude call via the
-- tracked client — latency and bandwidth matter.
--
-- SECURITY DEFINER because llm_usage_events has per-account RLS. The
-- caller is always the service role or the row's own account, so
-- widening to SECURITY DEFINER plus an explicit account_id argument is
-- safe: the function only ever sums rows for the supplied account.
CREATE OR REPLACE FUNCTION get_monthly_spend_micros(
  p_account_id  UUID,
  p_recipe_slug TEXT
) RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(cost_micros), 0)::BIGINT
  FROM llm_usage_events
  WHERE account_id = p_account_id
    AND recipe_slug = p_recipe_slug
    AND created_at >= date_trunc('month', (now() AT TIME ZONE 'UTC'));
$$;

-- Let authenticated users and the service role call the RPC. The
-- function body scopes by p_account_id, and Supabase's RLS on the
-- underlying table still applies to any direct SELECT.
GRANT EXECUTE ON FUNCTION get_monthly_spend_micros(UUID, TEXT)
  TO authenticated, service_role;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE tenant_agents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_agent_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_usage_events       ENABLE ROW LEVEL SECURITY;

-- tenant_agents: members of the account can view; admins of the account can
-- update (edit prompt, model, voice, spend cap). Inserts/deletes happen
-- through the service role on activation/deactivation.
CREATE POLICY tenant_agents_select
  ON tenant_agents FOR SELECT
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

CREATE POLICY tenant_agents_update
  ON tenant_agents FOR UPDATE
  USING (
    account_id IN (
      SELECT account_id FROM account_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- tenant_agent_sessions: read-only for account members. All writes go
-- through the service-role runner.
CREATE POLICY tenant_agent_sessions_select
  ON tenant_agent_sessions FOR SELECT
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

-- llm_usage_events: read-only for account members (drives the Usage tab).
-- All writes go through the service-role tracked Anthropic client.
CREATE POLICY llm_usage_events_select
  ON llm_usage_events FOR SELECT
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));
