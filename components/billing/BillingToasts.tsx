"use client";

import { useEffect } from "react";
import { toast } from "sonner";

interface BillingToastsProps {
  success: string | undefined;
  reason: string | undefined;
}

export function BillingToasts({ success, reason }: BillingToastsProps) {
  useEffect(() => {
    if (success === "true") {
      toast.success("Plan upgraded successfully! Welcome aboard.");
    }
    if (reason === "trial_expired") {
      toast.warning("Your trial has ended. Choose a plan to continue.");
    }
  }, [success, reason]);

  return null;
}
