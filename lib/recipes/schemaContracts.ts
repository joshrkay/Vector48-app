export const RECIPE_ACTIVATIONS_CANONICAL_COLUMNS = [
  "id",
  "account_id",
  "recipe_slug",
  "status",
  "config",
  "n8n_workflow_id",
  "activated_at",
  "last_triggered_at",
  "deactivated_at",
  "error_message",
] as const;

export const RECIPE_TRIGGERS_CANONICAL_COLUMNS = [
  "id",
  "account_id",
  "recipe_slug",
  "status",
  "fire_at",
  "payload",
  "attempt_count",
  "last_error",
  "processed_at",
  "created_at",
] as const;

export const RECIPE_TRIGGER_CANONICAL_PENDING_STATUS = "queued" as const;

/**
 * Compatibility columns supported only for rollback windows.
 * New code paths should not depend on these.
 */
export const RECIPE_TRIGGER_COMPAT_COLUMNS = ["recipe_id", "fired", "trigger_data", "retry_count"] as const;
