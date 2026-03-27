// ---------------------------------------------------------------------------
// GoHighLevel — Tier Configuration Loader
// Loads pricing_config for an account's plan_slug and caches in memory (60s).
// Server-only.
// ---------------------------------------------------------------------------

import { createAdminClient } from "../supabase/admin";

// ── Types ─────────────────────────────────────────────────────────────────

export interface TierConfig {
  cacheTTL: number;
  webhooksEnabled: boolean;
  rateLimitBudget: number;
  maxActiveRecipes: number | null;
}

// ── Priority → budget mapping ─────────────────────────────────────────────

const RATE_LIMIT_BUDGETS: Record<string, number> = {
  low: 60,
  standard: 90,
  high: 110,
};

// ── In-memory cache (60 s TTL) ────────────────────────────────────────────

const CONFIG_TTL_MS = 60_000;

interface CachedEntry {
  config: TierConfig;
  expiresAt: number;
}

const configCache = new Map<string, CachedEntry>();

// ── Default config (fallback if DB query fails) ───────────────────────────

const DEFAULT_CONFIG: TierConfig = {
  cacheTTL: 300,
  webhooksEnabled: false,
  rateLimitBudget: 60,
  maxActiveRecipes: 3,
};

// ── Public API ────────────────────────────────────────────────────────────

export async function getTierConfig(accountId: string): Promise<TierConfig> {
  const cached = configCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  const config = await loadTierConfig(accountId);

  configCache.set(accountId, {
    config,
    expiresAt: Date.now() + CONFIG_TTL_MS,
  });

  return config;
}

// ── Internal ──────────────────────────────────────────────────────────────

async function loadTierConfig(accountId: string): Promise<TierConfig> {
  const supabase = createAdminClient();

  // Step 1: Get the account's plan_slug
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("plan_slug")
    .eq("id", accountId)
    .single();

  if (accountError || !account) {
    console.error(
      `[tierConfig] Failed to load account ${accountId}:`,
      accountError?.message,
    );
    return DEFAULT_CONFIG;
  }

  // Step 2: Get the pricing config for that plan
  const { data: pricing, error: pricingError } = await supabase
    .from("pricing_config")
    .select("ghl_cache_ttl_secs, webhooks_enabled, rate_limit_priority, max_active_recipes")
    .eq("plan_slug", account.plan_slug)
    .single();

  if (pricingError || !pricing) {
    console.error(
      `[tierConfig] Failed to load pricing_config for plan ${account.plan_slug}:`,
      pricingError?.message,
    );
    return DEFAULT_CONFIG;
  }

  return {
    cacheTTL: pricing.ghl_cache_ttl_secs,
    webhooksEnabled: pricing.webhooks_enabled,
    rateLimitBudget: RATE_LIMIT_BUDGETS[pricing.rate_limit_priority] ?? 60,
    maxActiveRecipes: pricing.max_active_recipes,
  };
}
