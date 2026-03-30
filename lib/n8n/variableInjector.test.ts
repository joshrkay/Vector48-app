import { describe, expect, it } from "vitest";

import {
  injectVariables,
  UnreplacedPlaceholdersError,
} from "./variableInjector";

describe("injectVariables", () => {
  it("replaces placeholders in serialized JSON", () => {
    const out = injectVariables(
      '{"a":"{{T}}","nested":"{{LONG}}"}',
      { T: "x", LONG: "yy" },
    );
    expect(out).toEqual({ a: "x", nested: "yy" });
  });

  it("throws when placeholders remain", () => {
    expect(() => injectVariables('{"x":"{{MISS}}"}', {})).toThrow(
      UnreplacedPlaceholdersError,
    );
  });
});
