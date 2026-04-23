-- Persist webhook signature/authentication failures so ops can see them
-- in a dashboard instead of hunting through console logs. Covers GHL and
-- Stripe; extendable for future providers.
--
-- Captures the raw reason + sanitized payload hash so we can reproduce
-- the delivery without storing secrets. Account linkage is optional:
-- sig-failed webhooks often don't have a validated account yet.

CREATE TABLE IF NOT EXISTS webhook_failures (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL CHECK (provider IN ('ghl', 'stripe')),
  account_id   UUID REFERENCES accounts(id) ON DELETE SET NULL,
  reason       TEXT NOT NULL,
  event_type   TEXT,
  payload_hash TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_failures_provider_created_at
  ON webhook_failures(provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_failures_account_created_at
  ON webhook_failures(account_id, created_at DESC)
  WHERE account_id IS NOT NULL;

-- Lock this down to the service role. Operators query via /admin/ops.
ALTER TABLE webhook_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_failures_service_role_only"
  ON webhook_failures
  FOR ALL
  USING (false);
