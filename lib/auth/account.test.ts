import { describe, expect, it } from "vitest";

import { requireAccountForUserWithRole } from "@/lib/auth/account";

type MembershipRow = {
  account_id: string;
  role: "admin" | "viewer";
  created_at: string;
  user_id: string;
};

type AccountRow = {
  id: string;
  owner_user_id: string;
  created_at: string;
};

function createSupabaseMock({
  userId,
  memberships = [],
  ownedAccounts = [],
}: {
  userId: string | null;
  memberships?: MembershipRow[];
  ownedAccounts?: AccountRow[];
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from: (table: "account_users" | "accounts") => {
      const state: { userId?: string } = {};

      const execute = async () => {
        if (table === "account_users") {
          return {
            data: memberships.filter((row) => row.user_id === state.userId),
            error: null,
          };
        }

        return {
          data: ownedAccounts.filter((row) => row.owner_user_id === state.userId),
          error: null,
        };
      };

      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          if (column === "user_id" || column === "owner_user_id") {
            state.userId = value;
          }
          return builder;
        },
        then: (onFulfilled: (value: Awaited<ReturnType<typeof execute>>) => unknown) =>
          execute().then(onFulfilled),
      };

      return builder;
    },
  };
}

describe("requireAccountForUserWithRole", () => {
  it("allows owners to manage billing even without account_users membership", async () => {
    const supabase = createSupabaseMock({
      userId: "owner-1",
      ownedAccounts: [
        { id: "acct-owned", owner_user_id: "owner-1", created_at: "2025-01-01T00:00:00.000Z" },
      ],
    });

    const session = await requireAccountForUserWithRole(supabase as never, {
      requiredRole: "admin",
    });

    expect(session).toEqual({ userId: "owner-1", accountId: "acct-owned", role: "admin" });
  });

  it("allows admin members and blocks viewer members for admin-only routes", async () => {
    const adminSupabase = createSupabaseMock({
      userId: "user-1",
      memberships: [
        {
          account_id: "acct-admin",
          role: "admin",
          created_at: "2025-02-01T00:00:00.000Z",
          user_id: "user-1",
        },
      ],
    });

    const viewerSupabase = createSupabaseMock({
      userId: "user-2",
      memberships: [
        {
          account_id: "acct-viewer",
          role: "viewer",
          created_at: "2025-02-02T00:00:00.000Z",
          user_id: "user-2",
        },
      ],
    });

    await expect(
      requireAccountForUserWithRole(adminSupabase as never, { requiredRole: "admin" }),
    ).resolves.toEqual({ userId: "user-1", accountId: "acct-admin", role: "admin" });

    await expect(
      requireAccountForUserWithRole(viewerSupabase as never, { requiredRole: "admin" }),
    ).resolves.toBe("forbidden");
  });

  it("selects a deterministic active account for multi-account users", async () => {
    const supabase = createSupabaseMock({
      userId: "user-3",
      memberships: [
        {
          account_id: "acct-viewer-older",
          role: "viewer",
          created_at: "2025-01-01T00:00:00.000Z",
          user_id: "user-3",
        },
        {
          account_id: "acct-admin-newer",
          role: "admin",
          created_at: "2025-03-01T00:00:00.000Z",
          user_id: "user-3",
        },
      ],
    });

    const session = await requireAccountForUserWithRole(supabase as never, {
      requiredRole: "viewer",
    });

    expect(session).toEqual({
      userId: "user-3",
      accountId: "acct-admin-newer",
      role: "admin",
    });
  });

  it("respects explicit account selection for multi-account users", async () => {
    const supabase = createSupabaseMock({
      userId: "user-4",
      memberships: [
        {
          account_id: "acct-a",
          role: "admin",
          created_at: "2025-01-01T00:00:00.000Z",
          user_id: "user-4",
        },
        {
          account_id: "acct-b",
          role: "admin",
          created_at: "2025-01-02T00:00:00.000Z",
          user_id: "user-4",
        },
      ],
    });

    const request = new Request("https://example.test/api/billing/portal?accountId=acct-b");
    const session = await requireAccountForUserWithRole(supabase as never, {
      request,
      requiredRole: "admin",
    });

    expect(session).toEqual({ userId: "user-4", accountId: "acct-b", role: "admin" });
  });
});
