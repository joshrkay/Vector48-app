-- Vector 48 — Add webhook-specific columns to event_log
-- Supports GHL webhook ingestion with idempotency and contact tracking.

-- Allow raw GHL events that aren't tied to a specific recipe
ALTER TABLE event_log ALTER COLUMN recipe_slug DROP NOT NULL;

-- Raw GHL event name (e.g. "ContactCreate", "CallCompleted")
ALTER TABLE event_log ADD COLUMN ghl_event_type text;

-- GHL contact ID associated with the event
ALTER TABLE event_log ADD COLUMN contact_id text;

-- GHL entity ID for idempotency (composite: "{eventType}:{entityId}")
ALTER TABLE event_log ADD COLUMN ghl_event_id text;

-- Partial unique index — only enforced when ghl_event_id is present.
-- Prevents duplicate webhook processing without affecting older rows.
CREATE UNIQUE INDEX idx_event_log_idempotency
  ON event_log(account_id, ghl_event_id)
  WHERE ghl_event_id IS NOT NULL;
