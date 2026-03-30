import { describe, expect, it } from "vitest";
import {
  injectVariables,
  UnreplacedTemplateVariableError,
} from "@/lib/n8n/variableInjector";

describe("injectVariables", () => {
  it("replaces placeholders and returns parsed JSON", () => {
    const raw = '{"a":"{{TENANT_ID}}","b":1}';
    const out = injectVariables(raw, { TENANT_ID: "uuid-1" }) as {
      a: string;
      b: number;
    };
    expect(out.a).toBe("uuid-1");
    expect(out.b).toBe(1);
  });

  it("replaces every occurrence of the same placeholder", () => {
    const raw = '{"a":"{{X}}","b":"{{X}}"}';
    const out = injectVariables(raw, { X: "same" }) as { a: string; b: string };
    expect(out.a).toBe("same");
    expect(out.b).toBe("same");
  });

  it("throws UnreplacedTemplateVariableError when placeholders remain", () => {
    const raw = '{"x":"{{A}}","y":"{{B}}"}';
    expect(() => injectVariables(raw, { A: "1" })).toThrow(
      UnreplacedTemplateVariableError,
    );
  });

  it("includes remaining variable names on UnreplacedTemplateVariableError", () => {
    const raw = '{"x":"{{A}}","y":"{{B}}","z":"{{C}}"}';
    try {
      injectVariables(raw, { A: "1" });
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(UnreplacedTemplateVariableError);
      expect((e as UnreplacedTemplateVariableError).names.sort()).toEqual([
        "B",
        "C",
      ]);
    }
  });
});
