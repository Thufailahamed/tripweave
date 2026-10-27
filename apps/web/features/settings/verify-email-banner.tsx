"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiPost, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";

/** Shown above every page while the signed-in user's email address is unverified. */
export function VerifyEmailBanner() {
  const { data: session } = useSession();
  const [sent, setSent] = React.useState(false);
  const resend = useMutation({
    mutationFn: () => apiPost<{ message: string }>("/auth/resend-verification"),
    onSuccess: (r) => {
      setSent(true);
      toast.success(r.message);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!session || session.user.emailVerified) return null;
  return (
    <div role="status" className="tw-rise mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-warning/25 bg-warning-soft/50 px-4 py-2.5 text-[13px]">
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-warning/60" />
        <span className="relative size-2 rounded-full bg-warning" />
      </span>
      <span className="min-w-0 flex-1 text-foreground/80">
        <span className="font-semibold text-foreground">Verify your email.</span> We sent a link to <span className="text-foreground">{session.user.email}</span>; some features stay limited until you open it.
      </span>
      <Button size="sm" variant="outline" loading={resend.isPending} disabled={sent} onClick={() => resend.mutate()}>
        {sent ? "Email sent" : "Resend email"}
      </Button>
    </div>
  );
}
