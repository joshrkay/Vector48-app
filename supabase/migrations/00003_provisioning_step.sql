-- Vector 48 — Provisioning step tracking
-- Adds provisioning_step to accounts for idempotent retry support.

ALTER TABLE accounts ADD COLUMN provisioning_step int NOT NULL DEFAULT 0;
