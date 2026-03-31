"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IntegrationStatusPayload } from "@/lib/integrations/integrationStatusTypes";

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Never";
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function StatusDot({ className }: { className: string }) {
  return (
    <span
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      aria-hidden
    />
  );
}

export function SettingsIntegrations({
  status,
}: {
  status: IntegrationStatusPayload;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = React.useState(false);

  async function reconnect() {
    setRetrying(true);
    try {
      const res = await fetch("/api/provisioning/retry", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Reconnect failed");
        return;
      }
      toast.success("Provisioning started");
      router.refresh();
    } finally {
      setRetrying(false);
    }
  }

  const ghlStatus =
    status.ghl.status === "connected"
      ? { label: "Connected", dot: "bg-emerald-500" }
      : status.ghl.status === "failed"
        ? { label: "Failed", dot: "bg-red-500" }
        : { label: "Pending", dot: "bg-amber-500" };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Integrations
      </h2>

      <div className="rounded-xl border bg-card p-4 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-foreground">GoHighLevel</p>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <StatusDot className={ghlStatus.dot} />
              <span>{ghlStatus.label}</span>
            </div>
          </div>
          {status.ghl.status === "failed" && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={retrying}
              onClick={() => void reconnect()}
            >
              {retrying ? "Working…" : "Reconnect"}
            </Button>
          )}
        </div>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Sub-account ID</dt>
            <dd className="font-mono text-foreground">
              {status.ghl.maskedLocationId ?? "—"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Last synced</dt>
            <dd className="text-foreground">
              {formatRelative(status.ghl.lastSyncedAt)}
            </dd>
          </div>
        </dl>
      </div>

      {status.voiceAgent.show && (
        <div className="rounded-xl border bg-card p-4 shadow-sm md:p-6">
          <p className="font-medium text-foreground">Voice AI Agent</p>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <StatusDot
              className={
                status.voiceAgent.status === "active"
                  ? "bg-emerald-500"
                  : "bg-slate-400"
              }
            />
            <span>
              {status.voiceAgent.status === "active"
                ? "Active"
                : "Not Configured"}
            </span>
          </div>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Agent ID</dt>
              <dd className="font-mono text-foreground">
                {status.voiceAgent.maskedAgentId ?? "—"}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Voice</dt>
              <dd className="capitalize text-foreground">
                {status.voiceAgent.voiceGender ?? "—"}
              </dd>
            </div>
          </dl>
          {status.voiceAgent.testCallTel && (
            <a
              href={`tel:${status.voiceAgent.testCallTel.replace(/\D/g, "")}`}
              className="mt-3 inline-block text-sm font-medium text-[#00B4A6] hover:underline"
            >
              Test your AI — call {status.voiceAgent.testCallTel}
            </a>
          )}
        </div>
      )}

      <div className="rounded-xl border bg-card p-4 shadow-sm md:p-6">
        <p className="font-medium text-foreground">n8n Automation Engine</p>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <StatusDot
            className={
              status.n8n.connected ? "bg-emerald-500" : "bg-amber-500"
            }
          />
          <span>{status.n8n.connected ? "Connected" : "Not Connected"}</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Recipe execution count:{" "}
          <span className="font-medium text-foreground">
            {status.n8n.recipeExecutionCount}
          </span>
        </p>
        {!status.n8n.connected && status.n8n.webhookBaseUrl && (
          <p className="mt-2 break-all text-xs text-muted-foreground">
            Webhook base URL: {status.n8n.webhookBaseUrl}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-1">
        {(
          [
            {
              title: "ElevenLabs",
              body: "Coming in v2 — Custom voice cloning",
            },
            {
              title: "Jobber",
              body: "Coming soon — Job management sync",
            },
            {
              title: "ServiceTitan",
              body: "Coming soon — Service dispatch integration",
            },
          ] as const
        ).map((item) => (
          <div
            key={item.title}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-muted-foreground/25 bg-muted/30 p-4 opacity-80"
          >
            <div>
              <p className="font-medium text-muted-foreground">{item.title}</p>
              <p className="text-sm text-muted-foreground/70">{item.body}</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled>
              Notify Me
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
