import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export interface AccountSession {
  userId: string;
  accountId: string;
  role: Database["public"]["Tables"]["account_users"]["Row"]["role"];
}

export interface RequireAccountForUserOptions {
  request?: Request;
  selectedAccountId?: string | null;
  searchParams?: Record<string, string | string[] | undefined>;
}

function getAccountIdFromQuery(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get("accountId") ?? searchParams.get("account_id");
  const normalized = raw?.trim();
  return normalized ? normalized : null;
}

function getExplicitAccountIdFromRecord(
  searchParams?: Record<string, string | string[] | undefined>,
): string | null {
  if (!searchParams) return null;
  const value = searchParams.accountId ?? searchParams.account_id;
  if (Array.isArray(value)) {
    const normalized = value[0]?.trim();
    return normalized ? normalized : null;
  }
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

async function getCookieAccountId(): Promise<string | null> {
  try {
    const nextHeaders = await import("next/headers");
    const cookieStore = await nextHeaders.cookies();
    const normalized = cookieStore.get("selected_account_id")?.value?.trim();
    return normalized ? normalized : null;
  } catch {
    return null;
  }
}

async function resolveExplicitAccountId(
  options?: RequireAccountForUserOptions,
): Promise<string | null> {
  const normalizedOption = options?.selectedAccountId?.trim();
  if (normalizedOption) return normalizedOption;

  if (options?.request) {
    try {
      const url = new URL(options.request.url);
      const fromQuery = getAccountIdFromQuery(url.searchParams);
      if (fromQuery) return fromQuery;
    } catch {
      // Ignore malformed request URLs and continue to other selectors.
    }

    const fromHeader = options.request.headers.get("x-account-id")?.trim();
    if (fromHeader) return fromHeader;
  }

  const fromSearchParams = getExplicitAccountIdFromRecord(options?.searchParams);
  if (fromSearchParams) return fromSearchParams;

  return getCookieAccountId();
}

export async function requireAccountForUser(
  supabase: SupabaseClient<Database>,
  options?: RequireAccountForUserOptions,
): Promise<AccountSession | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const explicitAccountId = await resolveExplicitAccountId(options);
  const { data: memberships } = await supabase
    .from("account_users")
    .select("account_id, role")
    .eq("user_id", user.id)
    .order("account_id", { ascending: true });

  if (!memberships || memberships.length === 0) {
    return null;
  }

  const selectedMembership = explicitAccountId
    ? memberships.find((membership) => membership.account_id === explicitAccountId)
    : memberships[0];
  if (!selectedMembership) {
    return null;
  }

  return {
    userId: user.id,
    accountId: selectedMembership.account_id,
    role: selectedMembership.role,
  };
}
