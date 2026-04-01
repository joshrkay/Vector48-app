"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const FILTERS = [
  { label: "All", value: "all" },
  { label: "New Lead", value: "new_lead" },
  { label: "Contacted", value: "contacted" },
  { label: "Active Customer", value: "active_customer" },
  { label: "Inactive", value: "inactive" },
];

interface ContactsFilterBarProps {
  currentFilter: string;
}

export function ContactsFilterBar({ currentFilter }: ContactsFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleFilter(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("filter");
    } else {
      params.set("filter", value);
    }
    router.push(`/crm/contacts?${params.toString()}`);
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => handleFilter(f.value)}
          className={cn(
            "whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors",
            currentFilter === f.value
              ? "bg-primary text-primary-foreground"
              : "border border-input bg-background text-muted-foreground hover:bg-gray-50 hover:text-foreground",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
