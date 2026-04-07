import { isGhlNative } from "@/lib/recipes/engineRegistry";

const RECIPE_SCHEDULED_WEBHOOK_PATH = "/webhook/ghl/recipe-scheduled-trigger";

function buildRecipeScheduledWebhookUrl(
  n8nBaseUrl: string,
  recipeSlug: string,
  accountId: string,
): string {
  const base = n8nBaseUrl.replace(/\/$/, "");
  const q = new URLSearchParams({
    recipe_id: recipeSlug,
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
  recipe_slug: string;
  payload: Record<string, unknown> | null;
  attempt_count: number;
};

export type RecipeTriggerStore = {
  listDue: (params: { nowIso: string; limit: number }) => Promise<RecipeTriggerRow[]>;
  claim: (id: string) => Promise<boolean>;
  hasActiveActivation: (accountId: string, recipeSlug: string) => Promise<boolean>;
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

/**
 * GHL-native executor function signature.
 * Injected as a dependency so the sweep stays testable without importing
 * server-only modules (Supabase, GHL client) in unit tests.
 */
export type GhlNativeExecutorFn = (params: {
  accountId: string;
  recipeSlug: string;
  contactId: string;
  triggerData: Record<string, unknown>;
}) => Promise<{ ok: boolean; error?: string }>;

type SweepDeps = {
  n8nBaseUrl: string;
  nowIso: string;
  batchLimit: number;
  store: RecipeTriggerStore;
  fetcher: typeof fetch;
  /** Executor for GHL-native recipes. When absent, GHL-native triggers are skipped. */
  ghlExecutor?: GhlNativeExecutorFn;
};

export async function runRecipeTriggerSweep(deps: SweepDeps): Promise<SweepResult> {
  const n8nBase = deps.n8nBaseUrl.trim();
  // n8n base URL is only required if there are n8n recipes; we check per-trigger below.

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
      isActive = await deps.store.hasActiveActivation(row.account_id, row.recipe_slug);
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

    // ── Route: GHL-native or n8n ────────────────────────────────────────
    const useGhlNative = isGhlNative(row.recipe_slug);

    if (useGhlNative) {
      if (!deps.ghlExecutor) {
        await markFailed("GHL-native executor not available");
        continue;
      }

      const triggerData = row.payload ?? {};
      const contactId = (triggerData.contact_id as string) ?? (triggerData.contactId as string) ?? "";

      if (!contactId) {
        await markFailed("Trigger payload missing contact_id for GHL-native recipe");
        continue;
      }

      try {
        const result = await deps.ghlExecutor({
          accountId: row.account_id,
          recipeSlug: row.recipe_slug,
          contactId,
          triggerData,
        });

        if (!result.ok) {
          await markFailed(result.error ?? "GHL-native execution failed");
          continue;
        }
      } catch (error) {
        await markFailed(error instanceof Error ? error.message : "GHL-native execution error");
        continue;
      }
    } else {
      // n8n path — requires base URL
      if (!n8nBase) {
        await markFailed("N8N_BASE_URL is not configured");
        continue;
      }

      const url = buildRecipeScheduledWebhookUrl(n8nBase, row.recipe_slug, row.account_id);
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
