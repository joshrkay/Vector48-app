"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createBrowserClient } from "@/lib/supabase/client";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/lib/validations/auth";
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

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordValues) {
    setIsLoading(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(
        values.email,
        { redirectTo: `${window.location.origin}/reset-password` },
      );

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("rate limit") || msg.includes("email rate limit")) {
          toast.error(
            "Too many reset attempts. Please wait before trying again.",
          );
        } else {
          toast.error(error.message);
        }
        return;
      }

      setSent(true);
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (sent) {
    return (
      <div>
        <h1 className="font-heading font-bold text-[22px]">Check your email</h1>
        <p className="mt-1 text-[13px] text-[#64748B]">
          We sent a password reset link to{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {form.getValues("email")}
          </span>
          . Click the link in the email to set a new password.
        </p>
        <p className="mt-6 text-center text-[13px] text-[#64748B]">
          <Link
            href="/login"
            className="text-[#00B4A6] font-medium hover:underline"
          >
            &larr; Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-heading font-bold text-[22px]">Reset your password</h1>
      <p className="mt-1 text-[13px] text-[#64748B]">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@company.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[var(--v48-accent)] hover:bg-[var(--v48-accent)]/90 text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-[13px] text-[#64748B]">
        <Link href="/login" className="text-[#00B4A6] font-medium hover:underline">
          &larr; Back to sign in
        </Link>
      </p>
    </div>
  );
}
