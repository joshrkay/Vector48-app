/**
 * Relative / calendar phrasing for activity timestamps (no date-fns dependency).
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const sec = Math.floor(diffMs / 1000);
  const min = Math.floor(sec / 60);

  if (sec < 60) return "Just now";
  if (min < 60) return `${min} min ago`;
  if (diffMs < 24 * 60 * 60 * 1000) {
    const h = Math.max(1, Math.floor(min / 60));
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (then >= startOfYesterday && then < startOfToday) {
    const t = then.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return `Yesterday at ${t}`;
  }

  if (then.getFullYear() === now.getFullYear()) {
    return then.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return then.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
