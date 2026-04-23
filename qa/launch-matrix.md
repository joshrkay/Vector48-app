# Vector48 Launch QA Matrix

Compiled by `scripts/qa-compile-matrix.mjs` from `qa/runs/<runId>/results.ndjson`. Rows below are the scaffolded test-ID plan; each cell is populated by QA agents A1..A9 during a run.

Severity levels: `blocker` / `major` / `minor` / `cosmetic`. Status: `pass` / `fail` / `blocked` / `skip`.

Launch gate: 0 blockers → ship; 0 blockers + ≤5 majors with documented workarounds → ship with release notes; any blocker → no ship.

---

## Phase progression

| Agent | Scope | Test IDs | Count | Owner | Status |
|-------|-------|----------|------:|-------|--------|
| A1 | Auth (signup, login, reset, session, triggers) | `AUTH-*` | 15 | auth | pending |
| A2 | Onboarding (8 steps × {valid, invalid, resume, skip, back}) | `ONB-*` | 24 | onboarding | pending |
| A3 | Provisioning (6 GHL steps + n8n + repair) | `PROV-GHL-*`, `PROV-N8N-*` | 26 | provisioning | pending |
| A4 | Recipes (16 × {activate, trigger, deactivate, spend-cap}) | `RCP-<SLUG>-*` | 64 | recipes | pending |
| A5 | GHL inbound (9 events × {valid, bad-sig, replay, malformed}) | `WH-*` | 36 | webhooks | pending |
| A6 | GHL outbound (retry, rate-limit, token refresh, resources) | `GHL-OUT-*` | 18 | ghl | pending |
| A7 | Dashboard + CRM + Settings | `DASH-*`, `CRM-*`, `SET-*` | 36 | ui | pending |
| A8 | Billing / trial | `BILL-*` | 10 | billing | pending |
| A9 | Cross-cutting (RLS, security, perf, golden paths) | `CRON-*`, `SEC-*`, `PERF-*`, `E2E-*` | 19 | security | pending |
| — | **TOTAL** | | **248** | — | — |

---

## Golden paths (must pass before ship)

| ID | Scenario | Owner | Status |
|----|----------|-------|--------|
| E2E-1 | Signup → email confirm → 8-step onboarding → provisioning complete → dashboard → fire fixture CallStatusUpdate → activity + SMS | recipes | pending |
| E2E-2 | Callback-needed flow (3 sources: NoteCreate webhook, UI button, Voice AI transcript) | recipes | **IMPLEMENTED** — spec lives at `e2e/golden/e2e-2-callback-needed.spec.ts` |
| E2E-3 | Multi-tenant isolation (A webhook never writes to B; RLS rejects cross-read) | security | pending |
| E2E-4 | Trial expiry → redirect to `/billing` + 402 on recipe endpoints | billing | pending |
| E2E-5 | Spend cap enforcement short-circuits before Anthropic call | recipes | pending |
| E2E-6 | Webhook signature + replay + stale-timestamp rejection, dedup idempotent | webhooks | pending |
| E2E-7 | All 16 recipes activate, fire, complete | recipes | **UNBLOCKED** — 7 missing handlers landed (see Phase 1B) |
| E2E-8 | Pause-for-contact / resume-for-contact blocks & unblocks triggers | recipes | pending |
| E2E-9 | OAuth token refresh auto-recovers; revoked token surfaces reconnect banner | ghl | pending |

---

## Known gaps and closure status

| Gap | Severity | Resolution |
|-----|----------|-----------|
| Callback-needed flow (no code path day-1) | Blocker | **closed** — `lib/recipes/callback.ts`, `lib/ghl/webhookSideEffects.ts` detectCallbackFromNote, `/api/ghl/contacts/[id]/callback` route, CallbackNeeded mapping in eventMapping.ts |
| NoteCreate + TagUpdate not in dispatcher | Blocker | **closed** — added to `SUPPORTED_EVENT_TYPES` in `lib/ghl/webhookParser.ts` and typed in `lib/ghl/webhookTypes.ts` |
| 7 recipe handlers missing from RECIPE_HANDLERS | Blocker | **closed** — added customer-reactivation, maintenance-plan-enrollment, seasonal-demand-outreach, unsold-estimate-reactivation, weather-event-outreach, seasonal-campaign, lead-qualification via shared `_smsHandler.ts` factory |
| Webhook dedup DB guarantee | Blocker | **verified** — unique index `idx_automation_events_ghl_dedup ON automation_events(account_id, ghl_event_id) WHERE ghl_event_id IS NOT NULL` exists at `supabase/migrations/001_initial_schema.sql:169` |
| Thin Playwright coverage on signup/onboarding/billing | Major | pending — E2E-1, E2E-3..E2E-9 specs to be added in a follow-up batch |
| n8n orchestration untested | Major | pending — A3 fixtures |
| Stripe webhook test clock | Major | pending — A8 wires `stripe trigger` CLI |
| Spend cap concurrency | Minor | pending — A4 concurrency test |

---

## NDJSON result schema (one line per test case)

```json
{"runId":"<ISO>","agent":"A5","testId":"WH-CALLCOMP-001","area":"GHL-In","surface":"POST /api/webhooks/ghl","preconditions":"...","steps":["..."],"expected":"...","actual":"...","status":"pass|fail|blocked|skip","severity":"blocker|major|minor|cosmetic","owner":"<handle>","reproNotes":"...","linkedIssue":null,"artifacts":["..."]}
```

Runs are compiled by `scripts/qa-compile-matrix.mjs --run=<runId>`.
