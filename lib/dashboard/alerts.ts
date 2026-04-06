export function isAlertResolved(
  detail: Record<string, unknown> | null | undefined,
): boolean {
  const resolved = detail?.resolved;
  return resolved === true || resolved === "true";
}
