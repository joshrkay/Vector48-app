"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { IntegrationRow } from "./types";

type TileProvider = "jobber" | "servicetitan" | "google_business";

export function IntegrationTile({
  provider,
  label,
  description,
  integration,
  warning,
}: {
  provider: TileProvider;
  label: string;
  description: string;
  integration: IntegrationRow | undefined;
  warning: boolean;
}) {
  const [disconnectOpen, setDisconnectOpen] = React.useState(false);
  const [stOpen, setStOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [dependents, setDependents] = React.useState<{ name: string }[]>([]);
  const [apiKey, setApiKey] = React.useState("");
  const [tenantId, setTenantId] = React.useState("");

  const connected = integration?.status === "connected";

  const oauthConnectHref =
    provider === "google_business"
      ? "/api/integrations/google-business/connect"
      : `/api/integrations/${provider}/connect`;

  async function openDisconnect() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/dependents?provider=${encodeURIComponent(provider)}`,
      );
      const j = (await res.json()) as { recipes?: { name: string }[] };
      setDependents(j.recipes ?? []);
    } finally {
      setLoading(false);
      setDisconnectOpen(true);
    }
  }

  async function confirmDisconnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        toast.error("Disconnect failed");
        return;
      }
      toast.success("Disconnected");
      setDisconnectOpen(false);
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  async function saveServiceTitan() {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/servicetitan/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, tenant_id: tenantId }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Save failed");
        return;
      }
      toast.success("ServiceTitan connected");
      setStOpen(false);
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm md:p-5",
        warning && "border-amber-500/50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{label}</h3>
            {warning && (
              <span title="Active recipe needs this integration">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </span>
            )}
            <Badge
              variant={connected ? "default" : "secondary"}
              className={cn(
                integration?.status === "error" && "bg-destructive text-destructive-foreground",
              )}
            >
              {integration?.status ?? "not connected"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {provider === "servicetitan" ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setStOpen(true)}>
                {connected ? "Update credentials" : "Connect"}
              </Button>
              {connected && (
                <Button type="button" variant="outline" onClick={openDisconnect}>
                  Disconnect
                </Button>
              )}
            </>
          ) : (
            <>
              {!connected ? (
                <Button type="button" asChild>
                  <Link href={oauthConnectHref}>Connect</Link>
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={openDisconnect}>
                  Disconnect
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {label}?</DialogTitle>
            <DialogDescription>
              {dependents.length > 0
                ? `This will pause: ${dependents.map((d) => d.name).join(", ")}.`
                : "You can reconnect anytime."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisconnectOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmDisconnect} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stOpen} onOpenChange={setStOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ServiceTitan</DialogTitle>
            <DialogDescription>
              API key and tenant ID. Validated against ServiceTitan before save.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="st_key">API key</Label>
              <Input
                id="st_key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st_tenant">Tenant ID</Label>
              <Input
                id="st_tenant"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveServiceTitan} disabled={loading || !apiKey || !tenantId}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
