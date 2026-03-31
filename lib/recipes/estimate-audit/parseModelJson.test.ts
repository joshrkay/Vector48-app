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
  it("parses valid JSON, rounds values, and recomputes total", () => {
    const text = JSON.stringify({
      suggestions: [
        {
          category: "missed_item",
          item: "A",
          reason: "r",
          estimatedValue: 10,
          confidence: "high",
          priority: "high",
        },
        {
          category: "upsell",
          item: "B",
          reason: "r2",
          estimatedValue: 63,
          confidence: "medium",
          priority: "low",
        },
      ],
      summary: "Looks mostly complete.",
      totalPotentialValue: 999,
    });
    const r = parseEstimateAuditModelJson(text);
    expect(r.suggestions[0]?.estimatedValue).toBe(0);
    expect(r.suggestions[1]?.estimatedValue).toBe(75);
    expect(r.totalPotentialValue).toBe(75);
    expect(r.summary).toBe("Looks mostly complete.");
    expect(r.suggestions).toHaveLength(2);
  });
});

describe("parseEstimateAuditToolInput", () => {
  it("validates tool input and recomputes rounded total", () => {
    const r = parseEstimateAuditToolInput({
      suggestions: [
        {
          category: "pricing_flag",
          item: "X",
          reason: "y",
          estimatedValue: 88,
          confidence: "low",
          priority: "medium",
        },
      ],
      summary: "One notable pricing issue.",
      totalPotentialValue: 100,
    });
    expect(r.suggestions[0]?.estimatedValue).toBe(100);
    expect(r.totalPotentialValue).toBe(100);
    expect(r.summary).toBe("One notable pricing issue.");
  });

  it("throws on invalid input", () => {
    expect(() =>
      parseEstimateAuditToolInput({ suggestions: "bad" }),
    ).toThrow();
  });
});
