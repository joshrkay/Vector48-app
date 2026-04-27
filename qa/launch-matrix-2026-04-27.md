# Vector48 Launch QA Matrix — Re-audit @ branch HEAD (2026-04-27)

Re-ran the historical blocker set from:
- `qa/launch-matrix.md` (run dated 2026-04-23)
- `qa/audits/A1-A2-A3-auth-onboarding-provisioning.md`
- `qa/audits/A4-recipes.md`
- `qa/audits/A5-A6-ghl.md`
- `qa/audits/A7-crm-ui.md`
- `qa/audits/A8-A9-billing-security.md`

Method: static code audit of current branch head, verifying each original blocker against current implementation and migrations.

---

## Executive summary

- Historical blockers reviewed: **16**
- **Fixed:** 10
- **Partially fixed:** 2
- **Still open:** 4
- **True blocker count (remaining before launch): 6**  
  (4 still-open + 2 partially-fixed that still leave launch risk)

**Current launch verdict:** 🔴 **NO-GO** until all 6 remaining blockers are closed.

---

## Historical blocker status (2026-04-27)

| # | Historical blocker | Status | Evidence @ HEAD |
|---|---|---|---|
| 1 | Spend-cap race condition (non-atomic read-then-enforce) | **still open** | `enforceSpendCap` still does read (`getMonthlySpendMicros`) then compare with no reservation/transaction path; tracked client checks cap before usage write. (`lib/recipes/runner/spendCap.ts`, `lib/recipes/runner/trackedClient.ts`) |
| 2 | GHL credentials crash in `buildRecipeContext` | **still open** | Missing creds path still throws hard error (`throw new Error("No GHL credentials...")`) rather than graceful skip outcome. (`lib/recipes/runner/context.ts`) |
| 3 | Missing pause-for-contact enforcement in runner webhook path | **still open** | No `paused_contact_ids` check in webhook handler/runner path; paused-contact logic exists only in pause/resume/check-sequence API helpers, not in webhook execution path. (`lib/recipes/runner/webhookHandler.ts`, `app/api/recipes/execution/check-sequence/route.ts`) |
| 4 | Missing archetypes for Agent SDK-activated recipes | **partially fixed** | Archetype registry now includes `lead-qualification`, but registry still only contains 6 slugs while catalog has additional active slugs (e.g. `new-lead-instant-response`, `google-review-booster`, `tech-on-the-way`, etc.). (`lib/recipes/runner/archetypes.ts`, `lib/recipes/catalog.ts`) |
| 5 | SEC-GHL-002 unsigned-test bypass lacks production guard | **fixed** | Explicit production hard-stop present before unsigned bypass logic. (`app/api/webhooks/ghl/signatureVerification.ts`) |
| 6 | `onboarding_done_at` vs `onboarding_completed_at` mismatch | **fixed** | Login/session selectors now use `onboarding_completed_at`. (`app/(auth)/login/page.tsx`, `lib/data/session.ts`) |
| 7 | Missing `provisioning_step` column migration | **fixed** | Dedicated migration adds `provisioning_step` column. (`supabase/migrations/00003_provisioning_step.sql`) |
| 8 | Inngest provisioning idempotency missing | **fixed** | Function now configured with idempotency on `event.data.accountId`. (`lib/inngest/functions.ts`) |
| 9 | `/api/ghl/contacts` GET lacked try/catch | **fixed** | GET wraps `getContacts` in try/catch and returns 502 fallback payload on error. (`app/api/ghl/contacts/route.ts`) |
| 10 | Contacts shell hid GHL unavailable banner reason | **fixed** | Server page computes and passes `ghlUnavailableReason` to `ContactsClientShell`. (`app/(app)/crm/contacts/page.tsx`) |
| 11 | Reports page lacked try/catch around data load | **fixed** | `getReportData` now wrapped in try/catch with user-facing fallback message. (`app/(app)/crm/reports/page.tsx`) |
| 12 | BILL-004 trial-gating absent on high-cost endpoints | **still open** | Endpoints remain auth-gated but not trial-expiry/subscription-gated (`trigger-manual`, `voice-agent`, `estimate-audit`); activate route has plan-limit checks but no trial-expiry enforcement. (`app/api/recipes/trigger-manual/route.ts`, `app/api/ghl/voice-agent/route.ts`, `app/api/recipes/estimate-audit/route.ts`, `app/api/recipes/activate/route.ts`, `lib/recipes/activationValidator.ts`) |
| 13 | SEC-017 `/api/recipes/status` account info leak | **fixed** | Route now requires authenticated session and enforces `session.accountId === account_id` before data fetch. (`app/api/recipes/status/route.ts`) |
| 14 | BILL-007 `trial_ends_at` not cleared on checkout completion | **fixed** | Stripe checkout completion update now explicitly sets `trial_ends_at: null`. (`app/api/webhooks/stripe/route.ts`) |
| 15 | CRON-004 infinite retry loop for `recipe_triggers` | **partially fixed** | Cron now caps processing via `MAX_ATTEMPTS=3` and `.lt("attempt_count", MAX_ATTEMPTS)`, but no schema-level `max_attempts` column/config as originally proposed. (`app/api/cron/recipe-triggers/route.ts`, `lib/supabase/types.ts`) |
| 16 | SEC-007 prompt injection risk in voice-agent system prompt | **fixed** | Added `sanitizeForPrompt` and routed prompt/greeting generation through sanitized values. (`lib/ghl/voiceAgent.ts`) |

---

## Remaining blocker queue (owner + ETA)

> ETA assumes immediate pickup on 2026-04-27.

| Blocker | Status | Owner | ETA | Done definition |
|---|---|---|---|---|
| #1 Spend-cap race condition | still open | Backend Platform | **1 day** | Atomic reservation or transactional pre-authorization implemented; concurrent trigger test proves cap cannot be exceeded by race. |
| #2 `buildRecipeContext` hard crash when GHL creds missing | still open | Recipes Runtime | **0.5 day** | Missing creds returns structured skip outcome (`skipped_no_ghl_creds`) and does not 500 webhook route. |
| #3 Pause-for-contact not enforced in runner path | still open | Recipes Runtime | **0.5 day** | Runner checks `recipe_activations.config.paused_contact_ids` before handler invocation and returns paused outcome. |
| #4 Missing archetypes (partial) | partially fixed | AI Agents / Recipes | **1 day** | All launch-enabled slugs have archetypes or activation route explicitly blocks non-archetyped slugs with clear 4xx + UI message. |
| #12 Trial-gating absent on cost-heavy endpoints | still open | Billing + API | **1 day** | Shared `requireActiveSubscription` (or equivalent) applied to trigger-manual, activate, voice-agent, estimate-audit; expired-trial test cases return 402/403. |
| #15 Retry loop mitigation incomplete (partial) | partially fixed | Backend Platform | **0.5 day** | Retry policy moved to schema/config (`max_attempts`) or equivalent durable control; migration + cron logic + tests updated. |

---

## Launch day go/no-go decision criteria (explicit)

### ✅ GO only if all are true
1. **Blocker count = 0 unresolved** (no still-open, no partially-fixed blockers from table above).
2. **BILL-004 gate is active** on all high-cost mutation endpoints (`trigger-manual`, `activate`, `voice-agent`, `estimate-audit`) with test evidence.
3. **Recipes runtime safety gates active**:
   - spend-cap race closed with concurrency proof,
   - paused-contact check enforced in runner path,
   - missing GHL creds handled gracefully.
4. **Archetype coverage is complete or safely gated** for all launch-enabled recipe slugs.
5. **Cron retry behavior is bounded and durable** (policy represented in schema/config + runtime).

### ❌ NO-GO if any are true
- Any of blockers #1, #2, #3, #12 remain open.
- Blocker #4 or #15 remains partial without explicit launch waiver signed by Eng + Product + Security.
- No automated or reproducible test evidence exists for the above controls.

---

## Notes

- This re-audit intentionally tracks **historical blockers only** (regression/closure pass), not a net-new full discovery sweep.
- Recommendation: after fixing the 6 remaining blockers, run one quick regression audit pass and update this file to a GO matrix for launch-day use.
