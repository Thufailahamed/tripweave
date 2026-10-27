"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Link2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { QuoteStatus } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, ConfirmDialog } from "@/components/ui/overlay";
import { Field, Input } from "@/components/ui/form";
import { apiDelete, apiPost, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { SHAREABLE, copyText } from "./helpers";
import { quoteKeys, type ShareResult, type ShareRow } from "./types";

/** Displays a freshly minted share URL. The raw token is never retrievable again. */
export function ShareUrlBox({ result }: { result: ShareResult }) {
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="warning" title="Copy this link now">
        For security the link is shown only once and can&apos;t be retrieved later. If you lose it, create a new link (and revoke this one).
      </Alert>
      <div className="flex gap-2">
        <Input readOnly aria-label="Client share link" value={result.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <Button
          variant="secondary"
          onClick={async () => ((await copyText(result.url)) ? toast.success("Link copied") : toast.error("Could not copy. Select the link and copy it manually."))}
        >
          <Copy /> Copy
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Shows version {result.version} · expires {formatDateTime(result.expiresAt)}
        {result.emailed !== undefined ? (result.emailed ? " · emailed to the customer" : " · not emailed (no customer email on file or emailing was switched off)") : ""}
      </p>
    </div>
  );
}

function shareState(s: ShareRow): { label: string; tone: "success" | "danger" | "warning" } {
  if (s.revokedAt) return { label: "Revoked", tone: "danger" };
  if (new Date(s.expiresAt).getTime() < Date.now()) return { label: "Expired", tone: "warning" };
  return { label: "Active", tone: "success" };
}

export function ShareLinks({ quoteId, status, shares, currentVersion }: { quoteId: string; status: QuoteStatus; shares: ShareRow[]; currentVersion: number }) {
  const qc = useQueryClient();
  const [revoke, setRevoke] = React.useState<ShareRow | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [days, setDays] = React.useState("30");
  const [created, setCreated] = React.useState<ShareResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const shareable = SHAREABLE.includes(status);

  const revokeM = useMutation({
    mutationFn: (id: string) => apiDelete(`/quotes/${quoteId}/shares/${id}`),
    onSuccess: () => {
      toast.success("Link revoked. The client can no longer open it.");
      setRevoke(null);
      void qc.invalidateQueries({ queryKey: quoteKeys.detailAll(quoteId) });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setRevoke(null);
    },
  });
  const createM = useMutation({
    mutationFn: (expiresInDays: number) => apiPost<ShareResult>(`/quotes/${quoteId}/share`, { expiresInDays }),
    onSuccess: (r) => {
      setCreated(r);
      setError(null);
      void qc.invalidateQueries({ queryKey: quoteKeys.detailAll(quoteId) });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const n = Number(days);
  const daysValid = Number.isInteger(n) && n >= 1 && n <= 180;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Client share links</CardTitle>
          <CardDescription>Each link opens the version it was issued for. Revoke a link to cut off access immediately.</CardDescription>
        </div>
        <Button
          size="sm"
          disabled={!shareable}
          title={shareable ? undefined : "Links can be created once the quotation is ready for review or sent."}
          onClick={() => {
            setCreated(null);
            setError(null);
            setCreateOpen(true);
          }}
        >
          <Link2 /> New link
        </Button>
      </CardHeader>
      {shares.length === 0 ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">No links yet. Sending the quotation creates the first one.</p>
        </CardContent>
      ) : (
        <ul>
          {shares.map((s) => {
            const st = shareState(s);
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm first:border-t-0">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    Version {s.versionNumber}
                    {s.versionNumber !== currentVersion ? <Badge tone="outline">Older version</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Created {formatDateTime(s.createdAt)} · expires {formatDateTime(s.expiresAt)}
                    {s.revokedAt ? ` · revoked ${formatDateTime(s.revokedAt)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tw-num inline-flex items-center gap-1 text-xs text-muted-foreground" title={s.firstViewedAt ? `First opened ${formatDateTime(s.firstViewedAt)}` : "Not opened yet"}>
                    <Eye className="size-3.5" aria-hidden /> {s.viewCount} view{s.viewCount === 1 ? "" : "s"}
                  </span>
                  {!s.revokedAt ? (
                    <Button size="sm" variant="outline" onClick={() => setRevoke(s)}>
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={revoke !== null}
        onOpenChange={(o) => !o && setRevoke(null)}
        title="Revoke this share link?"
        description="Anyone holding this link will immediately see an “invalid or expired” page. This can't be undone."
        confirmLabel="Revoke link"
        destructive
        loading={revokeM.isPending}
        onConfirm={() => revoke && revokeM.mutate(revoke.id)}
      />

      <Dialog open={createOpen} onOpenChange={(o) => !createM.isPending && setCreateOpen(o)}>
        <DialogContent title="Create a share link" description={`The link will show version ${currentVersion} of this quotation.`}>
          {created ? (
            <div className="flex flex-col gap-4">
              <ShareUrlBox result={created} />
              <div className="flex justify-end">
                <Button onClick={() => setCreateOpen(false)}>Done</Button>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (daysValid) createM.mutate(n);
              }}
            >
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Field label="Link valid for (days)" htmlFor="share-days" error={daysValid ? null : "Enter a whole number from 1 to 180."} required>
                <Input id="share-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
              </Field>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Creating a link doesn&apos;t email the customer. Use “Send to client” for that.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createM.isPending} disabled={!daysValid}>Create link</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
