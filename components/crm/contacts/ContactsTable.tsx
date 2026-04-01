"use client";

import { useRouter } from "next/navigation";
import { MessageSquare, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GHLContact } from "@/lib/ghl/types";

// ── Helpers ────────────────────────────────────────────────────────────────

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

interface ContactsTableProps {
  contacts: GHLContact[];
  aiContactIds: Set<string>;
}

export function ContactsTable({ contacts, aiContactIds }: ContactsTableProps) {
  const router = useRouter();

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-white shadow-[0_1px_0_0_hsl(var(--border))]">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Phone
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Last Activity
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Stage
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Tags
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Source
              </th>
              <th className="w-8 px-4 py-3" aria-label="AI" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contacts.map((contact) => {
              const stage = getStageFromContact(contact);
              const stageColor = stage ? (STAGE_COLORS[stage] ?? "bg-gray-50 text-gray-600 border-gray-200") : null;
              const nonStageTags = contact.tags.filter((t) => !STAGE_TAGS.includes(t));
              const isAI = aiContactIds.has(contact.id);

              return (
                <tr
                  key={contact.id}
                  onClick={() => router.push(`/crm/contacts/${contact.id}`)}
                  className="group cursor-pointer transition-colors hover:bg-gray-50"
                >
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {getInitials(contact)}
                      </span>
                      <span className="font-medium text-foreground">
                        {contact.name ?? `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || "—"}
                      </span>
                    </div>
                  </td>

                  {/* Phone */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {contact.phone ?? "—"}
                  </td>

                  {/* Last Activity */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatRelativeTime(contact.dateUpdated)}
                  </td>

                  {/* Stage */}
                  <td className="px-4 py-3">
                    {stage ? (
                      <Badge className={cn("border font-normal", stageColor)}>
                        {stage}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Tags */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {nonStageTags.length > 0 ? (
                        nonStageTags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="font-normal">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {nonStageTags.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{nonStageTags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Source */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {contact.source ?? "—"}
                  </td>

                  {/* AI Badge + Quick Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* Quick actions: visible on row hover */}
                      <div className="invisible flex items-center gap-1 group-hover:visible">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/crm/inbox?contactId=${contact.id}`);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-gray-100 hover:text-foreground"
                          aria-label="Message"
                          title="Message"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/crm/contacts/${contact.id}?tab=notes`);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-gray-100 hover:text-foreground"
                          aria-label="Note"
                          title="Add note"
                        >
                          <StickyNote className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* AI dot */}
                      {isAI && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-teal-500"
                          title="Active AI recipe"
                          aria-label="Active AI recipe"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
