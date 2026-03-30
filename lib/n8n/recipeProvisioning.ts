import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * CORE-12: wire real N8N workflow deploy here. Runs after HTTP response (fire-and-forget).
 */
export function enqueueRecipeProvisioning(params: {
  activationId: string;
  accountId: string;
  recipeSlug: string;
}): void {
  void runProvisioningStub(params).catch((err: unknown) => {
    console.error("[n8n] provisioning failed", {
      activationId: params.activationId,
      err: err instanceof Error ? err.message : String(err),
    });
  });
}

async function runProvisioningStub(params: {
  activationId: string;
  accountId: string;
  recipeSlug: string;
}): Promise<void> {
  await new Promise<void>((r) => {
    setTimeout(r, 0);
  });

  const admin = getSupabaseAdmin();
  const workflowId = `stub-${params.recipeSlug}-${params.activationId.slice(0, 8)}`;

  const { error } = await admin
    .from("recipe_activations")
    .update({ n8n_workflow_id: workflowId })
    .eq("id", params.activationId)
    .eq("account_id", params.accountId);

  if (error) {
    console.error("[n8n] stub update workflow id failed", error.message);
    await admin
      .from("recipe_activations")
      .update({ status: "error" })
      .eq("id", params.activationId)
      .eq("account_id", params.accountId);
  }
}

export function enqueueRecipeDeprovisioning(params: {
  activationId: string;
  accountId: string;
  n8nWorkflowId: string | null;
}): void {
  void Promise.resolve().then(() => {
    console.log("[n8n] deprovision stub", {
      activationId: params.activationId,
      workflowId: params.n8nWorkflowId,
    });
  });
}
