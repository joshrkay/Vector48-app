-- Settings page: account profile fields, integration error status, notification prefs, voice storage bucket.

-- integration_status: error (red badge / failed connections)
DO $$ BEGIN
  ALTER TYPE integration_status ADD VALUE 'error';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS business_email text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text,
  ADD COLUMN IF NOT EXISTS address_zip text,
  ADD COLUMN IF NOT EXISTS greeting_audio_url text,
  ADD COLUMN IF NOT EXISTS notification_contact_name text,
  ADD COLUMN IF NOT EXISTS notification_alert_email text,
  ADD COLUMN IF NOT EXISTS notification_alert_prefs jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS owner_display_name text;

DO $$ BEGIN
  ALTER TABLE accounts ADD CONSTRAINT accounts_account_status_check
    CHECK (account_status IN ('active', 'deleted'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Voice greeting audio — uploads via service role in API; public read for <audio src>
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-greetings', 'voice-greetings', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "voice_greetings_public_read" ON storage.objects;
CREATE POLICY "voice_greetings_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'voice-greetings');
