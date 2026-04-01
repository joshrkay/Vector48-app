"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type CRMContactSearchResult = {
  id: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

type CRMContactSearchResponse = {
  contacts?: CRMContactSearchResult[];
};

const fetcher = async (url: string): Promise<CRMContactSearchResponse> => {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Failed to search contacts");
  }

  return res.json();
};

const getContactDisplayName = (contact: CRMContactSearchResult) => {
  if (contact.name?.trim()) return contact.name.trim();

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;

  return contact.email || contact.phone || "Unnamed contact";
};

export function CRMSearchBar() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const searchKey = debouncedQuery
    ? `/api/ghl/contacts/search?q=${encodeURIComponent(debouncedQuery)}`
    : null;

  const { data, isLoading } = useSWR<CRMContactSearchResponse>(searchKey, fetcher, {
    dedupingInterval: 30_000,
    focusThrottleInterval: 30_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const contacts = useMemo(() => data?.contacts ?? [], [data?.contacts]);

  useEffect(() => {
    if (!contacts.length) return;

    contacts.forEach((contact) => {
      const displayName = getContactDisplayName(contact);

      void globalMutate(`/api/ghl/contacts/${contact.id}/name`, displayName, {
        revalidate: false,
        populateCache: true,
      });
    });
  }, [contacts]);

  useEffect(() => {
    if (!contacts.length) {
      setHighlightedIndex(-1);
      return;
    }

    setHighlightedIndex(0);
  }, [contacts]);

  const navigateToContact = (contactId: string) => {
    setIsDropdownOpen(false);
    router.push(`/crm/contacts/${contactId}`);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen && event.key !== "Escape") {
      setIsDropdownOpen(true);
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!contacts.length) return;
      setHighlightedIndex((prev) => (prev + 1) % contacts.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!contacts.length) return;
      setHighlightedIndex((prev) => (prev - 1 + contacts.length) % contacts.length);
      return;
    }

    if (event.key === "Enter") {
      if (highlightedIndex < 0 || highlightedIndex >= contacts.length) return;
      event.preventDefault();
      navigateToContact(contacts[highlightedIndex].id);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsDropdownOpen(false);
    }
  };

  const shouldShowDropdown =
    isDropdownOpen && debouncedQuery.length > 0 && (isLoading || contacts.length > 0);

  return (
    <div className="relative w-full max-w-md">
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsDropdownOpen(true);
        }}
        onFocus={() => setIsDropdownOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search contacts..."
        aria-label="Search contacts"
        autoComplete="off"
      />

      {shouldShowDropdown ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {contacts.map((contact, index) => {
                const displayName = getContactDisplayName(contact);

                return (
                  <li key={contact.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent",
                        highlightedIndex === index && "bg-accent"
                      )}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => navigateToContact(contact.id)}
                    >
                      <span className="font-medium text-foreground">{displayName}</span>
                      {contact.email ? (
                        <span className="text-xs text-muted-foreground">{contact.email}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
