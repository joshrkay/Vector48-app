"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { US_TIMEZONES } from "@/lib/constants/usTimezones";
import type { AccountRow } from "./types";

const schema = z.object({
  voice_gender: z.enum(["male", "female"]),
  greeting_text: z.string().min(1).max(200),
  timezone: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export function VoiceSettings({ account }: { account: AccountRow }) {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      voice_gender:
        account.voice_gender === "female" ? "female" : "male",
      greeting_text: account.greeting_text ?? "",
      timezone: account.timezone || "America/Phoenix",
    },
  });

  const greeting = form.watch("greeting_text");
  const preview = `Hi, thanks for calling ${account.business_name || "your business"}. ${greeting || "…"}`;

  async function onSubmit(values: FormValues) {
    const res = await fetch("/api/settings/voice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voice_gender: values.voice_gender,
        greeting_text: values.greeting_text,
        timezone: values.timezone,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      warnings?: string[];
      error?: unknown;
    };
    if (!res.ok) {
      toast.error(
        typeof data.error === "string" ? data.error : "Could not save settings",
      );
      return;
    }
    if (data.warnings?.includes("ghl_voice_agent")) {
      toast.warning(
        "Saved locally, but we couldn't sync your voice settings to your phone system. We'll retry automatically.",
      );
    } else {
      toast.success("Settings saved");
    }
    router.refresh();
    form.reset(values);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6 rounded-xl border bg-card p-4 shadow-sm md:p-6"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          AI voice
        </h2>
        <div className="space-y-2">
          <Label>Voice gender</Label>
          <div className="flex gap-3">
            {(["male", "female"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() =>
                  form.setValue("voice_gender", g, { shouldDirty: true })
                }
                className={cn(
                  "flex h-12 flex-1 items-center justify-center rounded-xl border-2 text-sm font-semibold capitalize transition-all",
                  form.watch("voice_gender") === g
                    ? "border-[#00B4A6] bg-[#00B4A6]/10 text-[#0F1E35] ring-2 ring-[#00B4A6]/20"
                    : "border-border text-muted-foreground hover:border-[#00B4A6]/40",
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="greeting_text">
            What should your AI say when it answers?
          </Label>
          <textarea
            id="greeting_text"
            rows={4}
            maxLength={200}
            {...form.register("greeting_text")}
            className={cn(
              "flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              "resize-none",
            )}
            placeholder="Tell callers how you can help…"
          />
          <p className="text-xs text-muted-foreground">
            {form.watch("greeting_text").length}/200
          </p>
        </div>
        <div className="space-y-2">
          <Label>Live preview</Label>
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {preview}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...form.register("timezone")}
          >
            {US_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          className="bg-[#00B4A6] text-white hover:bg-[#00B4A6]/90"
          disabled={form.formState.isSubmitting || !form.formState.isDirty}
        >
          Save Changes
        </Button>
      </form>

      <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-foreground">
              Want your AI to sound exactly like you?
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Pro Plan: Record a 30-second voice sample and your AI will speak
              in your voice.
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            Coming Soon
          </Badge>
        </div>
      </div>
    </div>
  );
}
