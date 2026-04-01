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
