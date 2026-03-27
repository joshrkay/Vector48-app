import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="font-heading font-bold text-[22px]">Reset your password</h1>
      <p className="mt-1 text-[13px] text-[#64748B]">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <div className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@company.com" disabled />
        </div>

        <div className="relative group">
          <button
            type="button"
            disabled
            className="flex w-full items-center justify-center rounded-lg bg-[#00B4A6] text-white font-medium h-11 text-sm opacity-60 cursor-not-allowed"
          >
            Send reset link
          </button>
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded bg-gray-800 px-2 py-1 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Coming soon
          </span>
        </div>
      </div>

      <p className="mt-6 text-center text-[13px] text-[#64748B]">
        <Link href="/login" className="text-[#00B4A6] font-medium hover:underline">
          &larr; Back to sign in
        </Link>
      </p>
    </div>
  );
}
