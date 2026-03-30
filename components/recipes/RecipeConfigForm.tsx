"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import type { RecipeConfigField } from "@/types/recipes";
import type { AccountProfileSlice } from "@/lib/recipes/activationValidator";
import { buildRecipeConfigZodSchema } from "@/lib/recipes/configSchema";
import {
  getAccountProfileValue,
  isProfileValuePresent,
  profileValueToDisplayString,
} from "@/lib/recipes/profileFields";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function coerceLockedValue(
  val: unknown,
  field: RecipeConfigField,
): string | number | boolean {
  if (field.type === "number") return Number(val);
  if (field.type === "boolean" || field.type === "toggle") return Boolean(val);
  return profileValueToDisplayString(val);
}

function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6)
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export interface RecipeConfigFormProps {
  configFields: RecipeConfigField[];
  profile: AccountProfileSlice | null;
  formId: string;
  onSubmit: (data: Record<string, unknown>) => void;
  className?: string;
}

export function RecipeConfigForm({
  configFields,
  profile,
  formId,
  onSubmit,
  className,
}: RecipeConfigFormProps) {
  const { lockedKeys, lockedValues, editableFields } = useMemo(() => {
    const locked = new Set<string>();
    const values: Record<string, unknown> = {};

    for (const f of configFields) {
      if (!f.defaultFromProfile || !profile) continue;
      const pv = getAccountProfileValue(profile, f.defaultFromProfile);
      if (!isProfileValuePresent(pv)) continue;
      locked.add(f.name);
      values[f.name] = coerceLockedValue(pv, f);
    }

    return {
      lockedKeys: locked,
      lockedValues: values,
      editableFields: configFields.filter((f) => !locked.has(f.name)),
    };
  }, [configFields, profile]);

  const schema = useMemo(
    () => buildRecipeConfigZodSchema(editableFields),
    [editableFields],
  );

  const defaultValues = useMemo(() => {
    const v: Record<string, unknown> = {};
    for (const f of editableFields) {
      if (f.type === "toggle" || f.type === "boolean") v[f.name] = false;
      else if (f.type === "number") v[f.name] = undefined;
      else v[f.name] = "";
    }
    return v;
  }, [editableFields]);

  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  const mergedSubmit = (data: Record<string, unknown>) => {
    onSubmit({ ...lockedValues, ...data });
  };

  return (
    <Form {...form}>
      <form
        id={formId}
        className={cn("space-y-4", className)}
        onSubmit={form.handleSubmit(mergedSubmit)}
      >
        {configFields.map((field) => {
          if (lockedKeys.has(field.name)) {
            const display = profileValueToDisplayString(
              lockedValues[field.name],
            );
            return (
              <div
                key={field.name}
                className="flex gap-3 rounded-lg border border-[var(--v48-border)] bg-gray-50/80 p-3"
              >
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{field.label}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--text-secondary)]">
                    {display || "—"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    From your profile
                  </p>
                </div>
              </div>
            );
          }

          return (
            <FormField
              key={field.name}
              control={form.control}
              name={field.name}
              render={({ field: fCtrl }) => (
                <FormItem>
                  <FormLabel>
                    {field.label}
                    {field.required ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </FormLabel>
                  <FormControl>
                    {field.type === "textarea" ? (
                      <textarea
                        className="flex min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        value={String(fCtrl.value ?? "")}
                        onChange={(e) => fCtrl.onChange(e.target.value)}
                        onBlur={fCtrl.onBlur}
                        name={fCtrl.name}
                        ref={fCtrl.ref}
                      />
                    ) : field.type === "phone" ? (
                      <Input
                        type="tel"
                        autoComplete="tel"
                        value={formatPhoneInput(String(fCtrl.value ?? ""))}
                        onChange={(e) => {
                          const d = e.target.value.replace(/\D/g, "").slice(0, 10);
                          fCtrl.onChange(d);
                        }}
                        onBlur={fCtrl.onBlur}
                        name={fCtrl.name}
                        ref={fCtrl.ref}
                      />
                    ) : field.type === "number" ? (
                      <Input
                        type="number"
                        value={fCtrl.value === undefined || fCtrl.value === "" ? "" : String(fCtrl.value)}
                        onChange={(e) => {
                          const v = e.target.value;
                          fCtrl.onChange(v === "" ? undefined : Number(v));
                        }}
                        onBlur={fCtrl.onBlur}
                        name={fCtrl.name}
                        ref={fCtrl.ref}
                      />
                    ) : field.type === "select" && field.options?.length ? (
                      <Select
                        value={String(fCtrl.value ?? "")}
                        onValueChange={fCtrl.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`Select ${field.label}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.type === "toggle" || field.type === "boolean" ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Boolean(fCtrl.value)}
                          onCheckedChange={fCtrl.onChange}
                        />
                        <span className="text-sm text-[var(--text-secondary)]">
                          {Boolean(fCtrl.value) ? "On" : "Off"}
                        </span>
                      </div>
                    ) : (
                      <Input
                        value={String(fCtrl.value ?? "")}
                        onChange={fCtrl.onChange}
                        onBlur={fCtrl.onBlur}
                        name={fCtrl.name}
                        ref={fCtrl.ref}
                      />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          );
        })}
      </form>
    </Form>
  );
}
