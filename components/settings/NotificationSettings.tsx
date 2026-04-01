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

const alertsSchema = z.object({
  new_lead: z.boolean(),
  missed_call: z.boolean(),
  negative_sentiment: z.boolean(),
  appointment_cancel: z.boolean(),
  recipe_error: z.boolean(),
});

const schema = z.object({
  notification_contact_name: z.string().max(200),
  notification_contact_phone: z.string().max(200),
  sms: z.boolean(),
  email: z.boolean(),
  alerts: alertsSchema,
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_ALERTS = {
  new_lead: true,
  missed_call: true,
  negative_sentiment: true,
  appointment_cancel: true,
  recipe_error: true,
} as const;

function buildDefaults(account: AccountRow): FormValues {
  const prefs =
    account.notification_preferences &&
    typeof account.notification_preferences === "object"
      ? (account.notification_preferences as Record<string, unknown>)
      : {};

  const alerts =
    prefs.alerts && typeof prefs.alerts === "object"
      ? (prefs.alerts as Record<string, boolean>)
      : {};

  return {
    notification_contact_name: account.notification_contact_name ?? "",
    notification_contact_phone: account.notification_contact_phone ?? "",
    sms: prefs.sms === true,
    email: prefs.email === true,
    alerts: {
      new_lead: alerts.new_lead ?? DEFAULT_ALERTS.new_lead,
      missed_call: alerts.missed_call ?? DEFAULT_ALERTS.missed_call,
      negative_sentiment:
        alerts.negative_sentiment ?? DEFAULT_ALERTS.negative_sentiment,
      appointment_cancel:
        alerts.appointment_cancel ?? DEFAULT_ALERTS.appointment_cancel,
      recipe_error: alerts.recipe_error ?? DEFAULT_ALERTS.recipe_error,
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
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_contact_name: v.notification_contact_name || null,
          notification_contact_phone: v.notification_contact_phone || null,
          notification_preferences: {
            sms: v.sms,
            email: v.email,
            alerts: v.alerts,
          },
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
      <div className="space-y-2">
        <Label htmlFor="notification_contact_phone">SMS number</Label>
        <Input
          id="notification_contact_phone"
          {...form.register("notification_contact_phone")}
        />
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Controller
            control={form.control}
            name="sms"
            render={({ field }) => (
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
          <Label>SMS</Label>
        </div>
        <div className="flex items-center gap-2">
          <Controller
            control={form.control}
            name="email"
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
            ["missed_call", "Missed call"],
            ["negative_sentiment", "Negative sentiment"],
            ["appointment_cancel", "Appointment cancellation"],
            ["recipe_error", "Recipe error"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm">{label}</span>
            <Controller
              control={form.control}
              name={`alerts.${key}`}
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
