"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createBrowserClient } from "@/lib/supabase/client";
import { loginSchema, type LoginValues } from "@/lib/validations/auth";
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

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginValues) {
    setIsLoading(true);
    try {
      const supabase = createBrowserClient();

      const { data: signInData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });

      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes("email not confirmed")) {
          toast.error(
            "Confirm your email using the link we sent, then try again.",
          );
        } else if (msg.includes("invalid login credentials")) {
          toast.error("Invalid email or password.");
        } else {
          toast.error(authError.message);
        }
        return;
      }

      if (!signInData.user) {
        toast.error("Sign-in did not return a user. Try again.");
        return;
      }

      router.refresh();

      const { data: account } = await supabase
        .from("accounts")
        .select("onboarding_done_at, onboarding_completed_at, ghl_provisioning_status")
        .eq("owner_user_id", signInData.user.id)
        .maybeSingle();

      const onboardingDone =
        Boolean(account?.onboarding_done_at) ||
        Boolean(account?.onboarding_completed_at) ||
        account?.ghl_provisioning_status === "failed";

      if (!account || !onboardingDone) {
        router.push("/onboarding");
      } else {
        router.push("/dashboard");
      }
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <h1 className="font-heading font-bold text-[22px]">Welcome back</h1>
      <p className="mt-1 text-[14px] text-[#64748B]">
        Sign in to your Vector 48 account.
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

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-[var(--v48-accent)] hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      {showPassword ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  </div>
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
                Signing in…
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-[#64748B]">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-[var(--v48-accent)] font-medium hover:underline"
        >
          Start free trial →
        </Link>
      </p>
    </div>
  );
}
