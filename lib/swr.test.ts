import { describe, expect, it } from "vitest";
import { getBackoffDelay } from "./swr";

describe("getBackoffDelay", () => {
  const BASE = 30_000;

  it("returns the base interval when there are no errors", () => {
    expect(getBackoffDelay(BASE, 0)).toBe(30_000);
  });

  it("doubles the interval after 1 consecutive error", () => {
    expect(getBackoffDelay(BASE, 1)).toBe(60_000);
  });

  it("quadruples after 2 consecutive errors", () => {
    expect(getBackoffDelay(BASE, 2)).toBe(120_000);
  });

  it("8x after 3 consecutive errors", () => {
    expect(getBackoffDelay(BASE, 3)).toBe(240_000);
  });

  it("caps at the default max of 300_000ms", () => {
    expect(getBackoffDelay(BASE, 4)).toBe(300_000);
    expect(getBackoffDelay(BASE, 10)).toBe(300_000);
  });

  it("respects a custom max delay", () => {
    expect(getBackoffDelay(10_000, 5, 60_000)).toBe(60_000);
  });

  it("works with a 10s base interval (MessageThread polling)", () => {
    expect(getBackoffDelay(10_000, 0)).toBe(10_000);
    expect(getBackoffDelay(10_000, 1)).toBe(20_000);
    expect(getBackoffDelay(10_000, 2)).toBe(40_000);
    expect(getBackoffDelay(10_000, 5)).toBe(300_000);
  });
});
