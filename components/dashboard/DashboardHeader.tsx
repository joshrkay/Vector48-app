"use client";

import { useEffect, useState } from "react";

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

interface DashboardHeaderProps {
  businessName: string;
  activeRecipeCount: number;
  eventsTodayCount: number;
}

export function DashboardHeader({
  businessName,
  activeRecipeCount,
  eventsTodayCount,
}: DashboardHeaderProps) {
  const [greeting, setGreeting] = useState<string | null>(null);

  // Empty deps: one interval + listeners per mount; greeting updates via refresh().
  useEffect(() => {
    const refresh = () => {
      setGreeting(greetingForHour(new Date().getHours()));
    };

    refresh();
    const intervalId = window.setInterval(refresh, 60_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const name = businessName.trim() || "your business";

  return (
    <header className="mb-8">
      <h1 className="font-heading text-[28px] font-bold text-[var(--text-primary)]">
        {greeting ? `${greeting}, ${name}` : name}
      </h1>
      <p className="mt-1 font-sans text-[13px] text-[var(--text-secondary)]">
        {activeRecipeCount} recipe{activeRecipeCount === 1 ? "" : "s"} active ·{" "}
        {eventsTodayCount} event{eventsTodayCount === 1 ? "" : "s"} today
      </p>
    </header>
  );
}
