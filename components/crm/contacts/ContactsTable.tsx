"use client";

import { useRouter } from "next/navigation";
import { MessageSquare, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  deriveStage,
  nonStageTags,
  STAGE_CONFIG,
  displayName,
  getInitials,
  formatRelativeTime,
} from "./contactUtils";
import type { GHLContact } from "@/lib/ghl/types";

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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Phone</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Activity</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stage</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tags</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
              <th className="w-8 px-4 py-3" aria-label="AI" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contacts.map((contact) => {
              const stage = deriveStage(contact.tags);
              const stageConfig = stage ? STAGE_CONFIG[stage] : null;
              const extraTags = nonStageTags(contact.tags);
              const isAI = aiContactIds.has(contact.id);
              const name = displayName(contact);

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
                      <span className="font-medium text-foreground">{name}</span>
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
                    {stageConfig ? (
                      <Badge
                        className={cn(
                          "border-0 font-normal",
                          stageConfig.className,
                        )}
                      >
                        {stageConfig.label}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Tags */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {extraTags.length > 0 ? (
                        <>
                          {extraTags.slice(0, 3).map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="font-normal"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {extraTags.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{extraTags.length - 3}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>

                  {/* Source */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {contact.source ?? "—"}
                  </td>

                  {/* AI badge + quick actions */}
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
                            router.push(
                              `/crm/contacts/${contact.id}?tab=notes`,
                            );
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-gray-100 hover:text-foreground"
                          aria-label="Add note"
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
