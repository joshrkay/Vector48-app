/**
 * Parse `account_id` from GET /api/recipes/status query string.
 */
export function parseAccountIdFromRecipeStatusUrl(requestUrl: string): string | null {
  const accountId = new URL(requestUrl).searchParams.get("account_id")?.trim();
  return accountId && accountId.length > 0 ? accountId : null;
}
