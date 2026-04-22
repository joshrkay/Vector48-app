-- Tighten RLS on pricing_config.
--
-- Context: 010_schema_v48_updates.sql attempted to enable RLS and add a
-- public-read policy, but (a) `CREATE POLICY IF NOT EXISTS` is Postgres-16+
-- syntax which may have no-op'd on older projects and (b) the policy had no
-- `TO` clause so it defaulted to PUBLIC — meaning anon could still read the
-- pricing catalog through the PostgREST Data API.
--
-- No code path reads pricing_config from an anon client (signup/pricing are
-- not public pages; all callers use createServerClient() with a user session
-- or getSupabaseAdmin() which bypasses RLS). Tighten to authenticated-only.

-- Enable RLS (safe-default deny without a matching policy).
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;

-- Remove the prior over-permissive policy if it exists.
DROP POLICY IF EXISTS "pricing_config_public_read" ON public.pricing_config;

-- Authenticated-only read. Writes go through migrations and service_role
-- clients, both of which bypass RLS, so no INSERT/UPDATE/DELETE policy is
-- needed.
DROP POLICY IF EXISTS "pricing_config_select_authenticated" ON public.pricing_config;
CREATE POLICY "pricing_config_select_authenticated"
  ON public.pricing_config
  FOR SELECT
  TO authenticated
  USING (true);
