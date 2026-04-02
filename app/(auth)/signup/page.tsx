"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createBrowserClient } from "@/lib/supabase/client";
import { signupSchema, type SignupValues } from "@/lib/validations/auth";
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

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      businessName: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: SignupValues) {
    setIsLoading(true);
    try {
      const supabase = createBrowserClient();

      // 1. Create auth user (DB trigger on auth.users creates public.accounts + account_users)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            business_name: values.businessName,
          },
        },
      });

      if (authError) {
        toast.error(authError.message);
        return;
      }

      if (!authData.user) {
        toast.error("Something went wrong. Please try again.");
        return;
      }

      // 2. No client-side accounts insert: RLS requires auth.uid(); with email confirm there is often
      //    no session yet, so uid is null and INSERT fails. Trigger handle_new_auth_user handles it.

      if (!authData.session) {
        toast.success("Check your email to confirm your account, then sign in.");
        router.push("/login");
        return;
      }

      router.push("/onboarding");
    } catch {
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <h1 className="font-heading font-bold text-[22px]">
        Create your account
      </h1>
      <p className="mt-1 text-[14px] text-[#64748B]">
        Start your 7-day free trial. No credit card required.
      </p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <FormField
            control={form.control}
            name="businessName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Business name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Martinez HVAC & Cooling"
                    {...field}
                  />
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
                <FormLabel>Password</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 8 characters"
                      {...field}
                    />
                  </FormControl>
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
                Creating account…
              </>
            ) : (
              "Create Account"
            )}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-[#64748B]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-[var(--v48-accent)] font-medium hover:underline"
        >
          Sign in →
        </Link>
      </p>
    </div>
  );
}
