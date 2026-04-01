"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { GHLContact } from "@/lib/ghl/types";

// ── Schema ─────────────────────────────────────────────────────────────────

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  phone: z
    .string()
    .min(10, "Enter a valid phone number")
    .regex(/^[\d\s\-+().]+$/, "Enter a valid phone number"),
  email: z
    .union([z.string().email("Enter a valid email"), z.literal("")])
    .optional(),
  tags: z.string().optional(),
  source: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// ── Props ──────────────────────────────────────────────────────────────────

interface AddContactSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (contact: GHLContact) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function AddContactSheet({
  open,
  onOpenChange,
  onSuccess,
}: AddContactSheetProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      tags: "",
      source: "",
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next) form.reset();
    onOpenChange(next);
  }

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      const tags = values.tags
        ? values.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      const res = await fetch("/api/ghl/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: values.firstName,
          lastName: values.lastName || undefined,
          phone: values.phone,
          email: values.email || undefined,
          tags,
          source: values.source || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error(err.error ?? "Failed to create contact");
        return;
      }

      const data = await res.json() as { contact: GHLContact };
      toast.success("Contact added");
      form.reset();
      onOpenChange(false);
      onSuccess(data.contact);
    } catch {
      toast.error("Failed to create contact");
    } finally {
      setIsSubmitting(false);
    }
  }

  const formBody = (
    <Form {...form}>
      <form
        id="add-contact-form"
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  First name <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Jane" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last name</FormLabel>
                <FormControl>
                  <Input placeholder="Smith" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Phone <span className="text-destructive">*</span>
              </FormLabel>
              <FormControl>
                <Input type="tel" placeholder="+1 (555) 000-0000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="jane@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tags</FormLabel>
              <FormControl>
                <Input placeholder="New Lead, VIP (comma-separated)" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Source</FormLabel>
              <FormControl>
                <Input placeholder="Website, Referral…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );

  const footerButtons = (
    <>
      <Button
        variant="outline"
        onClick={() => handleOpenChange(false)}
        disabled={isSubmitting}
      >
        Cancel
      </Button>
      <Button type="submit" form="add-contact-form" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Add Contact
      </Button>
    </>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md gap-0 p-0">
          <DialogHeader className="border-b border-border p-6 pb-4">
            <DialogTitle className="font-heading text-xl">Add Contact</DialogTitle>
            <DialogDescription className="sr-only">
              Create a new GHL contact
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4">{formBody}</div>
          <DialogFooter className="flex-row justify-end gap-2 border-t border-border p-6 pt-4">
            {footerButtons}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0"
      >
        <SheetHeader className="border-b border-border p-5 pb-4 text-left">
          <SheetTitle className="font-heading text-xl">Add Contact</SheetTitle>
          <SheetDescription className="sr-only">
            Create a new GHL contact
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">{formBody}</div>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border p-5 pt-4">
          {footerButtons}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
