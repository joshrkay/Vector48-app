-- Agency-level OAuth credentials (replaces static GHL_AGENCY_API_KEY env var).
-- Typically a single row per agency; structured as a table for flexibility.
CREATE TABLE IF NOT EXISTS ghl_agency_oauth (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      TEXT NOT NULL,
  access_token_encrypted  TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at        TIMESTAMPTZ NOT NULL,
  scopes          TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Per-location refresh token + expiry on the accounts table.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS ghl_refresh_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS ghl_token_expires_at        TIMESTAMPTZ;
