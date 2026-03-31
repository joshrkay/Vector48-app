import { describe, expect, it } from "vitest";
import {
  parseVoiceRouterModelJson,
  stripAssistantJsonFence,
} from "@/lib/voice/routerSchema";

describe("stripAssistantJsonFence", () => {
  it("returns plain JSON as-is", () => {
    expect(stripAssistantJsonFence('{"type":"answer"}')).toBe('{"type":"answer"}');
  });

  it("strips markdown json fence", () => {
    const raw = "```json\n{\"type\":\"navigate\",\"route\":\"/dashboard\",\"message\":\"ok\",\"confidence\":0.9}\n```";
    expect(stripAssistantJsonFence(raw)).toBe(
      '{"type":"navigate","route":"/dashboard","message":"ok","confidence":0.9}',
    );
  });
});

describe("parseVoiceRouterModelJson", () => {
  it("parses valid navigate to allowed route", () => {
    const text = JSON.stringify({
      type: "navigate",
      route: "/dashboard",
      message: "Opening dashboard.",
      confidence: 0.95,
    });
    const out = parseVoiceRouterModelJson(text);
    expect(out.type).toBe("navigate");
    expect(out.route).toBe("/dashboard");
    expect(out.message).toBe("Opening dashboard.");
  });

  it("coerces navigate with disallowed route to clarify", () => {
    const text = JSON.stringify({
      type: "navigate",
      route: "/crm/reports",
      message: "Here you go.",
      confidence: 0.9,
    });
    const out = parseVoiceRouterModelJson(text);
    expect(out.type).toBe("clarify");
    expect(out.route).toBeUndefined();
    expect(out.message).toContain("couldn't find");
  });

  it("allows contact detail route", () => {
    const text = JSON.stringify({
      type: "navigate",
      route: "/crm/contacts/abc-123",
      message: "Opening contact.",
      confidence: 0.88,
    });
    const out = parseVoiceRouterModelJson(text);
    expect(out.type).toBe("navigate");
    expect(out.route).toBe("/crm/contacts/abc-123");
  });

  it("parses answer without route", () => {
    const text = JSON.stringify({
      type: "answer",
      message: "You have 3 active recipes.",
      confidence: 0.7,
    });
    const out = parseVoiceRouterModelJson(text);
    expect(out.type).toBe("answer");
    expect(out.route).toBeUndefined();
  });
});
