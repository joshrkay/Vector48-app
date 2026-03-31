"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { businessHoursSchema } from "@/lib/validations/onboarding";
import { BusinessHoursFields } from "./BusinessHoursFields";
import type { AccountRow } from "./types";

const schema = z.object({
  business_name: z.string().min(1, "Business name is required"),
  phone: z.string().max(40).optional().nullable(),
  email: z
    .union([z.string().email(), z.literal("")])
    .optional()
    .nullable(),
  address_city: z.string().max(100).optional().nullable(),
  address_state: z.string().max(100).optional().nullable(),
  address_zip: z.string().max(20).optional().nullable(),
  business_hours: businessHoursSchema,
});

type FormValues = z.infer<typeof schema>;

function parseHours(raw: unknown): FormValues["business_hours"] {
  const parsed = businessHoursSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { preset: "weekday_8_5" };
}

export function BusinessProfileForm({ account }: { account: AccountRow }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      business_name: account.business_name,
      phone: account.phone ?? "",
      email: account.email ?? "",
      address_city: account.address_city ?? "",
      address_state: account.address_state ?? "",
      address_zip: account.address_zip ?? "",
      business_hours: parseHours(account.business_hours),
    },
  });

  async function onSubmit(values: FormValues) {
    const res = await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: values.business_name,
        phone: values.phone || null,
        email: values.email || null,
        address_city: values.address_city || null,
        address_state: values.address_state || null,
        address_zip: values.address_zip || null,
        business_hours: values.business_hours,
      }),
    });
    if (!res.ok) {
      toast.error("Could not save profile");
      return;
    }
    toast.success("Profile saved");
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="max-w-xl space-y-4 rounded-xl border bg-card p-4 shadow-sm md:p-6"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Business profile
      </h2>
      <div className="space-y-2">
        <Label htmlFor="business_name">Business name</Label>
        <Input id="business_name" {...form.register("business_name")} />
        {form.formState.errors.business_name && (
          <p className="text-xs text-destructive">
            {form.formState.errors.business_name.message}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" {...form.register("phone")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...form.register("email")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="address_city">City</Label>
          <Input id="address_city" {...form.register("address_city")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address_state">State</Label>
          <Input id="address_state" {...form.register("address_state")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address_zip">ZIP</Label>
          <Input id="address_zip" {...form.register("address_zip")} />
        </div>
      </div>
      <div>
        <Label className="mb-2 block">Business hours</Label>
        <BusinessHoursFields
          value={{ preset: form.watch("business_hours.preset") }}
          onChange={(next) =>
            form.setValue("business_hours", {
              ...form.getValues("business_hours"),
              preset: next.preset,
            })
          }
        />
      </div>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        Save profile
      </Button>
    </form>
  );
}
