const RECIPE_SCHEDULED_WEBHOOK_PATH = "/webhook/ghl/recipe-scheduled-trigger";

function buildRecipeScheduledWebhookUrl(
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

function buildRecipeTriggerPostBody(
  accountId: string,
  payload: Record<string, unknown> | null,
): { account_id: string; trigger_data: Record<string, unknown> } {
  const trigger_data =
    payload !== null && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
  return { account_id: accountId, trigger_data };
}

export type RecipeTriggerRow = {
  id: string;
  account_id: string;
  recipe_id: string;
  payload: Record<string, unknown> | null;
  attempt_count: number;
};

export type RecipeTriggerStore = {
  listDue: (params: { nowIso: string; limit: number }) => Promise<RecipeTriggerRow[]>;
  claim: (id: string) => Promise<boolean>;
  hasActiveActivation: (accountId: string, recipeId: string) => Promise<boolean>;
  markFailed: (
    id: string,
    payload: { message: string; processedAt: string; attemptCount: number },
  ) => Promise<void>;
  markCompleted: (id: string, processedAt: string) => Promise<void>;
};

export type SweepSuccess = {
  ok: true;
  processed: number;
  failed: number;
  skipped: number;
  batch_limit: number;
};

export type SweepFailure = {
  ok: false;
  status: number;
  error: string;
};

export type SweepResult = SweepSuccess | SweepFailure;

type SweepDeps = {
  n8nBaseUrl: string;
  nowIso: string;
  batchLimit: number;
  store: RecipeTriggerStore;
  fetcher: typeof fetch;
};

export async function runRecipeTriggerSweep(deps: SweepDeps): Promise<SweepResult> {
  const n8nBase = deps.n8nBaseUrl.trim();
  if (!n8nBase) {
    return { ok: false, status: 500, error: "N8N_BASE_URL is not configured" };
  }

  let due: RecipeTriggerRow[];
  try {
    due = await deps.store.listDue({ nowIso: deps.nowIso, limit: deps.batchLimit });
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Failed to list due triggers",
    };
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due) {
    let claimed = false;
    try {
      claimed = await deps.store.claim(row.id);
    } catch (error) {
      return {
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message : "Failed to claim trigger",
      };
    }

    if (!claimed) {
      skipped += 1;
      continue;
    }

    const markFailed = async (message: string) => {
      await deps.store.markFailed(row.id, {
        message,
        processedAt: deps.nowIso,
        attemptCount: row.attempt_count + 1,
      });
      failed += 1;
    };

    let isActive = false;
    try {
      isActive = await deps.store.hasActiveActivation(row.account_id, row.recipe_id);
    } catch (error) {
      return {
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message : "Failed to read activation",
      };
    }

    if (!isActive) {
      await markFailed("No active recipe activation for this account and recipe");
      continue;
    }

    const url = buildRecipeScheduledWebhookUrl(n8nBase, row.recipe_id, row.account_id);
    const body = buildRecipeTriggerPostBody(row.account_id, row.payload);

    let response: Response;
    try {
      response = await deps.fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      await markFailed(error instanceof Error ? error.message : "Webhook request failed");
      continue;
    }

    if (!response.ok) {
      await markFailed(`Webhook returned HTTP ${response.status}`);
      continue;
    }

    try {
      await deps.store.markCompleted(row.id, deps.nowIso);
    } catch (error) {
      return {
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message : "Failed to complete trigger",
      };
    }

    processed += 1;
  }

  return {
    ok: true,
    processed,
    failed,
    skipped,
    batch_limit: deps.batchLimit,
  };
}
