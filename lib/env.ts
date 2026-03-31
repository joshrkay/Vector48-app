/**
 * Canonical app origin for redirects, OAuth redirect_uri, and public URLs.
 */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return raw.replace(/\/$/, "");
}
