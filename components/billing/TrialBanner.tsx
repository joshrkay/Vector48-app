import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface TrialBannerProps {
  daysRemaining: number;
}

export function TrialBanner({ daysRemaining }: TrialBannerProps) {
  if (daysRemaining > 5) return null;

  return (
    <div className="flex items-center justify-between border-b border-[#F59E0B] bg-[#FFFBEB] px-6 py-2">
      <div className="flex items-center gap-2 text-sm text-amber-800">
        <AlertTriangle size={16} className="shrink-0 text-amber-500" />
        <span>
          Your trial ends in{" "}
          <strong>
            {daysRemaining} {daysRemaining === 1 ? "day" : "days"}
          </strong>
        </span>
      </div>
      <Link
        href="/billing"
        className="text-sm font-medium text-amber-700 hover:text-amber-900"
      >
        Add payment method →
      </Link>
    </div>
  );
}
