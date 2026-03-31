import "server-only";

import { provisionRecipe } from "@/lib/n8n/provision";

/**
 * CORE-08: activate route writes recipe_activations (optimistic active), then runs
 * N8N provisioning here (fire-and-forget). Failures set status error + error_message.
 */
export function enqueueRecipeProvisioning(params: {
  activationId: string;
  accountId: string;
  recipeSlug: string;
  config: Record<string, unknown>;
}): void {
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
