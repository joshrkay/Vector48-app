-- Vector 48 — Onboarding wizard fields
-- Adds columns to accounts for data collected during the onboarding wizard

ALTER TABLE accounts
  ADD COLUMN service_area         text,
  ADD COLUMN business_hours       jsonb,
  ADD COLUMN voice_gender         text,
  ADD COLUMN voice_greeting       text,
  ADD COLUMN notification_sms     boolean NOT NULL DEFAULT false,
  ADD COLUMN notification_email   boolean NOT NULL DEFAULT false,
  ADD COLUMN notification_contact text,
  ADD COLUMN onboarding_step      int NOT NULL DEFAULT 0;
