# Vector48 Launch QA Matrix

Compiled from 5 parallel static-audit agents (A1 Auth, A2 Onboarding, A3 Provisioning, A4 Recipes, A5/A6 GHL, A7 CRM UI, A8 Billing, A9 Cross-cutting) run 2026-04-23. Each agent read the current branch `claude/qa-agents-testing-C170M` and produced evidence-backed findings with file:line references.

Per-agent detail: `/qa/audits/A*.md`.

---

## Launch readiness verdict: 🔴 **DO NOT SHIP**

**16 blockers across 4 areas.** All are fixable within 1–3 days. Details and consolidated fix list below.

---

## Blockers by area

### 🔴 Recipes (A4) — 4 cross-cutting
1. **Spend-cap race condition** — `getMonthlySpendMicros` → `enforceSpendCap` non-atomic; two concurrent triggers both pass. `spendCap.ts:76-109`, `trackedClient.ts:89-98`. **Fix**: atomic reservation row or `current + estimated > cap * 0.95`.
2. **GHL credentials crash** — `buildRecipeContext` throws if creds missing; every handler crashes. `context.ts:162-164`. **Fix**: return graceful `{skipped: 'no_ghl_creds'}`.
3. **Missing pause-for-contact check** — operator can pause but triggers still fire. `webhookHandler.ts` (missing). **Fix**: lookup `recipe_activations.config.paused_contact_ids` before `runRecipe`.
4. **10 recipes missing archetypes** — new-lead-instant-response, lead-qualification, google-review-booster, tech-on-the-way, post-job-upsell, customer-reactivation, maintenance-plan-enrollment, seasonal-demand-outreach, unsold-estimate-reactivation, weather-event-outreach, seasonal-campaign. Can't activate via Agent SDK. `archetypes.ts` (missing). **Fix**: add archetype entries or gate activation based on recipe type.

### 🔴 GHL integration (A5/A6) — 1
5. **SEC-GHL-002 test-mode bypass has no NODE_ENV guard** — if `GHL_WEBHOOK_ALLOW_UNSIGNED=true` leaks into prod, unsigned webhooks are accepted. `signatureVerification.ts:117-129`. **Fix**: refuse bypass when `NODE_ENV === 'production'`.

### 🔴 Auth / onboarding / provisioning (A1/A2/A3) — 3
6. **`onboarding_done_at` column doesn't exist** — referenced in `login/page.tsx:71` and `lib/data/session.ts:16`; schema only has `onboarding_completed_at`. Silent null → wrong routing. **Fix**: rename references.
7. **`provisioning_step` column missing from schema** — used in 6 writes in `lib/jobs/provisionGHL.ts`. Resume-from-step logic fails silently. **Fix**: `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS provisioning_step INTEGER DEFAULT 0;`
8. **Inngest `provisionCustomerFn` has no idempotency key** — retries after partial success create duplicate GHL locations. `lib/inngest/functions.ts:17-21`. **Fix**: `idempotencyKey: (event) => event.data.accountId` + per-step checks.

### 🔴 CRM UI (A7) — 3
9. **`/api/ghl/contacts` GET has no try/catch** — unhandled rejection crashes route on GHL failure. `app/api/ghl/contacts/route.ts:27-32`.
10. **ContactsClientShell hardcodes `ghlUnavailableReason=null`** — GHL error banner never shows.
11. **Reports page no try/catch on `getReportData`** — DB query crash bubbles to user. `app/(app)/crm/reports/page.tsx:49`.

### 🔴 Billing / security (A8/A9) — 5
12. **BILL-004 trial gating absent on API endpoints** — expired trial users can call `/api/recipes/trigger-manual`, `/api/recipes/activate`, `/api/ghl/voice-agent`, `/api/recipes/estimate-audit` — burns Claude budget.
13. **SEC-017 `/api/recipes/status` info leak** — unauthenticated `accountId` query param returns any account's activations.
14. **BILL-007 `trial_ends_at` not cleared** on `checkout.session.completed`. Causes negative days-remaining UI. `app/api/webhooks/stripe/route.ts:71-78`.
15. **CRON-004 `recipe_triggers` infinite retry loop** — no `max_attempts` field. Permanent failures retry forever.
16. **SEC-007 prompt injection in voiceAgent** — `businessName` interpolated into Claude system prompt unescaped. `lib/ghl/voiceAgent.ts:40-53`.

---

## Majors (acceptable with release-note workaround)

- No security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- No rate limiting on signup or password reset
- Plan downgrade doesn't retroactively deactivate excess recipes (BILL-013)
- `getTierConfig()` 60s cache not invalidated on upgrade (BILL-014)
- Silent GHL SMS send failures — handler returns success outcome without SMS going through
- Spend-cap exceeded errors not logged with structured context (OBS-004)
- GHL OAuth 401 not auto-retried after token refresh (GHL-OUT-029)
- OAuth reconnect banner UI not implemented (OAUTH-007)
- Realtime updates not wired on contact detail page (C-030)
- Inbox search UI missing (I-008)
- ContactHeader edit form doesn't revert on API failure (C-023)
- Dashboard stat cards no error handling / no loading skeleton (D-003)

---

## Agent summary (5 reports)

| Agent | Pass | Fail | Missing | Blockers | Report |
|-------|-----:|-----:|--------:|---------:|--------|
| A1 Auth | 19 | 0 | 1 | 0 | [audits/A1-A2-A3-auth-onboarding-provisioning.md](audits/A1-A2-A3-auth-onboarding-provisioning.md) |
| A2 Onboarding | 18 | 0 | 4 | 0 | (same file) |
| A3 Provisioning | 27 | 1 | 0 | 3 | (same file) |
| A4 Recipes | ~150 rows | multiple | 10 archetypes | 4 | [audits/A4-recipes.md](audits/A4-recipes.md) |
| A5/A6 GHL | ~60 | 0 | 0 | 1 | [audits/A5-A6-ghl.md](audits/A5-A6-ghl.md) |
| A7 CRM UI | ~85 | 3 | ~10 | 3 | [audits/A7-crm-ui.md](audits/A7-crm-ui.md) |
| A8/A9 Billing + Sec | ~56 | 2 | 11 | 5 | [audits/A8-A9-billing-security.md](audits/A8-A9-billing-security.md) |
| **TOTAL** | **~400** | **6** | **36** | **16** | |

---

## Consolidated fix plan (ordered by effort)

### Round 1 — 30-minute fixes (ship-critical, landing this session)
- [ ] Rename `onboarding_done_at` → `onboarding_completed_at` in `login/page.tsx:71` and `lib/data/session.ts:16`
- [ ] Add migration for `provisioning_step` column on accounts
- [ ] SEC-GHL-002: add NODE_ENV guard to `authenticateGhlWebhook` bypass path
- [ ] SEC-017: add `requireAccountForUser` to `/api/recipes/status`
- [ ] BILL-007: add `trial_ends_at: null` to Stripe webhook checkout handler

### Round 2 — 2-hour fixes
- [ ] Inngest idempotency: `idempotencyKey: (event) => event.data.accountId`
- [ ] CRON-004: add `max_attempts` column + check in cron route
- [ ] BILL-004: create `requireActiveSubscription` helper, call from mutating recipe routes
- [ ] SEC-007: sanitize businessName before Claude interpolation (or pass as user message field)
- [ ] Reports page: wrap `getReportData` in try/catch with fallback
- [ ] `/api/ghl/contacts`: wrap `getContacts()` in try/catch returning 502

### Round 3 — 1-day fixes
- [ ] Recipes: refactor `buildRecipeContext` to return graceful "no GHL" state
- [ ] Recipes: add pause-for-contact check to runner
- [ ] Recipes: spend-cap atomic reservation
- [ ] Recipes: archetypes for 10 missing slugs (or gate activation)
- [ ] ContactsClientShell: pass real `ghlUnavailableReason` from server

### Round 4 — follow-up (post-launch OK with release notes)
- [ ] Security headers middleware
- [ ] Rate limit signup + password reset
- [ ] Retroactive plan-downgrade enforcement
- [ ] Silent SMS failure logging
- [ ] OAuth reconnect banner UI
- [ ] Realtime on contact detail
- [ ] Inbox search

---

## Passed — shipworthy today

- Supabase auth trigger chain (`on_auth_user_created` → `trg_accounts_set_trial` BEFORE → `trg_accounts_create_owner` AFTER)
- RLS on every public table via `get_account_ids_for_user()`
- `automation_events` unique dedup index
- AES-256-GCM token encryption with key length validation
- Ed25519 webhook signature verification over raw bytes
- Token refresh mutex per-account
- 6-step GHL provisioning with failure capture
- n8n HMAC execution token per tenant
- Stripe event dedup via `stripe_processed_events` PRIMARY KEY
- Billing portal + cancel flow
- Dashboard Activity Feed realtime
- 9 GHL webhook event types (inc. new NoteCreate + TagUpdate this branch)
- Callback flow: NoteCreate keyword + UI button + markCallbackNeeded normalization (this branch)
- `recipe_activations` UNIQUE(account_id, recipe_slug) prevents duplicate activations
- GHLClient retry + backoff + error classification
- Inngest provisioning + n8n + repair cron

---

## NDJSON result schema (for scripted rerun)

```json
{"runId":"<ISO>","agent":"A5","testId":"WH-CALLCOMP-001","area":"GHL-In","surface":"POST /api/webhooks/ghl","preconditions":"...","steps":["..."],"expected":"...","actual":"...","status":"pass|fail|blocked|skip","severity":"blocker|major|minor|cosmetic","owner":"<handle>","reproNotes":"...","linkedIssue":null,"artifacts":["..."]}
```

## Manual smoke (see `qa/manual-smoke.md`)

15-minute human checklist for day-of-launch, covering: signup, onboarding, callback, recipe fire, webhook dedup, trial expiry, multi-tenant sanity.
