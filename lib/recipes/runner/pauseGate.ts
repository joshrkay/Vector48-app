// ---------------------------------------------------------------------------
// Pause-for-contact gate
//
// Operators can pause automation for a specific contact via
// `/api/recipes/pause-for-contact`, which appends the contact id into
// `recipe_activations.config.paused_contact_ids` through the atomic
// `add_paused_contact_id` RPC (migration 00009).
//
// Before runRecipe dispatches to a handler, we consult that list and
// short-circuit with `skipped_paused_for_contact` if the contact is
// present. Without this check the automation fires anyway and
// double-SMSes the customer the operator just asked us to pause
// (qa/audits/A4-recipes.md BUG-3).
//
// extractContactId() reads whatever shape of trigger the runner
// receives. Schedule-driven triggers (seasonal campaigns) pass no
// contact id and we simply return null — the gate never fires.
// ---------------------------------------------------------------------------

/**
 * Minimal Supabase-shaped client used to read the activation row. The
 * real admin client satisfies this shape; tests inject a shim.
 */
export interface PauseGateSupabaseClient {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        eq: (col: string, value: string) => {
          maybeSingle: () => Promise<{
            data: { config: Record<string, unknown> | null } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

/**
 * Best-effort extraction of a contact identifier from an unknown
 * trigger. Every SMS-factory trigger nests it at
 * `trigger.trigger_data.contact_id`; the call-completed webhook carries
 * it at `trigger.call.contact.id`. Anything else returns null.
 */
export function extractContactId(trigger: unknown): string | null {
  if (!trigger || typeof trigger !== "object") return null;

  const t = trigger as {
    trigger_data?: { contact_id?: unknown };
    call?: { contact?: { id?: unknown; contactId?: unknown } };
  };

  const fromTriggerData = t.trigger_data?.contact_id;
  if (typeof fromTriggerData === "string" && fromTriggerData.length > 0) {
    return fromTriggerData;
  }

  const fromCall = t.call?.contact?.id ?? t.call?.contact?.contactId;
  if (typeof fromCall === "string" && fromCall.length > 0) {
    return fromCall;
  }

  return null;
}

/**
 * Returns true when `contactId` appears in the activation's
 * `paused_contact_ids` list. Fails open on read errors so a Supabase
 * hiccup can't block automation — the pause_for_contact feature is
 * best-effort, not a security gate, and the operator can always
 * disable the recipe entirely.
 */
export async function isContactPaused(
  accountId: string,
  recipeSlug: string,
  contactId: string,
  injected?: PauseGateSupabaseClient,
): Promise<boolean> {
  let supabase: PauseGateSupabaseClient;
  if (injected) {
    supabase = injected;
  } else {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    supabase = getSupabaseAdmin() as unknown as PauseGateSupabaseClient;
  }

  const { data, error } = await supabase
    .from("recipe_activations")
    .select("config")
    .eq("account_id", accountId)
    .eq("recipe_slug", recipeSlug)
    .maybeSingle();

  if (error || !data) return false;

  const config = data.config ?? {};
  const raw = (config as Record<string, unknown>).paused_contact_ids;
  if (!Array.isArray(raw)) return false;

  return raw.some((entry) => entry === contactId);
}
