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

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginValues) {
    setServerError(null);
    const supabase = createBrowserClient();

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

    if (authError || !authData.user) {
      setServerError("Invalid email or password");
      return;
    }

    const user = authData.user;

    // Check onboarding status
    const { data: account } = await supabase
      .from("accounts")
      .select("onboarding_completed_at")
      .eq("owner_user_id", user.id)
      .single();

    if (!account || !account.onboarding_completed_at) {
      router.push("/onboarding");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div>
      <h1 className="font-heading font-bold text-[22px]">Welcome back</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-[13px] text-[#00B4A6] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
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
            "Sign In"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-[#64748B]">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-[#00B4A6] font-medium hover:underline">
          Start free trial &rarr;
        </Link>
      </p>
    </div>
  );
}
