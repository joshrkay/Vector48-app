# Synthetic Webhook Testing on Vercel Preview

After this branch lands, every Vercel preview deploy can run the lead-qualification synthetic webhook test against the deployed URL — no `npm run dev` needed.

The auth bypass that makes this possible reads `VERCEL_ENV` only when `VERCEL=1` is also set (Vercel's platform-set marker that can't be overridden in normal config). Outside Vercel it falls back to `NODE_ENV`. The full matrix:

| Environment | VERCEL | NODE_ENV | VERCEL_ENV | effectiveEnv | Unsigned bypass |
|---|---|---|---|---|---|
| Vercel **production** | 1 | production | production | production | ✗ blocked |
| Vercel **preview** | 1 | production | preview | preview | ✓ allowed if env vars set |
| Local `npm run dev` | (unset) | development | (unset) | development | ✓ allowed if env vars set |
| CI test runs | (unset) | test | (unset) | test | ✓ allowed if env vars set |
| Self-hosted prod | (unset) | production | (unset) | production | ✗ blocked |
| Self-hosted prod with leaked `VERCEL_ENV=preview` | (unset) | production | preview | production | ✗ blocked (NODE_ENV wins) |

Defense-in-depth: code change alone doesn't open prod up. Four things must all line up before unsigned traffic is accepted on a preview:

1. `VERCEL=1` (set automatically by the Vercel platform on every Vercel runtime; not user-configurable)
2. `VERCEL_ENV !== "production"` (Vercel sets this; "preview" on PR/branch deploys, "production" only on the prod domain)
3. `GHL_WEBHOOK_ALLOW_UNSIGNED=true` env var on the deployment
4. `GHL_WEBHOOK_TEST_SECRET=<secret>` env var on the deployment AND matching `x-ghl-test-secret` header on the request

A leaked `GHL_WEBHOOK_ALLOW_UNSIGNED=true` accidentally promoted to production is still inert because `VERCEL_ENV=production` short-circuits the bypass. A leaked `VERCEL_ENV=preview` on a non-Vercel deployment is also inert because `VERCEL=1` is not set, so `NODE_ENV=production` wins.

## One-time setup on Vercel

In the Vercel dashboard for `vector48-app`:

1. **Settings → Environment Variables → Add**
2. Add for the **Preview** environment only (not Production):
   - `GHL_WEBHOOK_ALLOW_UNSIGNED` = `true`
   - `GHL_WEBHOOK_TEST_SECRET` = pick a random string, e.g. `openssl rand -hex 32`
3. Save. The next preview deploy will pick them up automatically.

Confirm via the Deployment → Environment Variables tab that both are set on the preview but **NOT** on production.

## Running the test

```bash
WEBHOOK_BASE_URL=https://vector48-app-git-claude-evaluate-mcp-ghl-integ-XYZ.vercel.app \
ACCOUNT_ID=<a-real-account-uuid-on-staging-supabase> \
LOCATION_ID=<the-account's-ghl_location_id> \
TEST_SECRET=<matches GHL_WEBHOOK_TEST_SECRET on Vercel> \
node scripts/test-lead-qualification-webhook.mjs
```

Expected outcomes by setup state:

| State | Outcome | What it proves |
|---|---|---|
| Account row exists, no PIT installed yet | `outcome=skipped_no_pit` | Route reachable on Vercel, auth bypass works on preview, account lookup works, runner dispatches |
| Account row exists, PIT installed (via `scripts/install-ghl-pit.mjs`) | `outcome=qualification_message_sent` and a real SMS arrives | Full path including live GHL MCP and Anthropic |
| Same curl against Vercel **production** URL | HTTP 401 `webhook_unauthorized` | Production block still holds — proof the change is safe |

## Confirming the prod block still works (run this once after merge)

```bash
# Hit the production URL with the same secret. Must return 401.
WEBHOOK_BASE_URL=https://app.vector48.ai \
ACCOUNT_ID=<any-uuid> \
LOCATION_ID=<any> \
TEST_SECRET=<the secret> \
node scripts/test-lead-qualification-webhook.mjs
# Expect: HTTP 401 webhook_unauthorized
# DO NOT set GHL_WEBHOOK_ALLOW_UNSIGNED=true on the production environment.
```

If that returns anything other than 401, **stop** and audit the production env vars — `GHL_WEBHOOK_ALLOW_UNSIGNED` should not be set on prod regardless of this code change.

## Where this fits in the rollout sequence

1. ✅ Phase 1 lead-qualification handler + dispatch (branch `claude/evaluate-mcp-ghl-integration-g2GHu`)
2. ✅ Install-PIT CLI + level-up runbook (branch `claude/install-ghl-pit-cli`)
3. ✅ **This branch** — Vercel preview testing
4. After merge:
   - Vercel preview deploys → run synthetic test → see `skipped_no_pit` (wiring confirmed)
   - Install a staging PIT (`scripts/install-ghl-pit.mjs`) → run synthetic test against same preview → see `qualification_message_sent` and a real SMS
   - Production rollout per `qa/audits/A4-lead-qualification-rollout-runbook.md`

The synthetic preview test should become a CI step that runs after every preview deploy, asserting `outcome=skipped_no_pit` (or `qualification_message_sent` if a CI-only PIT is installed). That gives every PR a deployed-environment smoke before merge.
