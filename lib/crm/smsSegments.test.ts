import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countSmsSegments } from "./smsSegments.ts";

describe("countSmsSegments", () => {
  it("returns 0 for empty", () => {
    assert.equal(countSmsSegments(""), 0);
  });
  it("single segment up to 160", () => {
    assert.equal(countSmsSegments("a".repeat(160)), 1);
  });
  it("multi-part uses 153 divisor after first", () => {
    assert.equal(countSmsSegments("a".repeat(161)), 2);
  });
});
