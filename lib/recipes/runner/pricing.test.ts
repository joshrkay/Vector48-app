import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeCostMicros, formatUsd, isKnownModel } from "./pricing.ts";

describe("computeCostMicros", () => {
  it("prices Haiku 4.5 in/out tokens correctly", () => {
    // 1k input + 500 output @ Haiku ($1/MTok in, $5/MTok out)
    //   1000 * 1 + 500 * 5 = 3500 micros
    const cost = computeCostMicros("claude-haiku-4-5", {
      inputTokens: 1000,
      outputTokens: 500,
    });
    assert.equal(cost, 3500);
  });

  it("prices Sonnet 4.6 in/out tokens correctly", () => {
    // 1k input + 1k output @ Sonnet ($3/MTok in, $15/MTok out)
    //   1000 * 3 + 1000 * 15 = 18000 micros
    const cost = computeCostMicros("claude-sonnet-4-6", {
      inputTokens: 1000,
      outputTokens: 1000,
    });
    assert.equal(cost, 18000);
  });

  it("prices Opus 4.6 in/out tokens correctly", () => {
    // 100 input + 100 output @ Opus ($15/MTok in, $75/MTok out)
    //   100 * 15 + 100 * 75 = 9000 micros
    const cost = computeCostMicros("claude-opus-4-6", {
      inputTokens: 100,
      outputTokens: 100,
    });
    assert.equal(cost, 9000);
  });

  it("includes cache read and write tokens", () => {
    // Haiku: 100 in, 100 out, 1000 cache-read, 200 cache-write
    //   100 * 1 + 100 * 5 + 1000 * 0.1 + 200 * 1.25
    //   = 100 + 500 + 100 + 250 = 950 micros
    const cost = computeCostMicros("claude-haiku-4-5", {
      inputTokens: 100,
      outputTokens: 100,
      cacheReadTokens: 1000,
      cacheWriteTokens: 200,
    });
    assert.equal(cost, 950);
  });

  it("returns 0 and warns for an unknown model", () => {
    const original = console.warn;
    let warned = false;
    console.warn = () => {
      warned = true;
    };
    try {
      const cost = computeCostMicros("claude-future-9000", {
        inputTokens: 1000,
        outputTokens: 1000,
      });
      assert.equal(cost, 0);
      assert.equal(warned, true);
    } finally {
      console.warn = original;
    }
  });

  it("rounds to the nearest integer micro", () => {
    // 1 cache-read token @ $0.10/MTok = 0.1 micros → rounds to 0
    const cost = computeCostMicros("claude-haiku-4-5", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1,
    });
    assert.equal(cost, 0);

    // 5 cache-read tokens = 0.5 micros → rounds to 1
    const cost2 = computeCostMicros("claude-haiku-4-5", {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 5,
    });
    assert.equal(cost2, 1);
  });
});

describe("formatUsd", () => {
  it("formats sub-dollar amounts with 4 decimals", () => {
    assert.equal(formatUsd(3500), "$0.0035");
  });

  it("formats >= $1 amounts with 2 decimals", () => {
    assert.equal(formatUsd(1_500_000), "$1.50");
  });
});

describe("isKnownModel", () => {
  it("returns true for known models", () => {
    assert.equal(isKnownModel("claude-haiku-4-5"), true);
    assert.equal(isKnownModel("claude-sonnet-4-6"), true);
    assert.equal(isKnownModel("claude-opus-4-6"), true);
  });

  it("returns false for unknown models", () => {
    assert.equal(isKnownModel("gpt-4o"), false);
    assert.equal(isKnownModel(""), false);
  });
});
