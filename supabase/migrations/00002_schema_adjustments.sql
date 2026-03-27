-- Vector 48 — Schema Adjustments
-- Adds missing columns, fixes seed data, allows unlimited recipes via NULL.

-- =============================================================================
-- PRICING_CONFIG — allow NULL for unlimited recipes
-- =============================================================================

ALTER TABLE pricing_config ALTER COLUMN max_active_recipes DROP NOT NULL;
ALTER TABLE pricing_config ALTER COLUMN max_active_recipes DROP DEFAULT;

-- =============================================================================
-- ACCOUNTS — add missing columns
-- =============================================================================

ALTER TABLE accounts ADD COLUMN ghl_sub_account_id text;
ALTER TABLE accounts ADD COLUMN stripe_subscription_id text;

-- Partial indexes for webhook/billing lookups
CREATE INDEX idx_accounts_ghl_sub_account
  ON accounts(ghl_sub_account_id)
  WHERE ghl_sub_account_id IS NOT NULL;

CREATE INDEX idx_accounts_stripe_subscription
  ON accounts(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- =============================================================================
-- SEED DATA — align with pricing requirements
-- =============================================================================

-- starter: 3 recipes, no webhooks, 300s cache, low priority
UPDATE pricing_config SET
  monthly_price_cents  = 4900,
  max_active_recipes   = 3,
  webhooks_enabled     = false,
  ghl_cache_ttl_secs   = 300,
  rate_limit_priority  = 'low',
  stripe_price_id      = 'price_placeholder_starter'
WHERE plan_slug = 'starter';

-- growth: unlimited recipes (NULL), webhooks enabled, 60s cache, high priority
UPDATE pricing_config SET
  monthly_price_cents  = 14900,
  max_active_recipes   = NULL,
  webhooks_enabled     = true,
  ghl_cache_ttl_secs   = 60,
  rate_limit_priority  = 'high',
  stripe_price_id      = 'price_placeholder_growth'
WHERE plan_slug = 'growth';

-- trial stays as-is: free, 3 recipes, no webhooks, 300s cache, low priority
