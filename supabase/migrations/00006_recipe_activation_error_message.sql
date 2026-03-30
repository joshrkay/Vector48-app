-- Provisioning failure details for N8N and other deploy steps
ALTER TABLE recipe_activations
  ADD COLUMN IF NOT EXISTS error_message text;
