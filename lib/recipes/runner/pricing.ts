// ---------------------------------------------------------------------------
// Anthropic Model Pricing
//
// Cost per token for each model the recipe runner uses. Stored as USD
// micros (1 USD = 1_000_000 micros).
//
// A model priced at $X / MTok is exactly X micros per token, so $1/MTok
// -> 1, $5/MTok -> 5, $3/MTok -> 3, and so on. The sub-dollar cache rates
// ($0.10/MTok, $1.25/MTok) become 0.1 and 1.25 — floating-point values
// per-token. We accept float math at the per-token level because:
//
//   (1) computeCostMicros() always Math.round()s the final sum, so the
//       value written to the bigint cost_micros column is an integer.
//   (2) double precision has ~15 significant digits, which is several
//       orders of magnitude more than any single recipe call can consume
//       (even a 1M-token Opus run is well inside safe-integer range).
//
// The aggregation that actually matters for cost accuracy (monthly spend)
// is done in Postgres via get_monthly_spend_micros() summing bigints —
// no float drift there either. See migration 00011_agent_runner.sql.
//
// Source: https://www.anthropic.com/pricing  (verify quarterly)
// ---------------------------------------------------------------------------

export interface ModelPricing {
  /** Micros per input token */
  inputMicros: number;
  /** Micros per output token */
  outputMicros: number;
  /** Micros per cache-read token (typically 10% of input) */
  cacheReadMicros: number;
  /** Micros per cache-write token (typically 125% of input) */
  cacheWriteMicros: number;
}

// Per-token prices in USD micros. A model that costs $X per million tokens
// is exactly X micros per token (since $1 = 1_000_000 micros).
const haiku45: ModelPricing = {
  inputMicros: 1, // $1 / MTok
  outputMicros: 5, // $5 / MTok
  cacheReadMicros: 0.1, // $0.10 / MTok
  cacheWriteMicros: 1.25, // $1.25 / MTok
};

const PRICING: Record<string, ModelPricing> = {
  // Claude Haiku 4.5
  "claude-haiku-4-5": haiku45,
  "claude-haiku-4-5-20251001": haiku45,

  // Claude Sonnet 4.6 — $3 / $15 per MTok in/out
  "claude-sonnet-4-6": {
    inputMicros: 3,
    outputMicros: 15,
    cacheReadMicros: 0.3,
    cacheWriteMicros: 3.75,
  },

  // Claude Opus 4.6 — $15 / $75 per MTok in/out
  "claude-opus-4-6": {
    inputMicros: 15,
    outputMicros: 75,
    cacheReadMicros: 1.5,
    cacheWriteMicros: 18.75,
  },
};

export interface UsageCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/**
 * Compute the cost of a single Claude API call in USD micros (1 USD =
 * 1_000_000 micros). Returns 0 if the model is unknown — we never want
 * pricing lookup to be fatal in production, but we do warn so the caller
 * adds the new model to the table.
 */
export function computeCostMicros(model: string, usage: UsageCounts): number {
  const pricing = PRICING[model];
  if (!pricing) {
    // eslint-disable-next-line no-console
    console.warn(
      `[recipes/runner/pricing] unknown model ${model} — cost recorded as 0`,
    );
    return 0;
  }

  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;

  // Each *Micros field is per-token. Round to nearest integer micro so we
  // never emit fractional values into the bigint column.
  return Math.round(
    usage.inputTokens * pricing.inputMicros +
      usage.outputTokens * pricing.outputMicros +
      cacheRead * pricing.cacheReadMicros +
      cacheWrite * pricing.cacheWriteMicros,
  );
}

/** USD-formatted helper for dashboards. Input is micros. */
export function formatUsd(micros: number): string {
  const dollars = micros / 1_000_000;
  return `$${dollars.toFixed(dollars < 1 ? 4 : 2)}`;
}

export function isKnownModel(model: string): boolean {
  return model in PRICING;
}
