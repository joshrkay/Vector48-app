"use client";

import * as React from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AccountRow } from "./types";

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

const prefsSchema = z.object({
  new_lead: z.boolean(),
  missed_call_transcript: z.boolean(),
  negative_sentiment: z.boolean(),
  appointment_cancellation: z.boolean(),
  recipe_error: z.boolean(),
});

const schema = z.object({
  notification_contact_name: z.string().max(200),
  notification_contact: z.string().max(200),
  notification_alert_email: z.union([z.string().email(), z.literal("")]),
  notification_sms: z.boolean(),
  notification_email: z.boolean(),
  prefs: prefsSchema,
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_PREFS = {
  new_lead: true,
  missed_call_transcript: true,
  negative_sentiment: true,
  appointment_cancellation: true,
  recipe_error: true,
} as const;

function buildDefaults(account: AccountRow): FormValues {
  let phone = account.notification_contact ?? "";
  let alertEmail = account.notification_alert_email ?? "";
  const rawContact = account.notification_contact ?? "";

  if (!alertEmail && account.notification_email && looksLikeEmail(rawContact)) {
    alertEmail = rawContact;
    phone = "";
  }

  if (!phone && account.notification_sms && !looksLikeEmail(rawContact)) {
    phone = rawContact;
  }

  const rawPrefs =
    account.notification_alert_prefs &&
    typeof account.notification_alert_prefs === "object"
      ? (account.notification_alert_prefs as Record<string, boolean>)
      : {};

  return {
    notification_contact_name: account.notification_contact_name ?? "",
    notification_contact: phone,
    notification_alert_email: alertEmail,
    notification_sms: account.notification_sms,
    notification_email: account.notification_email,
    prefs: {
      new_lead: rawPrefs.new_lead ?? DEFAULT_PREFS.new_lead,
      missed_call_transcript:
        rawPrefs.missed_call_transcript ?? DEFAULT_PREFS.missed_call_transcript,
      negative_sentiment:
        rawPrefs.negative_sentiment ?? DEFAULT_PREFS.negative_sentiment,
      appointment_cancellation:
        rawPrefs.appointment_cancellation ??
        DEFAULT_PREFS.appointment_cancellation,
      recipe_error: rawPrefs.recipe_error ?? DEFAULT_PREFS.recipe_error,
    },
  };
}

export function NotificationSettings({ account }: { account: AccountRow }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(account),
  });

  const snapshot = useWatch({ control: form.control });
  const serialized = JSON.stringify(snapshot);
  const prevSerialized = React.useRef(serialized);

  React.useEffect(() => {
    const t = window.setTimeout(async () => {
      if (serialized === prevSerialized.current) return;
      prevSerialized.current = serialized;
      const v = form.getValues();
      if (!v.notification_sms && !v.notification_email) {
        return;
      }
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_contact_name: v.notification_contact_name || null,
          notification_contact: v.notification_contact || null,
          notification_alert_email: v.notification_alert_email || null,
          notification_sms: v.notification_sms,
          notification_email: v.notification_email,
          notification_alert_prefs: v.prefs,
        }),
      });
      if (!res.ok) {
        toast.error("Could not save notification settings");
        return;
      }
      toast.success("Alerts saved");
    }, 500);
    return () => window.clearTimeout(t);
  }, [serialized, form]);

  return (
    <div className="max-w-xl space-y-6 rounded-xl border bg-card p-4 shadow-sm md:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Notifications
      </h2>
      <div className="space-y-2">
        <Label htmlFor="notification_contact_name">Contact name</Label>
        <Input
          id="notification_contact_name"
          {...form.register("notification_contact_name")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notification_contact">SMS number</Label>
          <Input
            id="notification_contact"
            {...form.register("notification_contact")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notification_alert_email">Alert email</Label>
          <Input
            id="notification_alert_email"
            type="email"
            {...form.register("notification_alert_email")}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Controller
            control={form.control}
            name="notification_sms"
            render={({ field }) => (
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
          <Label>SMS</Label>
        </div>
        <div className="flex items-center gap-2">
          <Controller
            control={form.control}
            name="notification_email"
            render={({ field }) => (
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
          <Label>Email</Label>
        </div>
      </div>
      <div className="space-y-3">
        <Label>Alert types</Label>
        {(
          [
            ["new_lead", "New lead"],
            ["missed_call_transcript", "Missed call transcript"],
            ["negative_sentiment", "Negative sentiment"],
            ["appointment_cancellation", "Appointment cancellation"],
            ["recipe_error", "Recipe error"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm">{label}</span>
            <Controller
              control={form.control}
              name={`prefs.${key}`}
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
