-- Add per-account GHL webhook shared secret for request verification
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS ghl_webhook_secret TEXT;
