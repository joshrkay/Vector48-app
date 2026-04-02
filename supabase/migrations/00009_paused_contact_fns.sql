-- ---------------------------------------------------------------------------
-- Atomic helpers for managing paused_contact_ids inside recipe_activations.config.
--
-- Read-modify-write in application code is susceptible to race conditions
-- when multiple contacts are paused concurrently for the same activation.
-- These functions perform a single UPDATE with no application-level read,
-- making them safe under concurrent calls.
-- ---------------------------------------------------------------------------

-- Atomically append a contact ID to the paused_contact_ids JSONB array.
-- Idempotent: no-op if the contact ID is already present.
CREATE OR REPLACE FUNCTION add_paused_contact_id(
  p_activation_id UUID,
  p_contact_id    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE recipe_activations
  SET config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{paused_contact_ids}',
    COALESCE(config -> 'paused_contact_ids', '[]'::jsonb)
      || CASE
           WHEN COALESCE(config -> 'paused_contact_ids', '[]'::jsonb) @> to_jsonb(p_contact_id)
           THEN '[]'::jsonb           -- already present → append nothing
           ELSE to_jsonb(p_contact_id)
         END
  )
  WHERE id = p_activation_id;
END;
$$;

-- Atomically remove a contact ID from the paused_contact_ids JSONB array.
-- Idempotent: no-op if the contact ID is not present.
CREATE OR REPLACE FUNCTION remove_paused_contact_id(
  p_activation_id UUID,
  p_contact_id    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE recipe_activations
  SET config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{paused_contact_ids}',
    COALESCE(
      (
        SELECT jsonb_agg(elem)
        FROM   jsonb_array_elements(
                 COALESCE(config -> 'paused_contact_ids', '[]'::jsonb)
               ) AS elem
        WHERE  elem <> to_jsonb(p_contact_id)
      ),
      '[]'::jsonb   -- returns '[]' when all elements were removed (jsonb_agg → null)
    )
  )
  WHERE id = p_activation_id;
END;
$$;
