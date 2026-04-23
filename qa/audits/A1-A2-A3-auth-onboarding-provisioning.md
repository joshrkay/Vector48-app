# A1 + A2 + A3 — Auth, Onboarding, Provisioning Audit

**Agents**: A1 Auth + A2 Onboarding + A3 Provisioning
**Scope**: Signup, login, password reset, 8-step wizard, 6-step GHL provisioning, n8n recipe provisioning, RLS, triggers
**Status**: 🔴 **3 schema/idempotency blockers — ship-blocking**

## Summary

Auth and RLS are solid: signup triggers fire in the correct order (`trg_accounts_set_trial` BEFORE INSERT → `trg_accounts_create_owner` AFTER INSERT), email confirmation is enforced, replay-safe auth params stripped by middleware. The 8-step onboarding wizard persists atomically per step, resumes correctly on refresh. Provisioning has the right shape (6 GHL steps + optional n8n with HMAC cross-tenant token). **Three critical defects** will break launch.

## 🔴 Blockers (must fix before ship)

### EDGE-CASE-007: `onboarding_done_at` column referenced but doesn't exist
`login/page.tsx:71` and `lib/data/session.ts:16` query `onboarding_done_at`, but the schema only has `onboarding_completed_at`. Supabase `maybeSingle()` returns null silently, causing incorrect post-login routing.
**Fix**: Rename every reference to `onboarding_completed_at` OR add migration to create the column.

### EDGE-CASE-008: `provisioning_step` column used but never added
`lib/jobs/provisionGHL.ts` lines 392, 464, 472, 517, 545, 554 `UPDATE ... SET provisioning_step=N` but no migration adds this column. Writes silently ignored → resume-from-step logic fails.
**Fix**: Add `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS provisioning_step INTEGER DEFAULT 0;`

### EDGE-CASE-010: Inngest `provisionCustomerFn` has no idempotency key
`lib/inngest/functions.ts:17-21` sets `retries: 2` but no `idempotencyKey`. On retry after partial success, `provisionGHL()` will call `createLocation()` again — creating a duplicate GHL location for the same tenant.
**Fix**: Add `idempotencyKey: (event) => event.data.accountId` or implement per-step idempotency checks for steps 2-6 (step 1 already checks `ghl_location_id`).

## 🟠 Majors

- **EDGE-CASE-001**: `handle_new_auth_user` trigger (migration 005) independently inserts the accounts row with `plan_slug='trial'`. Verify `trial_ends_at` is correctly populated (expected 7 days from now) — `trg_accounts_set_trial` should fire BEFORE INSERT on that row.
- **PROV-GHL-1-005**: Inngest retries do not track step state. Step 1 idempotent (checks `ghl_location_id`); steps 2–6 are not. Add checks or rely on idempotency key.
- **EDGE-CASE-002**: Middleware trial check uses strict `<`. Correct but tight — verify UTC vs user-local-time expectations.

## Matrix (101 rows, abridged summary)

| Area | Pass | Unknown | Fail | Notes |
|------|-----:|--------:|-----:|-------|
| Auth (AUTH-*) | 19 | 1 | 0 | Logout UI not reviewed |
| Onboarding per-step (ONB-*) | 18 | 4 | 0 | Step 0 Welcome and step-to-column mapping for steps 2/3 need UI verification |
| Provisioning GHL (PROV-GHL-*) | 19 | 0 | 1 | PROV-GHL-1-005 resume-on-retry gap |
| Provisioning n8n (PROV-N8N-*) | 8 | 0 | 0 | All passing, HMAC token + naming isolation verified |
| Edge cases (EDGE-CASE-*) | 17 | 0 | 3 | 3 critical schema/idempotency issues above |

Key passing rows:
- **AUTH-005** Email confirmation exchange handled by middleware's `getUser()` on /onboarding
- **AUTH-014** Middleware strips `?code=`, `?error=` before redirect (replay protection)
- **AUTH-017..019** Trigger chain: `on_auth_user_created` → inserts account → `trg_accounts_set_trial` BEFORE sets `trial_ends_at = now() + 7 days` → `trg_accounts_create_owner` AFTER creates `account_users` admin row
- **ONB-final-001/002** Completion sets `onboarding_completed_at`, enqueues Inngest, optional `recipe_activations` row
- **PROV-GHL-*** all 6 steps have hard-4xx failure capture (`failProvisioning`) with error persisted to DB
- **PROV-N8N-003** HMAC execution token `HMAC(RECIPE_EXECUTION_SECRET, accountId)` prevents cross-tenant workflow calls
- **EDGE-CASE-015** `/onboarding` redirect allows access when `ghl_provisioning_status === 'failed'` (user not trapped)
- **EDGE-CASE-019/020** Middleware catches Supabase and DB failures gracefully, lets request through

## Edge cases for manual QA day-of

1. Signup, confirm email, step 1 submit, network error on step 2 save, refresh → resumes with step 1 data intact
2. User at step 6 back-navigates to step 1 then forward → data from steps 2–6 persists
3. Provisioning step 3 fails → user clicks Retry → resume-from-step-3 works (only works after EDGE-CASE-008 fix)
4. Two browsers signup same business name → both allowed, accounts isolated
5. Trial expires at midnight UTC, user in PT → middleware uses server now() (correct)
6. User pauses mid-wizard for 2 hours → Page.tsx refetches `onboarding_step` and resumes
7. Provision called twice rapidly → second returns 409 (in_progress check at route.ts:57)
8. Inngest down → status endpoint 500 → repair cron reconciles stuck activations
9. GHL location creation OK, token exchange fails → `failProvisioning("store_credentials", err)` → Retry skips step 1, re-runs step 2 (only works after EDGE-CASE-010 idempotency fix)
10. Password reset with stale session → reset-password checks sessionReady, updates password, redirects to /login
11. Business name 99 chars (max) — persisted intact
12. Phone "+1-555-1234" — min(10) passes, verify GHL normalization downstream
13. Custom business hours 10PM–2AM (spans midnight) — verify `mapCustomBusinessHours` output
14. n8n workflow creation OK, activation fails → activation row marked `error`, cron retries
15. Concurrent `/api/onboarding/provision` → only one Inngest job enqueued
16. Webhook secret generation on first GHL webhook registration — persists via `ensureWebhookSecret`

## Recommendation

**Do not ship** until the 3 blockers above are resolved. Total fix scope: ~1 day.

1. Add migration: `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS provisioning_step INTEGER DEFAULT 0;`
2. Rename `onboarding_done_at` → `onboarding_completed_at` in login.tsx:71 and session.ts:16 (or add alias)
3. Add `idempotencyKey: (event) => event.data.accountId` to `provisionCustomerFn` in `lib/inngest/functions.ts`
