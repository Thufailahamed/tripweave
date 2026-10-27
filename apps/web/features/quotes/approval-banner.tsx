"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Field, Textarea } from "@/components/ui/form";
import { ApiError, apiPost, errorMessage } from "@/lib/api";
import { parseReasons } from "./helpers";
import { quoteKeys, type ApprovalRow } from "./types";

/**
 * Shown when the current version needs a second person's approval (maker-checker). The API enforces
 * that the author cannot approve their own quotation unless they are the owner.
 */
export function ApprovalBanner({ quoteId, version, approvals, canApprove, reasons }: { quoteId: string; version: number; approvals: ApprovalRow[]; canApprove: boolean; reasons?: string[] }) {
  const qc = useQueryClient();
  const [decision, setDecision] = React.useState<"approved" | "rejected" | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<{ message: string; forbidden: boolean } | null>(null);
  const latest = approvals.find((a) => a.version_number === version);
  const declined = latest?.decision === "rejected";
  const stored = latest ? parseReasons(latest.reasons_json) : [];
  const why = (reasons && reasons.length ? reasons : stored).join(", ");

  const m = useMutation({
    mutationFn: (d: "approved" | "rejected") => apiPost(`/quotes/${quoteId}/approve`, { decision: d, note: note.trim() || undefined }),
    onSuccess: (_r, d) => {
      toast.success(d === "approved" ? "Version approved" : "Version rejected");
      setDecision(null);
      setNote("");
      setError(null);
      void qc.invalidateQueries({ queryKey: quoteKeys.all });
    },
    onError: (e) => setError({ message: errorMessage(e), forbidden: e instanceof ApiError && e.status === 403 }),
  });

  if (declined) {
    return (
      <Alert tone="danger" title={`Version ${version} was rejected by ${latest?.decided_by_name ?? "a manager"}`}>
        {latest?.decision_note ? `“${latest.decision_note}” ` : ""}Create a new version with revised pricing to continue.
      </Alert>
    );
  }

  return (
    <>
      <Alert tone="warning" title="Manager approval required before this version can be sent">
        <p>{why ? `Reason: ${why}.` : "This version exceeds a discount or margin threshold."}</p>
        {canApprove ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => (setError(null), setDecision("approved"))}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => (setError(null), setDecision("rejected"))}>Reject</Button>
          </div>
        ) : (
          <p className="mt-1 text-xs">Ask a manager with approval rights to review it.</p>
        )}
      </Alert>
      <Dialog open={decision !== null} onOpenChange={(o) => !o && !m.isPending && setDecision(null)}>
        <DialogContent title={decision === "approved" ? "Approve this version" : "Reject this version"} description="The decision and your name are recorded in the approval history.">
          <div className="flex flex-col gap-4">
            {error ? (
              <Alert tone="danger" title={error.forbidden ? "You can't decide this one" : undefined}>
                {error.forbidden ? "Quotations need a four-eyes check: a different manager must approve a quotation you prepared (only an owner can approve their own). Ask another manager to review it." : error.message}
              </Alert>
            ) : null}
            <Field label="Note (optional)" htmlFor="approval-note" hint="Up to 500 characters.">
              <Textarea id="approval-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDecision(null)} disabled={m.isPending}>Cancel</Button>
              <Button variant={decision === "rejected" ? "destructive" : "default"} loading={m.isPending} onClick={() => decision && m.mutate(decision)}>
                {decision === "approved" ? "Approve" : "Reject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
