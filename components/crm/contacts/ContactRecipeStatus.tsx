"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/dashboard/formatRelativeTime";
import type { Database } from "@/lib/supabase/types";

type RecipeActivationRow = Database["public"]["Tables"]["recipe_activations"]["Row"];

interface Props {
  activations: RecipeActivationRow[] | null;
}

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function StatusBadge({ status }: { status: RecipeActivationRow["status"] }) {
  if (status === "active") {
    return (
      <Badge className="border-transparent bg-green-100 text-green-700 hover:bg-green-100">
        Active
      </Badge>
    );
  }
  if (status === "paused") {
    return (
      <Badge className="border-transparent bg-amber-100 text-amber-700 hover:bg-amber-100">
        Paused
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge className="border-transparent bg-red-100 text-red-700 hover:bg-red-100">
        Error
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">{status}</Badge>
  );
}

function ActivationCard({ activation }: { activation: RecipeActivationRow }) {
  const [status, setStatus] = useState(activation.status);
  const [toggling, setToggling] = useState(false);

  async function handleToggle(checked: boolean) {
    const newStatus = checked ? "active" : "paused";
    const prev = status;
    setStatus(newStatus);
    setToggling(true);
    try {
      const res = await fetch(`/api/recipes/activations/${activation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success(checked ? "Recipe resumed" : "Recipe paused");
    } catch {
      setStatus(prev);
      toast.error("Failed to update recipe status");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--v48-border)] bg-white p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {slugToTitle(activation.recipe_slug)}
          </p>
          <StatusBadge status={status} />
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
          {activation.last_triggered_at
            ? `Last action ${formatRelativeTime(activation.last_triggered_at)}`
            : "Not yet triggered"}
        </p>
      </div>

      <Switch
        checked={status === "active"}
        onCheckedChange={handleToggle}
        disabled={toggling || status === "error" || status === "deactivated"}
        aria-label={`Toggle ${slugToTitle(activation.recipe_slug)}`}
      />
    </div>
  );
}

export function ContactRecipeStatus({ activations }: Props) {
  return (
    <div className="rounded-2xl border border-[var(--v48-border)] bg-white">
      <div className="border-b border-[var(--v48-border)] px-5 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Active Recipes</h2>
      </div>

      <div className="p-4">
        {!activations || activations.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No recipes active for this contact.
          </p>
        ) : (
          <div className="space-y-3">
            {activations.map((activation) => (
              <ActivationCard key={activation.id} activation={activation} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
