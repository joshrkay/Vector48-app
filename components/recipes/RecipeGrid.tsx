"use client";

import { useState } from "react";
import type { RecipeWithStatus } from "@/lib/recipes/types";
import { RecipeFilterTabs } from "./RecipeFilterTabs";
import { RecipeCard } from "./RecipeCard";

export function RecipeGrid({ recipes, activeCount }: { recipes: RecipeWithStatus[]; activeCount: number }) {
  const [filter, setFilter] = useState<"all" | "active">("all");

  const filtered =
    filter === "active"
      ? recipes.filter((r) => r.status === "active")
      : recipes;

  return (
    <div>
      <div className="mb-5">
        <RecipeFilterTabs
          value={filter}
          onChange={setFilter}
          activeCount={activeCount}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl bg-gray-50 p-8">
          <p className="text-sm text-[var(--text-secondary)]">
            No active recipes yet. Activate a recipe to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.slug} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}
