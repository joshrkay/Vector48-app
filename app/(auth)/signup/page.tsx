"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserClient } from "@/lib/supabase/client";

const signupSchema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignupValues = z.infer<typeof signupSchema>;

const TRIAL_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
  });

  async function onSubmit(data: SignupValues) {
    setServerError(null);
    const supabase = createBrowserClient();

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      setServerError(authError.message);
      return;
    }

    const user = authData.user;
    if (!user) {
      setServerError("Signup succeeded but no user was returned. Please try again.");
      return;
    }

    // 2. Create account row (trigger auto-sets trial_ends_at and creates account_users row)
    const { error: accountError } = await supabase
      .from("accounts")
      .insert({
        owner_user_id: user.id,
        business_name: data.businessName,
        vertical: "hvac", // placeholder — overwritten during onboarding
        trial_ends_at: new Date(Date.now() + TRIAL_DAYS * MS_PER_DAY).toISOString(),
        plan_slug: "trial",
        provisioning_status: "pending",
      })
      .select("id")
      .single();

    if (accountError) {
      console.error("Account creation failed:", accountError.message);
      setServerError("An unexpected error occurred while creating your account. Please try again.");
      return;
    }

    // 3. Create account_users join row
    const { error: membershipError } = await supabase
      .from("account_users")
      .insert({
        account_id: account.id,
        user_id: user.id,
        role: "admin",
      });

    if (membershipError) {
      console.error("Membership creation failed:", membershipError.message);
      setServerError("An unexpected error occurred while creating your account. Please try again.");
      return;
    }

    // 4. Redirect to onboarding
    router.push("/onboarding");
  }

  return (
    <div>
      <h1 className="font-heading font-bold text-[22px]">Create your account</h1>
      <p className="mt-1 text-[13px] text-[#64748B]">
        Start your 7-day free trial. No credit card required.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        {/* Business Name */}
        <div className="space-y-1.5">
          <Label htmlFor="businessName">Business name</Label>
          <Input
            id="businessName"
            type="text"
            placeholder="e.g. Martinez HVAC & Cooling"
            {...register("businessName")}
          />
          {errors.businessName && (
            <p className="text-[13px] text-destructive">{errors.businessName.message}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-[13px] text-destructive">{errors.email.message}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Min. 8 characters"
              className="pr-10"
              {...register("password")}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && (
            <p className="text-[13px] text-destructive">{errors.password.message}</p>
          )}
        </div>

        {/* Server error */}
        {serverError && (
          <p className="text-[13px] text-destructive">{serverError}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center rounded-lg bg-[#00B4A6] text-white font-medium h-11 text-sm transition-colors hover:bg-[#00a396] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-[#64748B]">
        Already have an account?{" "}
        <Link href="/login" className="text-[#00B4A6] font-medium hover:underline">
          Sign in &rarr;
        </Link>
      </p>
    </div>
  );
}
