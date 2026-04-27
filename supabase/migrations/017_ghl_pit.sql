-- Per-account GoHighLevel Private Integration Token (PIT).
--
-- PITs are a separate auth mechanism from OAuth: they're long-lived,
-- per-location tokens minted in GHL Settings > Private Integrations and
-- used to authenticate against the GHL MCP server at
-- https://services.leadconnectorhq.com/mcp/. They are not refreshed —
-- they're rotated manually by the operator.
--
-- We store the PIT alongside the existing OAuth pair on accounts so the
-- recipe runner can hand a single account id to either transport. The
-- scopes column captures what the operator selected when minting the
-- PIT (free-form per GHL UI), used only for diagnostics today.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS ghl_pit_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS ghl_pit_scopes    TEXT,
  ADD COLUMN IF NOT EXISTS ghl_pit_updated_at TIMESTAMPTZ;
