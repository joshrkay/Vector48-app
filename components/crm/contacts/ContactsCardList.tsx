"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GHLContact } from "@/lib/ghl/types";

// ── Helpers (mirrors ContactsTable) ───────────────────────────────────────

const STAGE_TAGS = ["New Lead", "Contacted", "Active Customer", "Inactive"];

const STAGE_COLORS: Record<string, string> = {
  "New Lead": "bg-blue-50 text-blue-700 border-blue-200",
  "Contacted": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Active Customer": "bg-green-50 text-green-700 border-green-200",
  "Inactive": "bg-gray-50 text-gray-600 border-gray-200",
};

function getStageFromContact(contact: GHLContact): string | null {
  const tag = contact.tags.find((t) => STAGE_TAGS.includes(t));
  return tag ?? contact.type ?? null;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString();
}

function getInitials(contact: GHLContact): string {
  const first = contact.firstName?.[0] ?? "";
  const last = contact.lastName?.[0] ?? "";
  return (first + last).toUpperCase() || "?";
}

// ── Component ──────────────────────────────────────────────────────────────

interface ContactsCardListProps {
  contacts: GHLContact[];
  aiContactIds: Set<string>;
}

export function ContactsCardList({ contacts, aiContactIds }: ContactsCardListProps) {
  const router = useRouter();

  return (
    <ul className="space-y-2">
      {contacts.map((contact) => {
        const stage = getStageFromContact(contact);
        const stageColor = stage
          ? (STAGE_COLORS[stage] ?? "bg-gray-50 text-gray-600 border-gray-200")
          : null;
        const isAI = aiContactIds.has(contact.id);
        const displayName =
          contact.name ??
          `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() ||
          "Unknown";

        return (
          <li key={contact.id}>
            <button
              onClick={() => router.push(`/crm/contacts/${contact.id}`)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-white p-4 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
            >
              {/* Avatar */}
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {getInitials(contact)}
              </span>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate font-semibold text-foreground">
                    {displayName}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isAI && (
                      <span
                        className="h-2 w-2 rounded-full bg-teal-500"
                        title="Active AI recipe"
                        aria-label="Active AI recipe"
                      />
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(contact.dateUpdated)}
                    </span>
                  </div>
                </div>

                <div className="mt-1 flex items-center gap-2">
                  {contact.phone && (
                    <span className="text-sm text-muted-foreground">
                      {contact.phone}
                    </span>
                  )}
                  {stage && (
                    <Badge
                      className={cn("border text-xs font-normal", stageColor)}
                    >
                      {stage}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
