"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, RotateCcw, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { QuoteStatus } from "@tripweave/shared";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Field, Input, Switch, Textarea } from "@/components/ui/form";
import { apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { canIssue, canMove, statusLabel } from "./helpers";
import { ShareUrlBox } from "./share-links";
import { quoteKeys, type QuoteSummary, type ShareResult } from "./types";

interface StatusAction {
  key: string;
  to: QuoteStatus;
  label: string;
  title: string;
  description: string;
  confirm: string;
  destructive?: boolean;
  icon: React.ReactNode;
  variant: "default" | "outline" | "destructive" | "secondary";
  askNote?: boolean;
}

function statusActions(status: QuoteStatus): StatusAction[] {
  const out: StatusAction[] = [];
  if (canMove(status, "ready_for_review"))
    out.push({ key: "review", to: "ready_for_review", label: "Mark ready for review", title: "Mark ready for review?", description: "Signals that pricing and content are final and awaiting any approval before sending.", confirm: "Mark ready", icon: <ClipboardCheck />, variant: "secondary" });
  if (canMove(status, "accepted"))
    out.push({ key: "accepted", to: "accepted", label: "Record accepted", title: "Record that the client accepted?", description: "Use this when the client confirmed outside the link (email, phone). The trip is marked won and your name is recorded as having entered it.", confirm: "Record acceptance", icon: <CheckCircle2 />, variant: "outline", askNote: true });
  if (canMove(status, "rejected"))
    out.push({ key: "rejected", to: "rejected", label: "Record declined", title: "Record that the client declined?", description: "The trip is marked lost. You can reopen the quotation as a draft later.", confirm: "Record decline", icon: <XCircle />, variant: "outline", askNote: true });
  if (canMove(status, "expired"))
    out.push({ key: "expired", to: "expired", label: "Mark expired", title: "Mark this quotation as expired?", description: "All share links are revoked. You can reopen it as a draft and issue a new version.", confirm: "Mark expired", icon: <XCircle />, variant: "outline", destructive: true });
  if (canMove(status, "draft"))
    out.push({
      key: "draft",
      to: "draft",
      label: status === "rejected" || status === "expired" ? "Reopen as draft" : "Return to draft",
      title: status === "rejected" || status === "expired" ? "Reopen this quotation as a draft?" : "Return this quotation to draft?",
      description: "The quotation becomes editable again. Anything already issued stays as it was, and existing links keep working until revoked.",
      confirm: "Reopen",
      icon: <RotateCcw />,
      variant: "outline",
      askNote: true,
    });
  if (canMove(status, "cancelled"))
    out.push({ key: "cancel", to: "cancelled", label: "Cancel quotation", title: "Cancel this quotation?", description: "Cancelled quotations are final: share links are revoked and it can't be reopened.", confirm: "Cancel quotation", destructive: true, icon: <XCircle />, variant: "destructive", askNote: true });
  return out;
}

export function LifecycleActions({ quote }: { quote: QuoteSummary }) {
  const can = useCan();
  const qc = useQueryClient();
  const [active, setActive] = React.useState<StatusAction | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sendOpen, setSendOpen] = React.useState(false);

  const done = () => void qc.invalidateQueries({ queryKey: quoteKeys.all });
  const statusM = useMutation({
    mutationFn: (a: StatusAction) => apiPost(`/quotes/${quote.id}/status`, { status: a.to, note: note.trim() || undefined }),
    onSuccess: (_r, a) => {
      toast.success(`Quotation ${a.to === "draft" ? "reopened as draft" : `marked ${statusLabel(a.to).toLowerCase()}`}`);
      setActive(null);
      setNote("");
      done();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const actions = can("quotes:write") ? statusActions(quote.status) : [];
  const showSend = can("quotes:send") && canIssue(quote.status);
  if (!showSend && actions.length === 0) return <p className="text-sm text-muted-foreground">No actions are available for a {statusLabel(quote.status).toLowerCase()} quotation with your permissions.</p>;

  const open = (a: StatusAction) => {
    setError(null);
    setNote("");
    setActive(a);
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {showSend ? (
          <Button onClick={() => setSendOpen(true)}>
            <Send /> {quote.status === "sent" || quote.status === "viewed" ? "Send again (new link)" : "Send to client"}
          </Button>
        ) : null}
        {actions.map((a) => (
          <Button key={a.key} variant={a.variant} size="sm" onClick={() => open(a)}>
            {a.icon} {a.label}
          </Button>
        ))}
      </div>

      <Dialog open={active !== null} onOpenChange={(o) => !o && !statusM.isPending && setActive(null)}>
        {active ? (
          <DialogContent title={active.title} description={active.description}>
            <div className="flex flex-col gap-4">
              {error ? <Alert tone="danger">{error}</Alert> : null}
              {active.askNote ? (
                <Field label="Note (optional)" htmlFor="status-note" hint="Saved in the status history.">
                  <Textarea id="status-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setActive(null)} disabled={statusM.isPending}>Back</Button>
                <Button variant={active.destructive ? "destructive" : "default"} loading={statusM.isPending} onClick={() => statusM.mutate(active)}>
                  {active.confirm}
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <SendDialog quote={quote} open={sendOpen} onOpenChange={setSendOpen} onSent={done} />
    </>
  );
}

function SendDialog({ quote, open, onOpenChange, onSent }: { quote: QuoteSummary; open: boolean; onOpenChange: (o: boolean) => void; onSent: () => void }) {
  const [message, setMessage] = React.useState("");
  const [days, setDays] = React.useState("30");
  const [email, setEmail] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ShareResult | null>(null);
  const n = Number(days);
  const daysValid = Number.isInteger(n) && n >= 1 && n <= 180;

  React.useEffect(() => {
    if (open) {
      setError(null);
      setResult(null);
    }
  }, [open]);

  const m = useMutation({
    mutationFn: () => apiPost<ShareResult>(`/quotes/${quote.id}/send`, { message: message.trim() || undefined, expiresInDays: n, email }),
    onSuccess: (r) => {
      setResult(r);
      toast.success("Quotation issued");
      onSent();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !m.isPending && onOpenChange(o)}>
      <DialogContent title={result ? "Quotation sent" : "Send to client"} description={result ? undefined : `Issues version ${quote.currentVersion} of ${quote.quoteNumber} and creates a private link for the client.`}>
        {result ? (
          <div className="flex flex-col gap-4">
            <ShareUrlBox result={result} />
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (daysValid) m.mutate();
            }}
          >
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label="Message to the client (optional)" htmlFor="send-message" hint="Added above the link in the email.">
              <Textarea id="send-message" maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <Field label="Link valid for (days)" htmlFor="send-days" error={daysValid ? null : "Enter a whole number from 1 to 180."} required>
              <Input id="send-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
            <Switch checked={email} onCheckedChange={setEmail} label="Email the link to the customer" />
            <p className="text-xs text-muted-foreground">
              {quote.customerName ? `The email goes to ${quote.customerName} if they have an email address on file.` : "This quotation has no customer, so nothing can be emailed."} The link is displayed once after sending.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={m.isPending}>Cancel</Button>
              <Button type="submit" loading={m.isPending} disabled={!daysValid}>
                <Send /> Send
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
