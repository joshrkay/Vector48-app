import { describe, expect, it } from "vitest";
import {
  parseEstimateAuditModelJson,
  parseEstimateAuditToolInput,
  stripAssistantJsonFence,
} from "./parseModelJson";

describe("stripAssistantJsonFence", () => {
  it("returns raw string when no fence", () => {
    expect(stripAssistantJsonFence('{"a":1}')).toBe('{"a":1}');
  });

  it("strips json code fence", () => {
    const raw = '```json\n{"suggestions":[],"totalPotentialValue":0}\n```';
    expect(stripAssistantJsonFence(raw)).toBe(
      '{"suggestions":[],"totalPotentialValue":0}',
    );
  });
});

describe("parseEstimateAuditModelJson", () => {
  it("parses valid JSON and recomputes total", () => {
    const text = JSON.stringify({
      suggestions: [
        { item: "A", reason: "r", estimatedValue: 10 },
        { item: "B", reason: "r2", estimatedValue: 20.5 },
      ],
      totalPotentialValue: 999,
    });
    const r = parseEstimateAuditModelJson(text);
    expect(r.totalPotentialValue).toBe(30.5);
    expect(r.suggestions).toHaveLength(2);
  });
});

describe("parseEstimateAuditToolInput", () => {
  it("validates tool input and recomputes total", () => {
    const r = parseEstimateAuditToolInput({
      suggestions: [{ item: "X", reason: "y", estimatedValue: 100 }],
      totalPotentialValue: 100,
    });
    expect(r.totalPotentialValue).toBe(100);
  });

  it("throws on invalid input", () => {
    expect(() =>
      parseEstimateAuditToolInput({ suggestions: "bad" }),
    ).toThrow();
  });
});
