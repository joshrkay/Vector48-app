"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Play } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccountRow } from "./types";

const schema = z.object({
  voice_gender: z.enum(["male", "female"]),
  voice_greeting: z.string().min(1).max(500),
});

type FormValues = z.infer<typeof schema>;

export function VoiceSettings({ account }: { account: AccountRow }) {
  const router = useRouter();
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [regenLoading, setRegenLoading] = React.useState(false);
  const [audioKey, setAudioKey] = React.useState(0);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      voice_gender:
        account.voice_gender === "female" ? "female" : "male",
      voice_greeting: account.voice_greeting ?? "",
    },
  });

  const preview = `${account.business_name}: ${form.watch("voice_greeting") || "…"}`;

  async function saveVoice() {
    const valid = await form.trigger();
    if (!valid) return;
    const v = form.getValues();
    const res = await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voice_gender: v.voice_gender,
        voice_greeting: v.voice_greeting,
      }),
    });
    if (!res.ok) {
      toast.error("Could not save voice settings");
      return;
    }
    toast.success("Voice settings saved");
  }

  async function regenerate() {
    setRegenLoading(true);
    try {
      const res = await fetch("/api/settings/voice/regenerate", {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) {
        toast.error(j.error ?? "Regeneration failed");
        return;
      }
      toast.success("Greeting audio updated");
      setAudioKey((k) => k + 1);
      router.refresh();
    } finally {
      setRegenLoading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6 rounded-xl border bg-card p-4 shadow-sm md:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Voice
      </h2>
      {account.greeting_audio_url ? (
        <div className="flex items-center gap-3">
          <audio
            ref={audioRef}
            key={audioKey}
            src={account.greeting_audio_url}
            controls
            className="h-9 flex-1"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="shrink-0 text-teal-600"
            onClick={() => void audioRef.current?.play()}
            aria-label="Play greeting"
          >
            <Play className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No greeting audio yet. Generate a stub to enable preview.
        </p>
      )}
      <div className="space-y-2">
        <Label>Greeting preview text</Label>
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">{preview}</p>
      </div>
      <div className="space-y-2">
        <Label>Voice gender</Label>
        <div className="flex gap-2">
          {(["male", "female"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => form.setValue("voice_gender", g)}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm capitalize",
                form.watch("voice_gender") === g
                  ? "border-accent bg-accent-light ring-2 ring-accent/20"
                  : "border-border",
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="voice_greeting">Greeting line</Label>
        <Input id="voice_greeting" {...form.register("voice_greeting")} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={saveVoice}>
          Save voice settings
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={regenLoading}
          onClick={regenerate}
        >
          {regenLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Regenerate audio (stub)"
          )}
        </Button>
      </div>
    </div>
  );
}
