import "server-only";

import { provisionRecipe } from "@/lib/n8n/provision";
import { isGhlNative } from "@/lib/recipes/engineRegistry";

/**
 * CORE-08: activate route writes recipe_activations (optimistic active), then runs
 * provisioning here (fire-and-forget).
 *
 * GHL-native recipes skip n8n entirely — the activation row (status: active) is
 * all they need. The trigger sweep routes them to the GHL executor at runtime.
 *
 * N8N recipes go through the full n8n workflow provisioning pipeline.
 */
export function enqueueRecipeProvisioning(params: {
  activationId: string;
  accountId: string;
  recipeSlug: string;
  config: Record<string, unknown>;
}): void {
  // GHL-native recipes don't need external workflow provisioning.
  // The activation row is already inserted with status "active" by the caller.
  if (isGhlNative(params.recipeSlug)) {
    console.log(
      JSON.stringify({
        level: "info",
        service: "recipes",
        event: "ghl_native_provisioned",
        activationId: params.activationId,
        recipeSlug: params.recipeSlug,
      }),
    );
    return;
  }

  void provisionRecipe(
    params.accountId,
    params.recipeSlug,
    params.config,
    params.activationId,
  ).catch((err: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        service: "n8n",
        event: "provisioning_failed",
        activationId: params.activationId,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  });
}
