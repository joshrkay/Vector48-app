/** n8n entry for app-fired scheduled recipe runs (query params for routing). */
export const RECIPE_SCHEDULED_WEBHOOK_PATH = "/webhook/ghl/recipe-scheduled-trigger";

export function verifyCronBearer(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  return token.length > 0 && token === secret;
}

export function buildRecipeScheduledWebhookUrl(
  n8nBaseUrl: string,
  recipeId: string,
  accountId: string,
): string {
  const base = n8nBaseUrl.replace(/\/$/, "");
  const q = new URLSearchParams({
    recipe_id: recipeId,
    account_id: accountId,
  });
  return `${base}${RECIPE_SCHEDULED_WEBHOOK_PATH}?${q.toString()}`;
}

export type RecipeTriggerWebhookBody = {
  account_id: string;
  trigger_data: Record<string, unknown>;
};

export function buildRecipeTriggerPostBody(
  accountId: string,
  payload: Record<string, unknown> | null,
): RecipeTriggerWebhookBody {
  const trigger_data =
    payload !== null && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
  return { account_id: accountId, trigger_data };
}
