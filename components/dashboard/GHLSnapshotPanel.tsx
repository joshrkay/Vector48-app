"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const BAR_COLORS = [
  "#DCE5FF",
  "#C9D9FF",
  "#B3CBFF",
  "#9BB9FF",
  "#84A7FF",
  "#6B94FF",
  "#4D7BFF",
];

type NewContactsWidget = {
  count: number;
  dailyBreakdown: Array<{ label: string; count: number }>;
};

type OpenOpportunitiesWidget = {
  count: number;
  totalValue: number;
};

type UnreadConversationsWidget = {
  count: number;
};

type RecentContactsWidget = Array<{
  id?: string;
  name: string;
  phone: string;
  addedAt: string | Date;
}>;

type UpcomingAppointmentsWidget = Array<{
  id?: string;
  contact: string;
  startsAt: string | Date;
  status: string;
}>;

export type GHLSnapshot = {
  lastSynced: string | Date | null;
  newContacts: NewContactsWidget | null;
  openOpportunities: OpenOpportunitiesWidget | null;
  unreadConversations: UnreadConversationsWidget | null;
  recentContacts: RecentContactsWidget | null;
  upcomingAppointments: UpcomingAppointmentsWidget | null;
};

interface GHLSnapshotPanelProps {
  snapshot: GHLSnapshot;
  className?: string;
}

function getSyncedLabel(lastSynced: string | Date | null): string {
  if (!lastSynced) return "Last synced --";

  const date = new Date(lastSynced);
  if (Number.isNaN(date.getTime())) return "Last synced --";

  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - date.getTime()) / 60000),
  );

  if (diffMinutes < 1) return "Last synced just now";
  if (diffMinutes === 1) return "Last synced 1 minute ago";

  return `Last synced ${diffMinutes} minutes ago`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function relativeDate(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  const diffMs = date.getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (Math.abs(diffDays) < 1) return "Today";

  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    diffDays,
    "day",
  );
}

function localTime(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSevenDayBreakdown(data: Array<{ label: string; count: number }>) {
  const trimmed = data.slice(-7);

  if (trimmed.length === 7) return trimmed;

  const placeholders = Array.from({ length: 7 - trimmed.length }, (_, index) => ({
    label: `p-${index}`,
    count: 0,
  }));

  return [...placeholders, ...trimmed];
}

function WidgetFrame({
  title,
  isNull,
  children,
}: {
  title: string;
  isNull: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--v48-border)] bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        {isNull ? (
          <span className="text-xs text-[var(--text-secondary)]">Sync issue</span>
        ) : null}
      </div>
      {isNull ? <p className="font-heading text-2xl font-bold">--</p> : children}
    </div>
  );
}

function SnapshotWidgets({ snapshot }: { snapshot: GHLSnapshot }) {
  const {
    newContacts,
    openOpportunities,
    unreadConversations,
    recentContacts,
    upcomingAppointments,
  } = snapshot;

  const chartData = getSevenDayBreakdown(newContacts?.dailyBreakdown ?? []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
      <WidgetFrame title="New Contacts" isNull={newContacts === null}>
        <p className="font-heading text-2xl font-bold">{newContacts?.count ?? "--"}</p>
        <div className="mt-3 h-16 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" hide />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </WidgetFrame>

      <WidgetFrame title="Open Opportunities" isNull={openOpportunities === null}>
        <p className="font-heading text-2xl font-bold">{openOpportunities?.count ?? "--"}</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {openOpportunities ? formatCurrency(openOpportunities.totalValue) : "--"}
        </p>
      </WidgetFrame>

      <WidgetFrame title="Unread Conversations" isNull={unreadConversations === null}>
        <p className="font-heading text-2xl font-bold">
          {unreadConversations?.count ?? "--"}
        </p>
        <Link
          href="/crm/inbox?filter=unread"
          className="mt-1 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          View unread inbox
        </Link>
      </WidgetFrame>

      <WidgetFrame title="Recent Contacts" isNull={recentContacts === null}>
        <div className="space-y-2">
          {(recentContacts ?? []).slice(0, 5).map((contact, idx) => (
            <div
              key={contact.id ?? `${contact.phone}-${idx}`}
              className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2"
            >
              <p className="text-sm font-medium">{contact.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">{contact.phone}</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Added {relativeDate(contact.addedAt)}
              </p>
            </div>
          ))}
        </div>
      </WidgetFrame>

      <WidgetFrame title="Upcoming Appointments" isNull={upcomingAppointments === null}>
        <div className="space-y-2">
          {(upcomingAppointments ?? []).slice(0, 5).map((appointment, idx) => (
            <div
              key={appointment.id ?? `${appointment.contact}-${idx}`}
              className="flex items-center justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{appointment.contact}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {localTime(appointment.startsAt)}
                </p>
              </div>
              <Badge variant="secondary" className="capitalize">
                {appointment.status}
              </Badge>
            </div>
          ))}
        </div>
      </WidgetFrame>
    </div>
  );
}

export function GHLSnapshotPanel({ snapshot, className }: GHLSnapshotPanelProps) {
  const allWidgetsNull =
    snapshot.newContacts === null &&
    snapshot.openOpportunities === null &&
    snapshot.unreadConversations === null &&
    snapshot.recentContacts === null &&
    snapshot.upcomingAppointments === null;

  return (
    <aside className={cn("w-full lg:order-last", className)}>
      <div className="rounded-2xl border border-[var(--v48-border)] bg-[var(--bg-secondary)] p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">GHL Snapshot</h2>
          <p className="text-xs text-[var(--text-secondary)]">{getSyncedLabel(snapshot.lastSynced)}</p>
        </div>

        {allWidgetsNull ? (
          <div className="rounded-xl border border-dashed border-[var(--v48-border)] bg-white p-5 text-center text-sm text-[var(--text-secondary)]">
            Data temporarily unavailable
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <SnapshotWidgets snapshot={snapshot} />
            </div>

            <details className="rounded-xl border border-[var(--v48-border)] bg-white lg:hidden" open>
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
                Snapshot details
              </summary>
              <div className="p-3 pt-0">
                <SnapshotWidgets snapshot={snapshot} />
              </div>
            </details>
          </>
        )}
      </div>
    </aside>
  );
}

export default GHLSnapshotPanel;
