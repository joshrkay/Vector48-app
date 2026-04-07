import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAccountForUserWithRole = vi.fn();
const createServerClient = vi.fn();

vi.mock("@/lib/auth/account", () => ({
  requireAccountForUserWithRole,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient,
}));

vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    subscriptions: { update: vi.fn() },
  },
}));

describe("billing routes auth + role enforcement", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAccountForUserWithRole.mockReset();
    createServerClient.mockReset();
    createServerClient.mockResolvedValue({});
  });

  it.each([
    ["create checkout", "@/app/api/billing/create-checkout/route"],
    ["billing portal", "@/app/api/billing/portal/route"],
    ["cancel subscription", "@/app/api/billing/cancel/route"],
  ])("returns 403 when session role is viewer for %s", async (_label, routePath) => {
    requireAccountForUserWithRole.mockResolvedValue("forbidden");
    const { POST } = await import(routePath);

    const req = new Request("https://example.test/api/billing?accountId=acct-1", {
      method: "POST",
      body: JSON.stringify({ planSlug: "starter" }),
    });
    const response = await POST(req as never);

    expect(response.status).toBe(403);
    expect(requireAccountForUserWithRole).toHaveBeenCalledWith({}, {
      request: req,
      requiredRole: "admin",
    });
  });

  it.each([
    ["create checkout", "@/app/api/billing/create-checkout/route"],
    ["billing portal", "@/app/api/billing/portal/route"],
    ["cancel subscription", "@/app/api/billing/cancel/route"],
  ])("returns 401 when user has no owner/admin membership for %s", async (_label, routePath) => {
    requireAccountForUserWithRole.mockResolvedValue(null);
    const { POST } = await import(routePath);

    const response = await POST(
      new Request("https://example.test/api/billing", {
        method: "POST",
      }) as never,
    );

    expect(response.status).toBe(401);
  });
});
