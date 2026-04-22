-- Idempotency ledger for Stripe webhook events. Stripe retries on non-2xx
-- responses (and occasionally delivers duplicates even on 2xx), so we dedupe
-- by event.id before applying any mutation.
CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purge old entries periodically (>90 days) to keep the table small. Stripe
-- only retries for ~3 days, so anything beyond that is safe to drop.
CREATE INDEX IF NOT EXISTS idx_stripe_processed_events_processed_at
  ON stripe_processed_events(processed_at);
