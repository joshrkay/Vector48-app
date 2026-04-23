# A4 — Recipes Audit

**Agent**: A4 Recipes
**Scope**: All 16 recipe slugs (activation, execution, spend cap, pause, edge cases)
**Status**: 🔴 **DO NOT SHIP — 4 critical cross-cutting bugs**

## Summary

All 16 recipes are architecturally registered in `RECIPE_HANDLERS`, but **only 6 have Agent SDK archetypes** (ai-phone-answering, missed-call-text-back, review-request, estimate-follow-up, appointment-reminder, lead-qualification). The 10 remaining recipes have handlers but no archetype entry — they cannot be activated via the Agent-SDK flow. The 7 newer SMS-factory recipes are thin but auditable; the 9 older recipes have scattered null-check and error-handling gaps that will fail in production.

Four bugs affect every single recipe. Fix these before shipping.

## 🔴 Critical cross-cutting bugs (affect all 16 recipes)

### BUG-1: Spend-cap race condition (`spendCap.ts:115-127`, `trackedClient.ts:89-98`)
`getMonthlySpendMicros()` reads current spend → `enforceSpendCap()` compares → Claude call. Non-atomic. Two concurrent triggers both read the same spend value and both pass, causing budget overage. **Fix**: either `SELECT … FOR UPDATE` with a reservation row, atomic `INSERT … ON CONFLICT` accumulator, or accept the race and add a cost headroom comparison `(spent + estimated_cost > cap * 0.95)`.

### BUG-2: GHL credential crash path (`context.ts:162-164`)
`buildRecipeContext` throws when `getAccountGhlCredentials(accountId)` returns null. Every handler calls the context builder. **Result**: every recipe trigger for an account without a GHL connection crashes with an uncaught exception. **Fix**: context builder should return a graceful "no GHL" state or skip handler invocation with a logged `recipe_runs.outcome='skipped_no_ghl_creds'`.

### BUG-3: Missing pause-for-contact check (webhookHandler.ts — missing entirely)
No handler checks the pause state before firing. Operator can pause automation for a contact but triggers still fire, double-SMSing the customer. **Fix**: Before `runRecipe`, look up the contact in `recipe_activations.config.paused_contact_ids` (or equivalent table) and skip if present.

### BUG-4: Missing archetypes for 10 recipes (`archetypes.ts:47-54`)
Handlers registered in `index.ts:100-117` but no archetype entries. Affected: new-lead-instant-response, lead-qualification, google-review-booster, tech-on-the-way, post-job-upsell, customer-reactivation, maintenance-plan-enrollment, seasonal-demand-outreach, unsold-estimate-reactivation, weather-event-outreach, seasonal-campaign. **Fix**: add archetype entries or mark these recipes as GHL-native-only and gate activation accordingly.

## Additional cross-cutting bugs

5. **Silent SMS send failures** (all handlers): `sendSms` catches errors and returns `messageId: null` without logging. Callers see the success outcome but no SMS was sent. Distinguish `success_not_sent` outcome or log failures.
6. **`callback.ts` imports `processSideEffects`**: Tight coupling between new callback layer and webhook side effects. Works today, fragile.
7. **SMS factory config loader silently returns null** (`_smsHandler.ts:140-161`): Can't distinguish "config missing" from "DB error". Propagate error types.
8. **`triggerId` never logged**: `RecipeContext.triggerId` is populated but handlers don't log it. Support cannot correlate failures to trigger rows.
9. **Prompt injection risk**: User-supplied config (`businessName`, template messages, `contact.firstName`) interpolated into Claude prompts unescaped. Sanitize before embedding.
10. **"Customer" fallback hides data quality** (all handlers): When `firstName` and `name` both null, defaults silently to "Customer". Log as data-quality signal.

## Per-recipe matrix (key scenarios)

| testId | recipe | scenario | status | severity | file:line |
|--------|--------|----------|--------|----------|-----------|
| RCP-AI-PA-007 | ai-phone-answering | No GHL creds | 🔴 crash | high | context.ts:162-164 |
| RCP-AI-PA-010 | ai-phone-answering | Spend cap exceeded | ✅ short-circuits | - | trackedClient.ts:89-98 |
| RCP-AI-PA-012 | ai-phone-answering | Paused-for-contact | 🔴 no check | high | webhookHandler.ts (missing) |
| RCP-AI-PA-013 | ai-phone-answering | Concurrent triggers | 🔴 race | critical | spendCap.ts:76-109 |
| RCP-MCTB-006 | missed-call-text-back | Happy path fire | ✅ passes | - | missedCallTextBack.ts:76-172 |
| RCP-MCTB-007 | missed-call-text-back | No GHL creds | 🔴 crash | high | context.ts:162-164 |
| RCP-MCTB-012 | missed-call-text-back | Paused-for-contact | 🔴 no check | high | webhookHandler.ts (missing) |
| RCP-RR-006 | review-request | Happy path | ✅ passes | - | reviewRequest.ts:67-151 |
| RCP-RR-008 | review-request | No phone | ✅ `skipped_no_contact` | - | reviewRequest.ts:131-135 |
| RCP-EFU-006 | estimate-follow-up | Happy path | ✅ passes | - | estimateFollowUp.ts:71-169 |
| RCP-EFU-008 | estimate-follow-up | No phone on opp.contact | ✅ skipped | - | estimateFollowUp.ts:147-153 |
| RCP-AR-006 | appointment-reminder | Happy path | ✅ passes | - | appointmentReminder.ts:75-178 |
| RCP-AR-008 | appointment-reminder | No phone | ✅ skipped | - | appointmentReminder.ts:156-163 |
| RCP-NLR-001 | new-lead-instant-response | Activate | 🔴 no archetype | critical | archetypes.ts (missing) |
| RCP-LQ-001 | lead-qualification | Activate | ⚠️ handler uses factory but archetype present | - | archetypes.ts:53 |
| RCP-GRB-001 | google-review-booster | Activate via Agent SDK | 🔴 no archetype | critical | archetypes.ts (missing) |
| RCP-TOW-001 | tech-on-the-way | Activate via Agent SDK | 🔴 no archetype | critical | archetypes.ts (missing) |
| RCP-PJU-001 | post-job-upsell | Activate via Agent SDK | 🔴 no archetype | critical | archetypes.ts (missing) |
| RCP-CR-001 | customer-reactivation | Activate via Agent SDK | 🔴 no archetype | critical | archetypes.ts (missing) |
| RCP-MPE-001 | maintenance-plan-enrollment | Activate via Agent SDK | 🔴 no archetype | critical | archetypes.ts (missing) |
| RCP-SDO-001 | seasonal-demand-outreach | Activate via Agent SDK | 🔴 no archetype | critical | archetypes.ts (missing) |
| RCP-UER-001 | unsold-estimate-reactivation | Activate via Agent SDK | 🔴 no archetype | critical | archetypes.ts (missing) |
| RCP-WEO-001 | weather-event-outreach | Activate via Agent SDK | 🔴 no archetype | critical | archetypes.ts (missing) |
| RCP-SC-001 | seasonal-campaign | Activate via Agent SDK | 🔴 no archetype + catalog says coming_soon | critical | archetypes.ts, catalog.ts:52 |

*(Full 100-row matrix compiled into `/qa/launch-matrix.md` after all agents report.)*

## Edge cases for manual QA day-of

1. **Spend-cap boundary**: fire 100 recipes 1s apart with $1 cap — if >3 pass, race confirmed.
2. **Mid-flight credential revocation**: activate recipe, revoke GHL OAuth, fire trigger — expect graceful log, currently crashes.
3. **Contact with no first name or phone** — expect skipped outcome, not crash.
4. **5 concurrent identical triggers** — confirm idempotency or lack thereof.
5. **Pause then trigger** — verify skip after pause API lands.
6. **Activation config corruption** — manually break JSON, fire trigger, expect graceful skip.
7. **Review-request null reviewLink** — `skipped_no_review_link` outcome.
8. **estimate-follow-up opportunity status race** — opp transitions mid-flight.
9. **lead-qualification tag write failure** — SMS still sends.
10. **Prompt token overage** — very long firstName + long template, expect `skipped_no_message`.

## Recommendation

**Do not ship this week** unless BUG-1 through BUG-4 are resolved. Target: 2–3 days of work, then full load test under concurrent high-volume triggers before launch.
