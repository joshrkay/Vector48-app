# Lead-Qualification Production Rollout Runbook

**Branch:** `claude/evaluate-mcp-ghl-integration-g2GHu`
**Status:** Code-complete and CI-green. Operator steps below take it from "merged" to "running in production."

This runbook is the gap between unit tests passing and a real lead getting qualified by Claude in production. Each step is independently verifiable; if a step fails, the next step won't reach a real user.

## Prerequisites

- Merge access to `main`.
- Supabase project access (staging + prod) — service role key.
- GoHighLevel agency-level access (to mint Private Integration Tokens for sub-accounts).
- Anthropic API key already configured (`ANTHROPIC_API_KEY` env).
- A staging `accounts` row that's already onboarded a real GHL sub-account (has `ghl_location_id` set).

## Phase A — Deploy code

### Step 1. Merge the branch

```bash
git checkout main
git pull
git merge --no-ff claude/evaluate-mcp-ghl-integration-g2GHu
git push origin main
```

CI must run `npm run test:unit` and `npx tsc --noEmit` to green before promoting. **Acceptance:** 200 node:test cases + 132 vitest cases pass; no type errors.

### Step 2. Deploy to staging

Standard deploy pipeline. **Acceptance:** the deployed build serves `/login` (sanity) and `/api/recipes/webhook/lead-qualification/[any]` returns `404 unknown_account` (proves the route is registered, not 404 from `not_yet_routed`).

```bash
curl -X POST https://staging.vector48.ai/api/recipes/webhook/lead-qualification/00000000-0000-0000-0000-000000000000 \
  -H 'content-type: application/json' \
  -d '{"type":"InboundMessage"}'
# Expect: HTTP 401 (missing signature) or HTTP 404 unknown_account, NOT 404 "not yet routed"
```

## Phase B — Database

### Step 3. Apply migrations 017 + 018 to staging

```bash
# from a checkout with staging credentials in the env
npm run db:push
```

Or, manually:

```bash
psql "$STAGING_DATABASE_URL" \
  -f supabase/migrations/017_ghl_pit.sql \
  -f supabase/migrations/018_lead_qualification_tool_config_backfill.sql
```

**Acceptance:** Both migrations run without error.

```sql
-- verify 017
SELECT column_name FROM information_schema.columns
WHERE table_name='accounts' AND column_name LIKE 'ghl_pit%';
-- → ghl_pit_encrypted, ghl_pit_scopes, ghl_pit_updated_at

-- verify 018 (after running) — every existing lead-qualification agent should
-- now have enabledTools populated
SELECT account_id, tool_config -> 'enabledTools'
FROM tenant_agents
WHERE recipe_slug = 'lead-qualification';
-- → each row shows ["sendSms", "lookupContact", "createTask", "checkCalendar"]
```

## Phase C — Install a Private Integration Token

### Step 4. Mint a PIT in GHL

In the **staging sub-account's** GHL UI:

1. Navigate to **Settings → Private Integrations**.
2. Click **Create New Integration**.
3. Name it `Vector48 — Lead Qualification (staging)`.
4. Required scopes (check these):
   - `contacts.readonly` — for `get-contact`
   - `contacts.write` — for `create-task` (tasks live under contacts)
   - `conversations.readonly` — for `get-messages`
   - `conversations.write` — for `send-a-new-message`
   - `calendars.readonly` — for `get-calendar-events`
5. Save. Copy the token (starts with `pit_`).

### Step 5. Store the encrypted PIT

There's no UI for this yet — it's a one-line script. From a checkout connected to staging:

```bash
node --experimental-strip-types -e "
import('./lib/ghl/token.ts').then(async ({ setAccountPit }) => {
  await setAccountPit(
    process.env.ACCOUNT_ID,
    process.env.PIT,
    'contacts.readonly contacts.write conversations.readonly conversations.write calendars.readonly'
  );
  console.log('PIT stored for', process.env.ACCOUNT_ID);
});
"
ACCOUNT_ID=<staging-account-uuid> PIT=pit_xxx node ...
```

**Acceptance:**

```sql
SELECT id, ghl_pit_encrypted IS NOT NULL AS has_pit, ghl_pit_scopes, ghl_pit_updated_at
FROM accounts
WHERE id = '<staging-account-uuid>';
-- → has_pit=true, scopes populated, ghl_pit_updated_at within the last minute
```

## Phase D — Verify the MCP transport

### Step 6. Run the probe script

This proves our auth works against the real GHL MCP server, and confirms the tool names we depend on exist.

```bash
GHL_MCP_PIT=pit_xxx GHL_LOCATION_ID=<ghl-location-id> \
  node scripts/probe-ghl-mcp.mjs
```

**Acceptance:** Script exits 0 and the bottom section shows ✓ for all four logical tools:

```
Lead-qualification tool coverage check:
  ✓ contacts_get-contact
  ✓ conversations_send-a-new-message
  ✓ calendars_get-calendar-events
  ✓ contacts_create-task
```

If any line shows `~` (fuzzy match) or `✗`, **stop**. Update `LOGICAL_TOOL_PATTERNS` in `lib/recipes/runner/recipes/leadQualification.ts:57` to match the actual tool names GHL returns, redeploy, retest.

## Phase E — Configure the GHL webhook

### Step 7. Point InboundMessage at the staging route

In the staging sub-account's GHL UI:

1. **Settings → Webhooks → Create Webhook** (or update an existing one).
2. **Event:** `InboundMessage`.
3. **URL:** `https://staging.vector48.ai/api/recipes/webhook/lead-qualification/<staging-account-uuid>`.
4. **Verification:** ed25519 (default for GHL).
5. Save and verify the webhook reports "Active."

If your staging environment uses a different host, swap accordingly. The route shape is `/api/recipes/webhook/{slug}/{accountId}`.

### Step 8. Activate the recipe for the account

The recipe must be in `recipe_activations` with `status='active'` for the runner to load the tenant_agent. Check or create:

```sql
INSERT INTO recipe_activations (account_id, recipe_slug, status, config)
VALUES ('<staging-account-uuid>', 'lead-qualification', 'active', '{}'::jsonb)
ON CONFLICT (account_id, recipe_slug) DO UPDATE SET status='active';
```

(Or use the existing recipe-activation UI flow.)

**Acceptance:**

```sql
SELECT a.id AS agent_id, a.status, a.tool_config -> 'enabledTools'
FROM tenant_agents a
JOIN recipe_activations ra ON ra.account_id = a.account_id AND ra.recipe_slug = a.recipe_slug
WHERE a.recipe_slug = 'lead-qualification'
  AND a.account_id = '<staging-account-uuid>'
  AND ra.status = 'active'
  AND a.status = 'active';
-- → exactly one row, enabledTools has 4 entries
```

## Phase F — End-to-end test

### Step 9. Send a real inbound SMS

From a test phone (or via GHL's "Send Test SMS" tool), send a message **to the staging sub-account's GHL phone number**:

> "Hi, my AC is broken and I need help today."

### Step 10. Verify the activity row

Within ~10 seconds:

```sql
SELECT recipe_slug, summary, detail
FROM automation_events
WHERE account_id = '<staging-account-uuid>'
  AND recipe_slug = 'lead-qualification'
ORDER BY created_at DESC
LIMIT 1;
```

**Acceptance:** the row exists, `summary` is `lead-qualification: qualification_message_sent`, and `detail` includes `tool_calls` with at least one `conversations_send-a-new-message` entry.

```sql
SELECT model, input_tokens, output_tokens, cost_micros
FROM llm_usage_events
WHERE account_id = '<staging-account-uuid>'
  AND recipe_slug = 'lead-qualification'
ORDER BY created_at DESC
LIMIT 5;
-- → 1 to 2 rows for the run; cost in single-digit cents
```

### Step 11. Verify the SMS landed

The test phone should receive a reply from the GHL number, asking a qualification question (likely about the address, urgency, or budget). The text is generated by Claude — exact wording varies but should be polite, short (<300 chars), and reference the lead's reported issue.

If the SMS does NOT arrive:
- Check `webhook_failures` for signature errors.
- Check the deployed app logs for `[recipes/webhook]` entries.
- Re-run probe (Step 6) to confirm the PIT is still valid.
- Verify the `tenant_agents` row's `system_prompt` isn't empty.

## Phase G — Promote to production

Repeat Phase B → Phase F against production, with these differences:

- **One canary account first.** Pick a single sub-account that opted-in, mint a PIT, configure the webhook for that account only.
- **Watch `automation_events` for 24h.** Outcomes should be predominantly `qualification_message_sent` and `qualification_completed`, with rare `skipped_*` and zero unhandled errors.
- **Then expand.** Add PITs for additional sub-accounts in batches of 5–10, monitoring `llm_usage_events` cost per account against the spend cap.

## Rollback

If something goes wrong in production:

1. **Disable the webhook in GHL** (per-sub-account toggle). Stops new triggers immediately.
2. **Pause the agent:** `UPDATE tenant_agents SET status='paused' WHERE recipe_slug='lead-qualification' AND account_id=...`. Prevents the runner from picking up any in-flight triggers.
3. **Optionally revert deploy.** The handler has a feature flag implicitly via `enabledTools=[]` — if the bug is in the handler logic, you can null out tool_config to short-circuit with `skipped_no_enabled_tools` instead of full-deploying a revert.

Migrations 017 and 018 are additive only (new column, idempotent backfill). They don't need to be reverted under any rollback scenario.

## Acceptance checklist (cut & paste)

```
[ ] Step 1.  Branch merged, CI green
[ ] Step 2.  Staging deployed; lead-qualification route reachable
[ ] Step 3.  Migrations 017+018 applied to staging
[ ] Step 4.  PIT minted in GHL with 5 scopes
[ ] Step 5.  PIT stored encrypted in accounts.ghl_pit_encrypted
[ ] Step 6.  Probe script shows ✓ for all 4 logical tools
[ ] Step 7.  GHL InboundMessage webhook configured
[ ] Step 8.  Recipe activated for account; tenant_agent has enabledTools
[ ] Step 9.  Test SMS sent
[ ] Step 10. automation_events row written; llm_usage_events row written
[ ] Step 11. SMS reply received on test phone
[ ] Phase G. Canary account in production runs for 24h without errors
```

Total realistic time: **~2 hours of operator work** end-to-end (most of it waiting for staging deploy + canary observation).
