-- Recipe activations: provisioning errors + deactivated lifecycle for N8N

DO $$ BEGIN
  ALTER TYPE recipe_status ADD VALUE 'deactivated';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE recipe_activations
  ADD COLUMN IF NOT EXISTS error_message text;

COMMENT ON COLUMN recipe_activations.error_message IS 'Last N8N provisioning or runtime error (sanitized, no secrets).';
COMMENT ON COLUMN recipe_activations.n8n_workflow_id IS 'n8n workflow id when provisioned; NULL while pending or after delete.';
