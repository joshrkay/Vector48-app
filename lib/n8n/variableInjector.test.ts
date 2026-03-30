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

  it("throws when placeholders remain", () => {
    const raw = '{"x":"{{A}}","y":"{{B}}"}';
    expect(() => injectVariables(raw, { A: "1" })).toThrow(
      UnreplacedTemplateVariableError,
    );
  });
});
