"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface RecipeFilterProps {
  accountId: string;
  initialRecipes?: string[];
}

export function RecipeFilter({ accountId, initialRecipes = [] }: RecipeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("recipe") ?? "all";
  const [recipes, setRecipes] = useState<string[]>(initialRecipes);

  useEffect(() => {
    const supabase = createBrowserClient();
    void supabase
      .from("recipe_activations")
      .select("recipe_slug")
      .eq("account_id", accountId)
      .eq("status", "active")
      .order("recipe_slug", { ascending: true })
      .then(({ data }) => {
        const slugs = Array.from(new Set((data ?? []).map((row) => row.recipe_slug)));
        setRecipes(slugs);
      });
  }, [accountId]);

  const tabs = useMemo(() => ["all", ...recipes], [recipes]);

  const setFilter = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all") next.delete("recipe");
    else next.set("recipe", value);
    router.replace(next.size ? `${pathname}?${next.toString()}` : pathname, {
      scroll: false,
    });
  };

  return (
    <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {tabs.map((tab) => {
        const active = selected === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm capitalize transition",
              active
                ? "border-[var(--v48-accent)] bg-[var(--v48-accent)]/10 text-[var(--v48-accent)]"
                : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
