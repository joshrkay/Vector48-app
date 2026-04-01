"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type HealthStatus = "connected" | "error" | "checking";

export function GHLConnectionStatus() {
  const [status, setStatus] = useState<HealthStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      try {
        const response = await fetch("/api/ghl/health", { cache: "no-store" });
        const data = (await response.json()) as { status?: "connected" | "error" };
        if (!cancelled) {
          setStatus(data.status === "connected" ? "connected" : "error");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full",
          status === "connected" ? "bg-emerald-500" : status === "error" ? "bg-red-500" : "bg-amber-500"
        )}
      />
      GHL {status === "connected" ? "Connected" : status === "error" ? "Issue" : "Checking"}
    </div>
  );
}
