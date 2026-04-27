# Test-SMS Quickstart for Lead-Qualification

Three escalating paths from "no setup" to "real lead qualified by Claude in production." Pick the lowest one that gives you the proof you want.

## Path 1 — Local synthetic webhook (5 minutes, $0)

Proves the full handler runs in a real Next.js process against real Supabase, with mocked GHL/Anthropic. Catches deploy-time wiring bugs before Vercel.

### Prereqs

- Local Supabase project linked (or staging credentials in `.env.local`).
- Migrations 017 + 018 applied to whatever database `.env.local` points at:
  ```bash
  npm run db:push
  ```
- A real `accounts` row with a real `ghl_location_id` (use `npm run create-test-account`, or pick an existing onboarded staging account).
- A `tenant_agents` row for `lead-qualification` for that account, with `enabledTools` populated (migration 018 backfills this; new activations get it from the archetype).

### Setup

Add to `.env.local`:

```bash
GHL_WEBHOOK_ALLOW_UNSIGNED=true
GHL_WEBHOOK_TEST_SECRET=local-test-secret-pick-anything
```

### Run

```bash
# Terminal 1
npm run dev

# Terminal 2
WEBHOOK_BASE_URL=http://localhost:3000 \
ACCOUNT_ID=<your-test-account-uuid> \
LOCATION_ID=<that-account's-ghl_location_id> \
TEST_SECRET=local-test-secret-pick-anything \
node scripts/test-lead-qualification-webhook.mjs
```

### Expected outcome (no PIT installed yet)

```
← HTTP 200
{
  "ok": true,
  "result": {
    "outcome": "skipped_no_pit",
    "iterations": 0,
    "toolCalls": [],
    ...
    "reason": "Account <uuid> has no GHL Private Integration Token installed"
  }
}
✓ Webhook accepted. outcome=skipped_no_pit
  → Wiring works. Install a PIT (runbook Phase C) to exercise the live MCP path.
```

`skipped_no_pit` proves: route registered, signature gate works, account lookup works, tenant binding works, recipe runner dispatches, handler returns the expected outcome. Zero spend on Anthropic, zero GHL traffic. **This is the cheapest "wiring is correct" signal available.**

## Path 2 — Local synthetic + real PIT (15 minutes, ~$0.05 in Anthropic tokens)

Same as Path 1 but with a real GHL PIT installed, so the handler actually calls GHL MCP and Claude.

### Additional prereq

Install a PIT for the test account (`qa/audits/A4-lead-qualification-rollout-runbook.md` Phase C, steps 4-5).

### Run

Same curl command as Path 1.

### Expected outcome

```
← HTTP 200
{
  "ok": true,
  "result": {
    "outcome": "qualification_message_sent",
    "iterations": 2,
    "toolCalls": [
      { "name": "conversations_send-a-new-message", "ok": true }
    ],
    "finalText": "...",
    ...
  }
}
```

The lead's GHL contact (whoever `CONTACT_ID` resolves to in GHL) will receive a real SMS reply asking a qualification question.

Verify the round-trip:

```sql
SELECT model, input_tokens, output_tokens, cost_micros
FROM llm_usage_events
WHERE account_id = '<your-test-account-uuid>'
  AND recipe_slug = 'lead-qualification'
ORDER BY created_at DESC LIMIT 5;

SELECT summary, detail
FROM automation_events
WHERE account_id = '<your-test-account-uuid>'
  AND recipe_slug = 'lead-qualification'
ORDER BY created_at DESC LIMIT 1;
```

## Path 3 — End-to-end real SMS in staging (~2 hours)

Real phone, real GHL number, real webhook. The full runbook in `A4-lead-qualification-rollout-runbook.md` covers this.

The synthetic test (Path 1 or 2) catches wiring bugs cheaply; Path 3 catches anything that only manifests with real GHL traffic (signature variants, real tool name shapes, real conversation history payloads).

## Why the synthetic test won't run against Vercel preview as-is

`signatureVerification.ts:123` blocks the unsigned-test bypass when `NODE_ENV=production`, which Vercel sets for preview deployments too. Two ways to enable preview testing:

1. **Code change:** gate the bypass on `VERCEL_ENV === "production"` instead of `NODE_ENV`. Single-file change in `signatureVerification.ts`. Defense-in-depth is preserved (still requires `GHL_WEBHOOK_ALLOW_UNSIGNED=true` env var).
2. **Skip preview, go to local + staging:** Path 1 against `npm run dev`, then Path 3 (real SMS) against staging. Skips the synthetic-on-preview step entirely.

Recommend option 2 for now — preview synthetic testing is convenience, not necessity.

## Failure-mode quick reference

| Response | Meaning | Fix |
|---|---|---|
| 401 webhook_unauthorized | TEST_SECRET mismatch or NODE_ENV=production | Check env vars |
| 403 tenant_binding_mismatch | LOCATION_ID doesn't match `accounts.ghl_location_id` | Use the right LOCATION_ID |
| 404 unknown_account | ACCOUNT_ID doesn't exist | Verify the UUID |
| 404 agent_not_configured | No active `tenant_agents` row | Activate the recipe |
| 400 invalid_inbound_message_payload | Missing contactId or empty body | Body validation working — fix the payload |
| 200 outcome=skipped_no_pit | Wiring works, no PIT installed | Path 2 (install PIT) for the next level |
| 200 outcome=skipped_no_enabled_tools | tool_config doesn't have enabledTools | Apply migration 018, or seed via archetype |
| 200 outcome=qualification_message_sent | Real run, Claude sent a real SMS reply | ✓ |
| 200 outcome=qualification_completed | Real run, Claude marked the lead qualified via task | ✓ |
