"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createBrowserClient } from "@/lib/supabase/client";
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

const signupSchema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignupValues = z.infer<typeof signupSchema>;

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

      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
      });

      if (authError) {
        toast.error(authError.message);
        return;
      }

      const user = authData.user;
      if (!user) {
        toast.error("Signup failed. Please try again.");
        return;
      }

      // 2. Create account row
      const trialEndsAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .insert({
          owner_user_id: user.id,
          business_name: values.businessName,
          trial_ends_at: trialEndsAt,
          plan_slug: "trial",
          provisioning_status: "pending",
          vertical: "hvac", // default — updated during onboarding
        })
        .select("id")
        .single();

      if (accountError) {
        toast.error("Account creation failed: " + accountError.message);
        return;
      }

      // 3. Create account_users join row
      const { error: memberError } = await supabase
        .from("account_users")
        .insert({
          account_id: account.id,
          user_id: user.id,
          role: "admin",
        });

      if (memberError) {
        toast.error("Failed to link account: " + memberError.message);
        return;
      }

      router.push("/onboarding");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <h2 className="font-heading font-bold text-[22px] text-center">
        Create your account
      </h2>
      <p className="text-[14px] text-[#64748B] text-center mt-1">
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
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 8 characters"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[var(--text-primary)]"
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
            className="w-full bg-[#00B4A6] hover:bg-[#00A396] text-white"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Create Account
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-[#64748B]">
        Already have an account?{" "}
        <Link href="/login" className="text-[#00B4A6] hover:underline font-medium">
          Sign in &rarr;
        </Link>
      </p>
    </div>
  );
}
