import "server-only";

/**
 * Platform-operator gate. `account_users.role = 'admin'` is per-account
 * (tenant-internal owner). This flag is different: it controls access to
 * /admin/ops, which surfaces cross-tenant metrics and must never leak to
 * customer admins.
 *
 * The allowlist is env-var driven (comma-separated emails) so we can
 * add/remove operators without a deploy or a DB migration.
 */
export function isOpsAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.OPS_ADMIN_EMAILS?.trim();
  if (!raw) return false;
  const allowlist = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}
