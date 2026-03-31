import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LaunchChecklistClient } from "@/components/launch-checklist/LaunchChecklistClient";
import { isLaunchChecklistEnabled } from "@/lib/launch-checklist/devGate";

export const metadata: Metadata = {
  title: "Launch Checklist",
  description:
    "Vector 48 launch checklist from prompts executed to first customer live.",
};

export default function LaunchChecklistPage() {
  if (!isLaunchChecklistEnabled()) {
    notFound();
  }

  return (
    <div className="-mx-4 -mt-4 w-[calc(100%+2rem)] md:-mx-6 md:-mt-6 md:w-[calc(100%+3rem)]">
      <LaunchChecklistClient />
    </div>
  );
}
