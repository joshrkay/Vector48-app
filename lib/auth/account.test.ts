import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAccountForUser } from "@/lib/auth/account";

type Membership = { account_id: string; role: "admin" | "viewer" };

let cookieAccountId: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookieAccountId ? { value: cookieAccountId } : undefined),
  }),
}));

function createSupabaseMock(input: {
  userId?: string;
  memberships?: Membership[];
}) {
  const memberships = input.memberships ?? [];
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: input.userId ? { id: input.userId } : null } })),
    },
    from: vi.fn((table: string) => {
      if (table !== "account_users") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: memberships })),
          })),
        })),
      };
    }),
  } as never;
}

describe("requireAccountForUser", () => {
  beforeEach(() => {
    cookieAccountId = null;
  });

  it("resolves owner/admin membership", async () => {
    const supabase = createSupabaseMock({
      userId: "user-owner",
      memberships: [{ account_id: "acct-owner", role: "admin" }],
    });

    await expect(requireAccountForUser(supabase)).resolves.toEqual({
      userId: "user-owner",
      accountId: "acct-owner",
      role: "admin",
    });
  });

  it("resolves viewer membership", async () => {
    const supabase = createSupabaseMock({
      userId: "user-viewer",
      memberships: [{ account_id: "acct-view", role: "viewer" }],
    });

    await expect(requireAccountForUser(supabase)).resolves.toEqual({
      userId: "user-viewer",
      accountId: "acct-view",
      role: "viewer",
    });
  });

  it("uses deterministic first-membership fallback for multi-account users", async () => {
    const supabase = createSupabaseMock({
      userId: "user-multi",
      memberships: [
        { account_id: "acct-a", role: "admin" },
        { account_id: "acct-b", role: "viewer" },
      ],
    });

    const result = await requireAccountForUser(supabase);
    expect(result?.accountId).toBe("acct-a");
    expect(result?.role).toBe("admin");
  });

  it("supports validated explicit account selection from query/header/cookie", async () => {
    cookieAccountId = "acct-cookie";
    const supabase = createSupabaseMock({
      userId: "user-multi",
      memberships: [
        { account_id: "acct-cookie", role: "viewer" },
        { account_id: "acct-query", role: "admin" },
      ],
    });

    const fromQuery = await requireAccountForUser(supabase, {
      request: new Request("https://example.com/app?accountId=acct-query", {
        headers: { "x-account-id": "acct-cookie" },
      }),
    });
    expect(fromQuery?.accountId).toBe("acct-query");

    const fromHeader = await requireAccountForUser(supabase, {
      request: new Request("https://example.com/app", {
        headers: { "x-account-id": "acct-cookie" },
      }),
    });
    expect(fromHeader?.accountId).toBe("acct-cookie");

    const fromCookie = await requireAccountForUser(supabase);
    expect(fromCookie?.accountId).toBe("acct-cookie");

    const invalidSelection = await requireAccountForUser(supabase, {
      request: new Request("https://example.com/app?accountId=acct-missing"),
    });
    expect(invalidSelection).toBeNull();
  });
});
