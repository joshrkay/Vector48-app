# A8 + A9 — Billing + Security + Perf + Cross-cutting Audit

**Agents**: A8 Billing + A9 Cross-cutting (security, perf, cron, observability)
**Scope**: Trial gates, Stripe checkout/portal/webhooks, RLS, CSRF, CSP, cron jobs, spend cap logging
**Status**: 🔴 **5 blockers — money/data risks**

## Summary

Stripe integration is solid (signature verification, event dedup via PRIMARY KEY, portal/cancel wiring). RLS is properly applied across every public table via `get_account_ids_for_user()`. Cron authenticates with `CRON_SECRET`. **Five critical gaps will cost money or leak data**: expired trials can call API endpoints, `/api/recipes/status` exposes any account's activations unauthenticated, `trial_ends_at` not cleared after upgrade, recipe triggers retry forever on permanent failures, and businessName is interpolated into Claude system prompts without sanitization.

## 🔴 Blockers (must fix pre-launch)

### BILL-004: Trial gating absent on API endpoints (CRITICAL)
Middleware redirects expired-trial UI to `/billing`, but `/api/recipes/trigger-manual`, `/api/recipes/activate`, `/api/ghl/voice-agent`, `/api/recipes/estimate-audit` all skip the check. Expired users can keep firing recipes (burning Claude budget on your dime).
**Fix**: add a `requireActiveSubscription(session)` helper in `lib/auth/account.ts` that throws on `plan_slug='trial' && trial_ends_at < now()`, call from every mutating recipe API route.

### SEC-017: `/api/recipes/status?account_id=X` leaks activation data (CRITICAL)
No auth check on accountId query param. Any user (or anon) can query any account's recipes.
**Fix**: wrap handler with `requireAccountForUser()`, require the session account to match or be a member of the requested accountId.

### BILL-007: `trial_ends_at` not cleared on `checkout.session.completed`
Webhook at `/app/api/webhooks/stripe/route.ts:71-78` updates `plan_slug` and `stripe_subscription_id` but leaves `trial_ends_at` stale (past). Downstream `daysRemaining` becomes negative; trial banners flicker.
**Fix**: add `trial_ends_at: null` (or `trial_ended_at: now()`) to the UPDATE payload.

### CRON-004: `recipe_triggers` retry forever (CRITICAL)
`/app/api/cron/recipe-triggers/route.ts` has no `max_attempts` field or check. A trigger with a permanent error (bad n8n URL, deleted contact) is re-processed every cycle forever.
**Fix**: add column `max_attempts INT DEFAULT 3`, check `attempt_count >= max_attempts` in the claim query, mark as `permanently_failed` when exhausted.

### SEC-007: Prompt injection via `businessName` in voiceAgent prompt
`/lib/ghl/voiceAgent.ts:40-53` builds system prompt with `` `You are an AI phone assistant for ${businessName}.` ``. Crafted business names can jailbreak.
**Fix**: either sanitize/escape businessName before interpolation OR pass business context as a separate user message field rather than baking into system prompt.

## 🟠 Majors

- **BILL-013**: No retroactive enforcement on downgrade. User with 50 active recipes on Growth downgrades to Starter (3-limit) — recipes keep running. Fix: on `customer.subscription.deleted` webhook, deactivate excess beyond new plan's `max_active_recipes`.
- **SEC-013/014**: Missing security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options). Add in middleware or Next 16 `headers()` config.
- **SEC-011/012**: No rate limiting on signup or password reset. Add Upstash-backed limiter keyed by IP (signup) and email (reset).
- **BILL-014**: `getTierConfig()` 60s cache not invalidated on plan upgrade. User on upgraded plan still runs old rate-limit budget for up to 60s. Invalidate in Stripe webhook.
- **OBS-004**: Spend cap exceeded errors not logged with structured context (accountId, agentId, amount). Hard to debug.
- **SEC-016**: Missing `CRON_SECRET` causes 503 at runtime instead of boot-time failure. Add to env health check.

## Matrix (56 rows)

| Area | Pass | Missing/Partial | Fail | Notes |
|------|-----:|---------------:|-----:|-------|
| Billing (BILL-*) | 10 | 3 | 2 | BILL-004, BILL-007 ship-blocking |
| Security (SEC-*) | 12 | 5 | 1 | SEC-007, SEC-017 ship-blocking; headers + rate limits needed |
| Cron (CRON-*) | 5 | 0 | 1 | CRON-004 infinite retry |
| Observability (OBS-*) | 4 | 3 | 0 | Spend-cap log, GHL refresh log gaps |
| Performance (PERF-*) | 0 | 7 | 0 | No live measurements — add Vercel Analytics + SLOs post-launch |

Key passing rows:
- BILL-002/003 trial expiry UI redirect works
- BILL-006 checkout session creation correct
- BILL-008/009/010 Stripe webhook cancel + signature + replay dedup work
- BILL-011/012 invoice listing and billing portal work
- SEC-001..006 RLS, service role, CSRF (Next 16 default), XSS, SQL-injection all clean
- SEC-008 webhook signature verification over raw body
- SEC-009/010 Anthropic + GHL tokens never leaked client-side or logged
- SEC-015 session cookie defaults (via `@supabase/ssr`)
- SEC-017 cross-tenant session scoping via `account_users` join
- SEC-018 `add_paused_contact_id` / `remove_paused_contact_id` SECURITY DEFINER atomic
- CRON-002/003/005/006 CRON_SECRET, failure marking, repair cron work
- OBS-001 `llm_usage_events` row per Claude call

## Edge cases for manual QA day-of

- Expired trial UI redirects OK, but `curl` the recipe API as that user — should now 402 (needs BILL-004 fix)
- Anonymous `curl /api/recipes/status?account_id=<anyone>` — should now 401 (needs SEC-017 fix)
- Upgrade from trial via Stripe test clock — verify `trial_ends_at` cleared after (needs BILL-007 fix)
- Deliberately break an n8n webhook URL for one recipe → fire 100 triggers → verify attempts cap (needs CRON-004 fix)
- Register a business name containing "IGNORE PREVIOUS INSTRUCTIONS" — verify voice agent system prompt is not jailbroken (needs SEC-007 fix)
- Downgrade Growth → Starter with 5 active recipes → verify excess deactivated (needs BILL-013)
- Signup 20 times from the same IP → verify rate limit kicks in (needs SEC-011)
- Fresh browser → check security headers in network tab (needs SEC-013/014)
- Upgrade plan → fire GHL calls in rapid succession → confirm new rate-limit budget applies within 60s (BILL-014)

## Recommendation

**Do not ship** until the 5 blockers above are fixed. Total estimated work: 4–6 hours. Majors can follow post-launch with release-note acknowledgements except for security headers and rate limits — those should land in the same patch.
