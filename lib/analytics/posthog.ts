// ---------------------------------------------------------------------------
// PostHog server-side analytics wrapper.
//
// All server-side product-telemetry events flow through this module. It exposes
// a typed `track()` surface so event names and properties stay consistent
// across the codebase, and a typed `identify()` for account linkage.
//
// When POSTHOG_API_KEY is unset (dev without analytics, CI, preview env
// without secrets) the module is a no-op — callers never need to branch on
// env, never crash on missing config, and tests do not send events.
// ---------------------------------------------------------------------------

// Intentionally no `server-only` import — this module is imported from
// lib/recipes/runner/index.ts which is exercised by node:test, and node:test
// under --experimental-strip-types can't resolve the shim. posthog-node is
// Node-only anyway, so bundling into the client bundle would already fail.

import { PostHog } from "posthog-node";

/**
 * Canonical event taxonomy. Every server-emitted product event must be one of
 * these. Keep this list as the single source of truth — if you need a new
 * event, add it here first so typos don't silently branch the funnel.
 */
export type AnalyticsEvent =
  // Auth + onboarding funnel
  | "user_signed_up"
  | "email_confirmed"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "provisioning_started"
  | "provisioning_completed"
  | "provisioning_failed"
  // Recipe lifecycle
  | "recipe_activated"
  | "recipe_deactivated"
  | "recipe_trigger_fired"
  | "recipe_trigger_failed"
  | "spend_cap_hit"
  // CRM events we care about for retention
  | "contact_marked_callback_needed"
  | "ghl_oauth_connected"
  | "ghl_oauth_disconnected"
  // Commercial funnel
  | "trial_expired"
  | "upgrade_started"
  | "checkout_session_created"
  | "subscription_activated"
  | "subscription_cancelled"
  // Support signal
  | "support_email_clicked";

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

let client: PostHog | null = null;
let clientResolved = false;

function getClient(): PostHog | null {
  if (clientResolved) return client;
  clientResolved = true;

  const apiKey = process.env.POSTHOG_API_KEY?.trim();
  if (!apiKey) return null;

  const host = process.env.POSTHOG_HOST?.trim() || "https://app.posthog.com";

  client = new PostHog(apiKey, {
    host,
    // Batch events so high-volume recipe_trigger_fired doesn't block the runner.
    flushAt: 20,
    flushInterval: 10_000,
  });

  return client;
}

/**
 * Fire a product-telemetry event. `distinctId` is the account id or auth user
 * id depending on the context; prefer account id for anything post-signup.
 *
 * Never throws — PostHog failures are logged and swallowed so a broken
 * analytics pipeline can't take down the runner or a webhook.
 */
export function track(
  distinctId: string,
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
): void {
  const posthog = getClient();
  if (!posthog) return;

  try {
    posthog.capture({
      distinctId,
      event,
      properties,
    });
  } catch (err) {
    console.error("[analytics] track failed", {
      event,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Attach human-facing context to a distinctId so PostHog shows meaningful
 * names in funnels and session replays. Call once after signup and again
 * whenever the account attributes change materially (plan upgrade).
 */
export function identify(
  distinctId: string,
  properties: AnalyticsProperties = {},
): void {
  const posthog = getClient();
  if (!posthog) return;

  try {
    posthog.identify({
      distinctId,
      properties,
    });
  } catch (err) {
    console.error("[analytics] identify failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Flush pending events before process exit. Cron jobs and webhook handlers
 * should await this before returning so short-lived lambdas don't drop events.
 */
export async function flush(): Promise<void> {
  const posthog = getClient();
  if (!posthog) return;

  try {
    await posthog.flush();
  } catch (err) {
    console.error("[analytics] flush failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
