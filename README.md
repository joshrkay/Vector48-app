# Vecto48-app

## CI requirements

This repository runs a required GitHub Actions workflow at `.github/workflows/ci.yml`.
The required status check to enforce in branch protection is:

- `Required CI Checks`

## Contributor note

If dependencies change, run `npm install` and commit `package-lock.json`.

## GHL cache invalidation deployment notes

- Webhook/cache invalidation uses Next.js `revalidateTag` with tags in the format
  `ghl:{accountId}:{resource}`.
- Tag invalidation is only reliably distributed when your deployment uses a shared
  Next incremental/data cache backend across instances.
- If your environment does not provide that shared backend, add a Redis-based
  distributed invalidation fallback so all app instances receive cache bust events.

## Scheduled job note

- Scheduled recipe trigger processing currently runs through Inngest cron in
  `lib/inngest/functions.ts`.
- Do not add a high-frequency Vercel cron for recipe triggers unless the deployment
  plan supports it and the handler matches the current `recipe_triggers` schema.

## Supabase env parity + provisioning status check

1. In Vercel (or your deployment platform), set these values from Supabase Dashboard → Project Settings → API:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL` must be exactly `https://<project-ref>.supabase.co` (no quotes, spaces, or line breaks).
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be a single-line value with no whitespace.
2. Redeploy after updating env vars.
3. Copy `.env.local.example` to `.env.local` and mirror the exact same values locally.
4. Run:

```bash
NEXT_PUBLIC_SUPABASE_URL='https://<project-ref>.supabase.co' \
NEXT_PUBLIC_SUPABASE_ANON_KEY='<anon-key>' \
npm run verify:supabase-env -- --base-url 'https://<your-deployment>.vercel.app' --account-id '<account-id>'
```

This command enforces the same rules as `lib/supabase/env.ts` (required, no leading/trailing whitespace, no whitespace anywhere), verifies `.env.local` parity, and re-checks `/api/onboarding/provision/status`.

## Login debugging: extension noise triage

If you see console errors/warnings on the login page that do not map to repository code:

1. Open the login page in a Chrome Incognito window with extensions disabled, or temporarily disable extensions in a normal profile.
2. Retry login and compare console output.
3. If the suspect message disappears while app errors remain unchanged, classify it as external extension noise and exclude it from app debugging.
4. If the message still appears with all extensions disabled, inspect app-injected scripts for custom `chrome.runtime` / `browser.runtime` usage.

Repository note: current scans have not found custom `chrome.runtime` or `browser.runtime` usage in this codebase.
