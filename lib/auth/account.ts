import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type AccountRole = Database["public"]["Enums"]["account_role"];

const ROLE_PRIORITY: Record<AccountRole, number> = {
  viewer: 0,
  admin: 1,
};

interface AccountAccessRow {
  accountId: string;
  role: AccountRole;
  createdAt: string | null;
}

export interface AccountSession {
  userId: string;
  accountId: string;
  role: AccountRole;
}

export interface RequireAccountForUserOptions {
  request?: Request;
  requiredRole?: AccountRole;
}

function parseRequestedAccountId(request?: Request): string | null {
  if (!request) return null;

  const fromHeader = request.headers.get("x-account-id")?.trim();
  if (fromHeader) return fromHeader;

  const searchParams = new URL(request.url).searchParams;
  const fromQuery = searchParams.get("account_id")?.trim() ?? searchParams.get("accountId")?.trim();

  return fromQuery || null;
}

function sortAccessRows(a: AccountAccessRow, b: AccountAccessRow): number {
  if (ROLE_PRIORITY[a.role] !== ROLE_PRIORITY[b.role]) {
    return ROLE_PRIORITY[b.role] - ROLE_PRIORITY[a.role];
  }

  const createdAtA = a.createdAt ?? "";
  const createdAtB = b.createdAt ?? "";

  if (createdAtA !== createdAtB) {
    return createdAtA.localeCompare(createdAtB);
  }

  return a.accountId.localeCompare(b.accountId);
}

function pickAccountAccess(
  memberships: AccountAccessRow[],
  requestedAccountId: string | null,
): AccountAccessRow | null {
  if (memberships.length === 0) return null;

  if (requestedAccountId) {
    return memberships.find((row) => row.accountId === requestedAccountId) ?? null;
  }

  return [...memberships].sort(sortAccessRows)[0] ?? null;
}

async function loadAccountAccessRows(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AccountAccessRow[]> {
  const [{ data: membershipRows }, { data: ownedAccounts }] = await Promise.all([
    supabase
      .from("account_users")
      .select("account_id, role, created_at")
      .eq("user_id", userId),
    supabase
      .from("accounts")
      .select("id, created_at")
      .eq("owner_user_id", userId),
  ]);

  const rows = new Map<string, AccountAccessRow>();

  for (const membership of membershipRows ?? []) {
    rows.set(membership.account_id, {
      accountId: membership.account_id,
      role: membership.role,
      createdAt: membership.created_at,
    });
  }

  for (const account of ownedAccounts ?? []) {
    const existing = rows.get(account.id);
    const ownerRow: AccountAccessRow = {
      accountId: account.id,
      role: "admin",
      createdAt: account.created_at,
    };

    if (!existing) {
      rows.set(account.id, ownerRow);
      continue;
    }

    if (ROLE_PRIORITY[ownerRow.role] > ROLE_PRIORITY[existing.role]) {
      rows.set(account.id, ownerRow);
    }
  }

  return Array.from(rows.values());
}

function hasRequiredRole(role: AccountRole, requiredRole?: AccountRole): boolean {
  if (!requiredRole) return true;
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY[requiredRole];
}

export async function requireAccountForUser(
  supabase: SupabaseClient<Database>,
  options: RequireAccountForUserOptions = {},
): Promise<AccountSession | null> {
  const result = await requireAccountForUserWithRole(supabase, options);
  return result === "forbidden" ? null : result;
}

export async function requireAccountForUserWithRole(
  supabase: SupabaseClient<Database>,
  options: RequireAccountForUserOptions = {},
): Promise<AccountSession | "forbidden" | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const memberships = await loadAccountAccessRows(supabase, user.id);
  const requestedAccountId = parseRequestedAccountId(options.request);
  const account = pickAccountAccess(memberships, requestedAccountId);

  if (!account) return null;
  if (!hasRequiredRole(account.role, options.requiredRole)) return "forbidden";

  return { userId: user.id, accountId: account.accountId, role: account.role };
}
