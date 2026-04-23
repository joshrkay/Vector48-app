import { describe, expect, it } from "vitest";

import { resolveContactsEmptyState } from "./contactsEmptyState";

describe("resolveContactsEmptyState", () => {
  it("is hidden when contacts are present — the table renders instead", () => {
    const state = resolveContactsEmptyState({
      contactsCount: 5,
      ghlConnected: true,
      ghlUnavailableReason: null,
    });
    expect(state.variant).toBe("hidden");
  });

  it("prompts to connect GHL when the account has not linked it yet", () => {
    const state = resolveContactsEmptyState({
      contactsCount: 0,
      ghlConnected: false,
      ghlUnavailableReason: null,
    });
    expect(state.variant).toBe("ghl_not_connected");
    if (state.variant === "ghl_not_connected") {
      expect(state.ctaHref).toBe("/settings");
      expect(state.ctaLabel).toMatch(/settings/i);
      // The body should explicitly mention GoHighLevel so the user knows
      // where the contacts come from.
      expect(state.body.toLowerCase()).toContain("gohighlevel");
    }
  });

  it("surfaces the GHL error + reconnect CTA when GHL returned an error at fetch time", () => {
    const state = resolveContactsEmptyState({
      contactsCount: 0,
      ghlConnected: true,
      ghlUnavailableReason: "token expired",
    });
    expect(state.variant).toBe("ghl_error");
    if (state.variant === "ghl_error") {
      expect(state.body).toContain("token expired");
      expect(state.ctaLabel).toMatch(/reconnect/i);
    }
  });

  it("shows the 'truly empty' state when GHL is connected, healthy, and returned zero rows", () => {
    const state = resolveContactsEmptyState({
      contactsCount: 0,
      ghlConnected: true,
      ghlUnavailableReason: null,
    });
    expect(state.variant).toBe("empty_synced");
  });

  it("prefers the not-connected state over the error state when both are somehow true", () => {
    // Defensive: if the caller passes ghlConnected=false AND an error reason,
    // we still want to lead with 'connect' — a disconnected account can't
    // produce a runtime fetch error anyway.
    const state = resolveContactsEmptyState({
      contactsCount: 0,
      ghlConnected: false,
      ghlUnavailableReason: "stale",
    });
    expect(state.variant).toBe("ghl_not_connected");
  });
});
