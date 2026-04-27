# Recipe & Agent Workflow Coverage Audit

**Branch:** `claude/evaluate-mcp-ghl-integration-g2GHu` (Phase 1 — GHL MCP transport + multi-turn lead-qualification)
**Generated:** 2026-04-27
**Authority:** unit tests + smoke harness output, not deployed-environment observation.

This audit answers two questions for each recipe:

1. **Code-correctness** — does the handler do what it should given a trigger? (proven by unit tests + smoke harness)
2. **Production wiring** — is there a code path from a real webhook/cron to the handler? (proven by reading routes)

Both must be ✓ for "working in production." Code-correctness without wiring means the recipe is dormant.

## Summary

| Layer | Status |
|---|---|
| Total recipes registered | 15 (10 agent-sdk, 5 ghl-native) |
| Handlers with unit-test coverage | 10 / 10 (agent-sdk) — every agent-sdk handler has tests |
| Handlers wired to a trigger source | 9 / 10 — `lead-qualification` is the gap |
| GHL-native recipes wired via cron | 5 / 5 |
| Unit-test cases run | 195 node:test + 132 vitest = 327 passing |
| End-to-end smoke harness | `qa/audits/lead-qualification-smoke.json` — 3/3 pass |
| Real GHL MCP integration | **Not yet exercised** — requires PIT install + probe-script run against a real location |
| Production deployment of this branch | **Not yet** — uncommitted to main; migrations 017+018 not applied |

## Agent SDK Recipes (10)

| Slug | Test cases | Trigger source | Wired? | Production-ready? |
|---|---:|---|:---:|:---:|
| `ai-phone-answering` | 5 | `CallCompleted` webhook → `/api/recipes/webhook/ai-phone-answering/[accountId]` | ✓ | ✓ |
| `missed-call-text-back` | 6 | `CallCompleted` (missed) → same route | ✓ | ✓ |
| `review-request` | 8 | `OpportunityStageUpdate` (won) → same route | ✓ | ✓ |
| `estimate-follow-up` | 7 | `OpportunityCreate` + no-reply timer → same route | ✓ | ✓ |
| `appointment-reminder` | 8 | `AppointmentCreate` + cron schedule | ✓ | ✓ |
| `new-lead-instant-response` | 7 | `ContactCreate` webhook → same route | ✓ | ✓ |
| `google-review-booster` | 5 | `OpportunityStageUpdate` + delay | ✓ | ✓ |
| `tech-on-the-way` | 4 | `AppointmentStatusUpdate` (en-route) | ✓ | ✓ |
| `post-job-upsell` | 4 | `OpportunityStageUpdate` (won) + delay | ✓ | ✓ |
| **`lead-qualification`** | **18** | `InboundMessage` webhook (planned) | **✗** | **✗ — handler complete, no caller** |

The wiring check reads `SUPPORTED_SLUGS` in `lib/recipes/runner/webhookHandler.ts:39`. Lead-qualification is NOT in that set; no cron path or webhook side-effect calls `runRecipe({recipeSlug: "lead-qualification"})` either. Adding it requires:

1. Append `"lead-qualification"` to `SUPPORTED_SLUGS`.
2. Configure GHL to deliver `InboundMessage` events to `/api/recipes/webhook/lead-qualification/[accountId]` for accounts that have the recipe activated.
3. Map the GHL `InboundMessage` payload shape to `LeadQualificationTrigger` in the handler dispatch (the existing `webhookHandler.ts` only maps `CallCompleted`).

This is a Phase 2 ticket, not a Phase 1 fix — but it's a hard blocker before any real lead can be qualified.

## GHL-Native Recipes (5) — direct SMS via GHL API, no AI

| Slug | Trigger source | Wired? |
|---|---|:---:|
| `seasonal-demand-outreach` | Cron + recipe_triggers queue | ✓ |
| `maintenance-plan-enrollment` | Cron + recipe_triggers queue | ✓ |
| `customer-reactivation` | Cron + recipe_triggers queue | ✓ |
| `unsold-estimate-reactivation` | Cron + recipe_triggers queue | ✓ |
| `weather-event-outreach` | External weather event + cron | ✓ |

All five route through `/api/cron/recipe-triggers` → `executeGhlNativeRecipe` (`lib/recipes/ghlExecutor.ts`, 14 unit tests covering this path). No Claude calls; just templated SMS via GHL.

## Phase 1 Infrastructure (new)

| Component | Tests | Verified |
|---|---:|:---:|
| `lib/ghl/mcp.ts` — MCP JSON-RPC client (PIT auth, JSON+SSE parsing) | 5 vitest | ✓ |
| `lib/ghl/token.ts` — PIT load/store helpers | (extension of existing token tests) | ✓ |
| `lib/recipes/runner/recipes/leadQualification.ts` — multi-turn handler | 18 node:test | ✓ |
| `scripts/probe-ghl-mcp.mjs` — operator probe of live GHL MCP | manual run | ⏳ awaiting PIT |
| `scripts/smoke-lead-qualification.mjs` — full handler trace | runs in CI | ✓ 3/3 pass |
| `supabase/migrations/017_ghl_pit.sql` | schema-validated | ⏳ not applied |
| `supabase/migrations/018_lead_qualification_tool_config_backfill.sql` | schema-validated | ⏳ not applied |

## Smoke Harness Output (Lead-Qualification)

Source: `qa/audits/lead-qualification-smoke.json`

| Scenario | Outcome | Iter | MCP calls | AI calls | Usage rows | Pass |
|---|---|---:|---:|---:|---:|:---:|
| Cold-start (no history) → send qualification SMS | `qualification_message_sent` | 2 | 2 (history pre-load + send) | 2 | 2 | ✓ |
| Mid-conversation (history loaded) → ask next question | `qualification_message_sent` | 2 | 2 | 2 | 2 | ✓ |
| Completion (4 facts) → create qualification task | `qualification_completed` | 2 | 2 (history + create-task) | 2 | 2 | ✓ |

The harness exercises the real handler with all four mapped tools exposed to Claude (`contacts_get-contact`, `contacts_create-task`, `calendars_get-calendar-events`, `conversations_send-a-new-message`) plus the history pre-load tool (`conversations_get-messages`). It confirms:

- Tool inventory is filtered correctly per the archetype's `enabledTools`.
- History pre-load fires for every scenario; merges into the message array as user/assistant turns.
- Tool-use loop runs to completion (`stop_reason=end_turn`), not max-iterations.
- `llm_usage_events` rows would be written for each Claude call (proves the tracked-client wrapper is invoked correctly).

## What this audit does NOT prove

1. **GHL MCP server reachability with a real PIT.** The probe script (`scripts/probe-ghl-mcp.mjs`) is the next step; takes ~15 seconds with a real PIT.
2. **End-to-end deployed flow.** Migrations 017+018 haven't been applied to staging or production. No PIT installed for any account. No real `InboundMessage` webhook delivered.
3. **Lead-qualification trigger wiring.** As called out above — no caller exists today. The harness uses a synthetic trigger that mirrors the planned shape.
4. **Browser/UI verification.** The recipe has no dedicated UI; its only user-visible artifacts are `automation_events` rows surfaced in the dashboard activity feed and the actual SMS Claude sends. Both require a deployed flow to observe.

## Recommended next steps (in order)

1. **Wire `lead-qualification` to `InboundMessage`** — add to `SUPPORTED_SLUGS`, map the trigger payload. ~1h.
2. **Apply migrations 017+018 to staging.** ~5 min.
3. **Install a sandbox PIT for one staging account.** Operator action in GHL UI + `setAccountPit` call. ~5 min.
4. **Run `scripts/probe-ghl-mcp.mjs` against staging.** Confirms the live tool inventory matches our pattern table. ~15 sec.
5. **Send a synthetic `InboundMessage` to staging.** Observe the activity-feed row + `llm_usage_events` row + the actual SMS to a test phone. ~5 min.
6. **Promote to production.** Repeat steps 2–5 against prod with a single canary account.

Total time to "this works in production": ~2 hours of operator work + the lead-qualification wiring change.
