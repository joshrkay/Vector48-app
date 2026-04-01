"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { Button } from "@/components/ui/button";
import { ContactsFilterBar } from "./ContactsFilterBar";
import { ContactsTable } from "./ContactsTable";
import { ContactsCardList } from "./ContactsCardList";
import { AddContactSheet } from "./AddContactSheet";
import type { GHLContact } from "@/lib/ghl/types";

interface ContactsClientShellProps {
  initialContacts: GHLContact[];
  initialNextCursor: string | null;
  aiContactIds: string[];
  filter: string;
  accountId: string;
}

export function ContactsClientShell({
  initialContacts,
  initialNextCursor,
  aiContactIds,
  filter,
}: ContactsClientShellProps) {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? undefined;

  const [contacts, setContacts] = useState<GHLContact[]>(initialContacts);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const aiSet = new Set(aiContactIds);
  const isFetchingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const loadMore = useCallback(async () => {
    if (!nextCursor || isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set("cursor", nextCursor);
      if (filter !== "all") params.set("filter", filter);
      if (q) params.set("q", q);
      const res = await fetch(`/api/ghl/contacts?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        contacts: GHLContact[];
        nextCursor: string | null;
      };
      setContacts((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...data.contacts.filter((c) => !seen.has(c.id))];
      });
      setNextCursor(data.nextCursor);
    } finally {
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [nextCursor, filter, q]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "240px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore]);

  function handleContactAdded(contact: GHLContact) {
    setContacts((prev) => [contact, ...prev]);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <ContactsFilterBar currentFilter={filter} />
        <Button size="sm" className="shrink-0" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Contact
        </Button>
      </div>

      {/* Contact list */}
      {contacts.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No contacts found.
        </p>
      ) : isDesktop ? (
        <ContactsTable contacts={contacts} aiContactIds={aiSet} />
      ) : (
        <ContactsCardList contacts={contacts} aiContactIds={aiSet} />
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" aria-hidden />

      {isLoadingMore && (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Loading…
        </p>
      )}
      {!nextCursor && contacts.length > 0 && !isLoadingMore && (
        <p className="pb-4 text-center text-xs text-muted-foreground">
          All contacts loaded
        </p>
      )}

      <AddContactSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={handleContactAdded}
      />
    </div>
  );
}
