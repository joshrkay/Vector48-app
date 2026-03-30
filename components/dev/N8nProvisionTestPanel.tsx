"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { RECIPE_TEMPLATE_PATHS } from "@/lib/n8n/recipeTemplateRegistry";

type PingView =
  | { phase: "idle" }
  | { phase: "loading" }
  | {
      phase: "done";
      ok: true;
      credentialCount: number;
      n8nHost: string;
    }
  | { phase: "done"; ok: false; error: string };

type ProvisionView =
  | { phase: "idle" }
  | { phase: "loading" }
  | {
      phase: "done";
      ok: true;
      workflowId: string;
      webhookUrl: string;
    }
  | { phase: "done"; ok: false; error: string; status?: number };

export function N8nProvisionTestPanel({ accountId }: { accountId: string }) {
  const [ping, setPing] = React.useState<PingView>({ phase: "idle" });
  const [provision, setProvision] = React.useState<ProvisionView>({
    phase: "idle",
  });
  const [recipeSlug, setRecipeSlug] = React.useState("ai-phone-answering");

  const templateSlugs = Object.keys(RECIPE_TEMPLATE_PATHS);

  const runPing = async () => {
    setPing({ phase: "loading" });
    try {
      const res = await fetch("/api/dev/n8n/ping");
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setPing({
          phase: "done",
          ok: false,
          error: String(data.error ?? res.statusText),
        });
        return;
      }
      if (data.ok === true) {
        setPing({
          phase: "done",
          ok: true,
          credentialCount: Number(data.credentialCount ?? 0),
          n8nHost: String(data.n8nHost ?? ""),
        });
        return;
      }
      setPing({
        phase: "done",
        ok: false,
        error: String(data.error ?? "Unknown error"),
      });
    } catch (e) {
      setPing({
        phase: "done",
        ok: false,
        error: e instanceof Error ? e.message : "Request failed",
      });
    }
  };

  const runProvision = async () => {
    setProvision({ phase: "loading" });
    try {
      const res = await fetch("/api/recipes/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          recipeSlug,
          config: {
            voice_gender: "female",
            voice_greeting: "Thanks for calling — dev test.",
          },
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setProvision({
          phase: "done",
          ok: false,
          error: String(data.error ?? res.statusText),
          status: res.status,
        });
        return;
      }
      setProvision({
        phase: "done",
        ok: true,
        workflowId: String(data.workflowId ?? ""),
        webhookUrl: String(data.webhookUrl ?? ""),
      });
    } catch (e) {
      setProvision({
        phase: "done",
        ok: false,
        error: e instanceof Error ? e.message : "Request failed",
      });
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-[var(--v48-border)] bg-card p-5">
        <h2 className="font-heading text-lg font-semibold">1. Ping n8n API</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Calls your instance with{" "}
          <code className="rounded bg-muted px-1 text-xs">N8N_API_KEY</code> and
          lists credentials (read-only).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={runPing}>
            Run ping
          </Button>
          {ping.phase === "loading" && (
            <span className="text-sm text-muted-foreground">Loading…</span>
          )}
        </div>
        {ping.phase === "done" && (
          <pre className="mt-4 overflow-x-auto rounded-lg bg-muted/60 p-4 text-xs">
            {JSON.stringify(ping, null, 2)}
          </pre>
        )}
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
        <h2 className="font-heading text-lg font-semibold">
          2. Provision recipe (real)
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Inserts a{" "}
          <code className="rounded bg-muted px-1 text-xs">recipe_activations</code>{" "}
          row and runs full n8n provisioning (credentials + workflow + activate).
          Use a dev account; duplicates are possible if you click repeatedly.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Recipe slug</span>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={recipeSlug}
              onChange={(e) => setRecipeSlug(e.target.value)}
            >
              {templateSlugs.map((slug) => (
                <option key={slug} value={slug}>
                  {slug}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={runProvision}
            disabled={provision.phase === "loading"}
          >
            {provision.phase === "loading" ? "Provisioning…" : "Run provision"}
          </Button>
        </div>
        {provision.phase === "done" && (
          <pre className="mt-4 overflow-x-auto rounded-lg bg-muted/60 p-4 text-xs">
            {JSON.stringify(provision, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
