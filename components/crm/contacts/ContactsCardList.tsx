"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  deriveStage,
  STAGE_CONFIG,
  displayName,
  getInitials,
  formatRelativeTime,
} from "./contactUtils";
import type { GHLContact } from "@/lib/ghl/types";

interface ContactsCardListProps {
  contacts: GHLContact[];
  aiContactIds: Set<string>;
}

export function ContactsCardList({ contacts, aiContactIds }: ContactsCardListProps) {
  const router = useRouter();

  return (
    <ul className="space-y-2">
      {contacts.map((contact) => {
        const stage = deriveStage(contact.tags);
        const stageConfig = stage ? STAGE_CONFIG[stage] : null;
        const isAI = aiContactIds.has(contact.id);
        const name = displayName(contact);

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
                    {name}
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
                  {stageConfig && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        stageConfig.className,
                      )}
                    >
                      {stageConfig.label}
                    </span>
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
