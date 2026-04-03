export type RecipeActivationRow = {
  id: string;
  status: string;
  webhook_id: string | null;
};

export type GhlWebhookDeleteResult = Promise<{ ok: true } | { error: string }>;

export type DeactivateRecipeEnv = {
  getActivation: () => Promise<{
    data: RecipeActivationRow | null;
    errorMessage: string | null;
  }>;
  getGhlIntegration: () => Promise<{
    data: { credentials_encrypted: unknown } | null;
    errorMessage: string | null;
  }>;
  deleteWebhook: (token: string, webhookId: string) => GhlWebhookDeleteResult;
  markInactive: (
    activationId: string,
    deactivatedAt: string,
  ) => Promise<{ errorMessage: string | null }>;
};

export type DeactivateRecipeOutcome = {
  status: number;
  body: Record<string, unknown>;
};

export async function runDeactivateRecipe(
  resolveGhlToken: (credentials: unknown) => string | null,
  env: DeactivateRecipeEnv,
): Promise<DeactivateRecipeOutcome> {
  const { data: activation, errorMessage: activationErr } = await env.getActivation();
  if (activationErr) {
    return { status: 500, body: { error: activationErr } };
  }
  if (!activation) {
    return { status: 404, body: { error: "Recipe activation not found" } };
  }
  if (activation.status === "inactive") {
    return {
      status: 200,
      body: { ok: true, activation_id: activation.id, already_inactive: true },
    };
  }

  // Always validate GHL credentials — required whether or not there is a
  // webhook to delete, so deactivation can't silently succeed against an
  // account whose integration has been removed.
  const { data: integration, errorMessage: integrationErr } = await env.getGhlIntegration();
  if (integrationErr) {
    return { status: 500, body: { error: integrationErr } };
  }
  if (!integration?.credentials_encrypted) {
    return {
      status: 412,
      body: { error: "No connected GHL credentials for this account" },
    };
  }

  const token = resolveGhlToken(integration.credentials_encrypted);
  if (!token) {
    return {
      status: 412,
      body: { error: "No connected GHL credentials for this account" },
    };
  }

  // Only delete the GHL outbound webhook if one was registered.
  if (activation.webhook_id) {
    const del = await env.deleteWebhook(token, activation.webhook_id);
    if ("error" in del) {
      return { status: 502, body: { error: del.error } };
    }
  }

  const deactivatedAt = new Date().toISOString();
  const { errorMessage: updateErr } = await env.markInactive(activation.id, deactivatedAt);
  if (updateErr) {
    return { status: 500, body: { error: updateErr } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      activation_id: activation.id,
      deactivated_at: deactivatedAt,
    },
  };
}
