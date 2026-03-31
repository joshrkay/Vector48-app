"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@/lib/supabase/client";
import { DeleteAccountModal } from "./DeleteAccountModal";

export function AccountSection({
  ownerEmail,
  ownerName,
}: {
  ownerEmail: string;
  ownerName: string;
}) {
  const [password, setPassword] = React.useState("");
  const [password2, setPassword2] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  async function updatePassword() {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== password2) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password updated");
      setPassword("");
      setPassword2("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-8">
      <div className="rounded-xl border bg-card p-4 shadow-sm md:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Owner
        </h2>
        <div className="mt-4 space-y-2">
          <Label>Name</Label>
          <p className="text-sm">{ownerName || "—"}</p>
        </div>
        <div className="mt-4 space-y-2">
          <Label>Email</Label>
          <p className="text-sm text-muted-foreground">{ownerEmail}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm md:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Password
        </h2>
        <div className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="new_pw">New password</Label>
            <Input
              id="new_pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_pw2">Confirm password</Label>
            <Input
              id="new_pw2"
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button type="button" onClick={updatePassword} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-card p-4 shadow-sm md:p-6">
        <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Permanently delete your account and data.
        </p>
        <Button
          type="button"
          variant="destructive"
          className="mt-4"
          onClick={() => setDeleteOpen(true)}
        >
          Delete account
        </Button>
      </div>

      <DeleteAccountModal open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
