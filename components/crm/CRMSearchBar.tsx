"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "@/hooks/useSWR";
import { Search } from "lucide-react";
import useSWR from "swr";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { upsertContactsInCache } from "@/lib/crm/contactCache";
import {
  type CRMContactSearchItem,
  type CRMContactSearchResponse,
} from "@/lib/crm/types";

async function searchContacts([endpoint, query]: readonly unknown[]) {
  if (typeof endpoint !== "string" || typeof query !== "string") {
    return [];
  }

  const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    throw new Error("Failed to search contacts");
  }

  const payload = (await res.json()) as {
    items?: CRMContactSearchItem[];
    contacts?: CRMContactSearchItem[];
  };

  return payload.items ?? payload.contacts ?? [];
}

export function CRMSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: contacts = [], isLoading } = useSWR<CRMContactSearchItem[]>(
    debouncedQuery ? ["/api/ghl/contacts/search", debouncedQuery] : null,
    searchContacts,
    {
      dedupingInterval: 30_000,
      revalidateOnFocus: false,
      revalidateIfStale: false,
      keepPreviousData: true,
    }
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const visibleContacts = useMemo(() => contacts, [contacts]);

  useEffect(() => {
    if (contacts.length) {
      upsertContactsInCache(contacts);
    }
  }, [contacts]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  const handleSelect = (contact: CRMContactSearchItem) => {
    upsertContactsInCache([contact]);
    setQuery("");
    setDebouncedQuery("");
    setOpen(false);
    router.push(`/crm/contacts/${contact.id}`);
  };

  return (
    <div className="relative w-full max-w-xl">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <Input
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open || !visibleContacts.length) {
            if (event.key === "Escape") setOpen(false);
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % visibleContacts.length);
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + visibleContacts.length) % visibleContacts.length);
          }

          if (event.key === "Enter") {
            event.preventDefault();
            handleSelect(visibleContacts[selectedIndex]);
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
        placeholder="Search contacts by name, phone, or email..."
        className="pl-9"
      />

      {open && debouncedQuery ? (
        <div className="absolute z-30 mt-2 w-full rounded-lg border bg-white shadow-lg">
          {isLoading || isValidating ? (
            <p className="px-3 py-2 text-sm text-[var(--text-secondary)]">Searching...</p>
          ) : visibleContacts.length ? (
            <ul className="max-h-80 overflow-auto py-1">
              {visibleContacts.map((contact: CRMContactSearchItem, index: number) => (
                <li key={contact.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full px-3 py-2 text-left",
                      index === selectedIndex ? "bg-[var(--v48-accent-light)]" : "hover:bg-gray-50"
                    )}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => handleSelect(contact)}
                  >
                    <p className="text-sm font-medium">{contact.name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{contact.email ?? contact.phone ?? "No email or phone"}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-[var(--text-secondary)]">No contacts found.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
