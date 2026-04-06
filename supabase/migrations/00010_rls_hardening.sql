-- Vector48 — Migration 00010: RLS Hardening
-- Ensure all tenant table policies go through the account_users join.
--
-- Problems fixed:
--   1. accounts      — dead INSERT policy removed (handle_new_auth_user is
--                      SECURITY DEFINER and bypasses RLS; no user-facing INSERT needed)
--   2. account_users — broaden SELECT from "own row only" to "all members of your accounts";
--                      replace owner_user_id checks on INSERT/DELETE with admin-role checks
--                      via account_users join; add missing UPDATE policy
--   3. automation_events — remove misleading INSERT policy named "Service role inserts …"
--                          that actually checked auth.uid(); service role bypasses RLS
--                          entirely and users should never insert events directly
--   4. recipe_triggers   — normalise SELECT from inline subquery to get_account_ids_for_user()
--                          helper, consistent with every other tenant table
--
-- No existing correct policies are touched.
-- Depends on: get_account_ids_for_user() SECURITY DEFINER helper (001_initial_schema.sql)

-- ============================================================
-- 1. accounts — remove dead INSERT policy
-- ============================================================

-- handle_new_auth_user() is SECURITY DEFINER so it bypasses RLS when creating
-- the accounts row on signup. This INSERT policy was never evaluated and is
-- misleading dead code.
DROP POLICY IF EXISTS "Service role can insert accounts" ON accounts;

-- ============================================================
-- 2. account_users
-- ============================================================

-- SELECT: broaden from "own row only" to all members of every account this
-- user belongs to. Required for any admin "Manage Team" UI.
-- Uses get_account_ids_for_user() (SECURITY DEFINER) to avoid recursion.
DROP POLICY IF EXISTS "Users can view their own memberships" ON account_users;
CREATE POLICY "account_users_select"
  ON account_users FOR SELECT
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));

-- INSERT: any admin of the account can invite new members.
-- The inner subquery hits the SELECT RLS above, which calls the SECURITY DEFINER
-- helper — no infinite recursion.
DROP POLICY IF EXISTS "Account owners can add members" ON account_users;
CREATE POLICY "account_users_insert"
  ON account_users FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT account_id FROM account_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- UPDATE: admins can promote/demote members (e.g. admin → viewer).
CREATE POLICY "account_users_update"
  ON account_users FOR UPDATE
  USING (
    account_id IN (
      SELECT account_id FROM account_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- DELETE: admins can remove members.
DROP POLICY IF EXISTS "Account owners can remove members" ON account_users;
CREATE POLICY "account_users_delete"
  ON account_users FOR DELETE
  USING (
    account_id IN (
      SELECT account_id FROM account_users
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================
-- 3. automation_events — remove misleading INSERT policy
-- ============================================================

-- The original policy was named "Service role inserts automation events" but
-- contained a WITH CHECK on auth.uid(), making it a user-facing policy.
-- Service role (webhooks, n8n cron) bypasses RLS entirely — this policy was
-- never evaluated by those callers. Users should not insert automation events
-- directly, so the policy is dropped with no replacement.
DROP POLICY IF EXISTS "Service role inserts automation events" ON automation_events;

-- ============================================================
-- 4. recipe_triggers — normalise SELECT to helper function
-- ============================================================

-- Replace the inline subquery with the standard get_account_ids_for_user()
-- helper used by every other tenant table.
DROP POLICY IF EXISTS "recipe_triggers_select" ON recipe_triggers;
CREATE POLICY "recipe_triggers_select"
  ON recipe_triggers FOR SELECT
  USING (account_id IN (SELECT get_account_ids_for_user(auth.uid())));
