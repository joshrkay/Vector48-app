# Level Up to Real SMS Reply

You've already verified the wiring works locally with `outcome=skipped_no_pit` (Path 1 from `A4-test-sms-quickstart.md`). This doc takes you from there to a real SMS reply Claude generates and GHL delivers — ~15 minutes, ~$0.05 in Anthropic tokens, plus 1 SMS credit on your GHL plan.

The new tooling for this branch:

- `scripts/install-ghl-pit.mjs` — verifies a PIT works against GHL MCP, then encrypts and stores it on the target account.
- `scripts/probe-ghl-mcp.mjs` (already shipped) — standalone probe to inspect GHL MCP tool inventory.
- `scripts/test-lead-qualification-webhook.mjs` (already shipped) — synthetic webhook poster.

## Step 1. Mint a PIT in GHL (~3 min)

In the **staging GHL sub-account** UI:

1. Settings → **Private Integrations** → **Create New Integration**.
2. Name: `Vector48 — Lead Qualification (staging)`.
3. Required scopes (check exactly these — `install-ghl-pit.mjs` will refuse a PIT that can't run all four logical tools):
   - `contacts.readonly`
   - `contacts.write`
   - `conversations.readonly`
   - `conversations.write`
   - `calendars.readonly`
4. Save. Copy the token (starts with `pit_`).

## Step 2. Verify the PIT alone (optional, ~15 sec)

Sanity check before pointing the install script at your real Supabase row:

```bash
GHL_MCP_PIT=pit_xxx \
GHL_LOCATION_ID=<ghl-location-id> \
node scripts/probe-ghl-mcp.mjs
```

You want all four logical tools to show ✓. If any show `~` (fuzzy match) or `✗`, **stop here** and update `LOGICAL_TOOL_PATTERNS` in `lib/recipes/runner/recipes/leadQualification.ts:57` to match GHL's actual tool names — otherwise the install script will refuse to store the PIT for the same reason.

## Step 3. Install the PIT (~10 sec)

```bash
ACCOUNT_ID=<staging-account-uuid> \
GHL_MCP_PIT=pit_xxx \
GHL_LOCATION_ID=<ghl-location-id> \
node scripts/install-ghl-pit.mjs
```

The script:

1. Loads `.env.local` (so `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GHL_TOKEN_ENCRYPTION_KEY` come from there).
2. Loads the account row, refuses to install if `ACCOUNT_ID`'s `ghl_location_id` doesn't match the supplied `GHL_LOCATION_ID` — protects against installing a PIT for the wrong tenant.
3. Re-runs the probe (skip with `SKIP_VERIFY=true` if you already did Step 2 and want to be ~3 sec faster).
4. Refuses to store the PIT unless all four required tools are present in the inventory.
5. Encrypts via the same AES-256-GCM layout `lib/ghl/token.ts:encryptToken` uses, writes to `accounts.ghl_pit_encrypted` + scopes + timestamp.
6. Reads back to confirm.

Expected output: `✓ PIT installed for account <uuid>` plus the next-steps block.

## Step 4. Confirm the recipe is activated (~10 sec)

```sql
SELECT a.status AS agent_status, a.tool_config -> 'enabledTools', ra.status AS activation_status
FROM tenant_agents a
LEFT JOIN recipe_activations ra
  ON ra.account_id = a.account_id AND ra.recipe_slug = a.recipe_slug
WHERE a.account_id = '<staging-account-uuid>' AND a.recipe_slug = 'lead-qualification';
```

You want:
- `agent_status = 'active'`
- `enabledTools` is a 4-element array (migration 018 backfills this)
- `activation_status = 'active'`

If `enabledTools` is null/empty: re-run migration 018, or insert/activate via the existing recipe-activation flow (UI or `/api/recipes/activate`).

## Step 5. Send the synthetic webhook (~5 sec to fire, ~5 sec until SMS arrives)

```bash
# In .env.local make sure:
#   GHL_WEBHOOK_ALLOW_UNSIGNED=true
#   GHL_WEBHOOK_TEST_SECRET=<any random string>

# Make sure CONTACT_ID resolves to a contact in GHL with a real phone.
# An easy choice: any test contact you've already created in the staging sub-account.

WEBHOOK_BASE_URL=http://localhost:3000 \
ACCOUNT_ID=<staging-account-uuid> \
LOCATION_ID=<ghl-location-id> \
TEST_SECRET=<the same secret> \
CONTACT_ID=<a real GHL contact id with a phone> \
INBOUND_TEXT="Hi, my AC is broken and I need help today" \
node scripts/test-lead-qualification-webhook.mjs
```

Expected output:

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
✓ Webhook accepted. outcome=qualification_message_sent
  → Real run. Check llm_usage_events + the SMS on the lead's phone.
```

## Step 6. Verify the round-trip

The contact's phone receives an SMS. Within ~5 seconds in Supabase:

```sql
SELECT model, input_tokens, output_tokens, cost_micros, created_at
FROM llm_usage_events
WHERE account_id = '<staging-account-uuid>'
  AND recipe_slug = 'lead-qualification'
ORDER BY created_at DESC LIMIT 5;

SELECT recipe_slug, summary, detail->>'outcome' AS outcome,
       detail->'tool_calls' AS tool_calls
FROM automation_events
WHERE account_id = '<staging-account-uuid>'
  AND recipe_slug = 'lead-qualification'
ORDER BY created_at DESC LIMIT 1;
```

Either path (Anthropic call OR GHL SMS) failing leaves the run partially complete — re-run `scripts/install-ghl-pit.mjs` with the same args (idempotent), then retry the webhook.

## Failure quick-reference

| Symptom | Fix |
|---|---|
| `install-ghl-pit.mjs` exits 3 | PIT didn't authenticate — wrong scopes, expired token, wrong location |
| `install-ghl-pit.mjs` exits 4 | Required tool(s) missing — re-mint PIT with all 5 scopes, OR your GHL plan tier doesn't include MCP for that tool category |
| Webhook returns `outcome=skipped_no_pit` after install | Run `SELECT ghl_pit_encrypted IS NOT NULL FROM accounts WHERE id='<uuid>'`. If false, re-run install |
| Webhook returns `outcome=skipped_no_enabled_tools` | Migration 018 didn't run, or `tenant_agents.tool_config.enabledTools` is empty |
| Webhook returns 200 but no SMS arrives | Inspect `automation_events.detail.tool_calls` — `ok=false` means MCP call returned an error, check the response body |
| Webhook returns 401 | Check `GHL_WEBHOOK_ALLOW_UNSIGNED=true` and matching `GHL_WEBHOOK_TEST_SECRET` are set in `.env.local` (the dev server reloads on env changes — restart `npm run dev` if unsure) |

Once Path 2 is green for one account, repeat Steps 1+3 for the next staging account, then promote the same flow to production with a single canary account before broad rollout.
