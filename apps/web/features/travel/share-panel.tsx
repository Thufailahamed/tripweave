"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Link2, Printer, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TravelerShare } from "@tripweave/shared";
import { Alert, Badge, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { apiDelete, apiPost, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { travelKeys, useTripShares } from "./hooks";

export function TravelSharePanel() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const sharesQuery = useTripShares(id);
  const [expiresInDays, setExpiresInDays] = React.useState(30);
  const [includeBudget, setIncludeBudget] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = React.useState<TravelerShare | null>(null);
  const [revoking, setRevoking] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  if (sharesQuery.isLoading) return <LoadingBlock label="Loading share links" />;
  const shares = sharesQuery.data?.shares ?? [];

  const create = async () => {
    setCreating(true);
    setError(null);
    setLink(null);
    setCopied(false);
    try {
      const result = await apiPost<{ url: string }>(`/traveler/trips/${id}/shares`, { expiresInDays, includeBudget });
      setLink(result.url);
      qc.invalidateQueries({ queryKey: travelKeys.shares(id) });
      toast.success("Share link created");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("The browser blocked clipboard access. Select the link and copy it manually.");
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await apiDelete(`/traveler/trips/${id}/shares/${revokeTarget.id}`);
      qc.invalidateQueries({ queryKey: travelKeys.shares(id) });
      setRevokeTarget(null);
      if (link) setLink(null);
      toast.success("Share link revoked");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="tw-travel-eyebrow">Share</p>
        <h2 className="tw-travel-display mt-2 text-4xl leading-none tracking-[-0.04em]">One link for the group.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">A read-only page with the route, dates and — if you choose — a budget summary. Notes, packing and account details are never included.</p>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {link ? (
        <section className="tw-travel-card flex flex-col gap-4 border-accent/40 p-5 md:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-success"><ShieldCheck className="size-4" /> This link is ready</div>
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/70 p-3 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all text-xs">{link}</code>
            <div className="flex shrink-0 gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}</Button>
              <Button asChild size="sm" variant="ghost"><a href={link} target="_blank" rel="noreferrer noopener"><ExternalLink className="size-4" /> Open</a></Button>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">For security, we only show a share link once. If you lose it, revoke it and create a new one. Anyone with the link can read the trip until it expires or is revoked.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><a href={link} target="_blank" rel="noreferrer noopener"><Printer className="size-4" /> Print preview</a></Button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <section className="tw-travel-card flex flex-col gap-4 p-5 md:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4 text-accent" /> Create a link</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Link expires" htmlFor="share-expiry">
              <Select id="share-expiry" value={String(expiresInDays)} onChange={(event) => setExpiresInDays(Number(event.target.value))}>
                <option value="7">In 7 days</option>
                <option value="30">In 30 days</option>
                <option value="90">In 90 days</option>
                <option value="180">In 180 days</option>
              </Select>
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox id="share-budget" label="Include a budget summary" checked={includeBudget} onChange={(event) => setIncludeBudget(event.target.checked)} />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">Creating a new link revokes the previous one. The trip itself stays private until someone opens a link.</p>
          <Button onClick={() => void create()} loading={creating} className="self-start"><Link2 className="size-4" /> {shares.length > 0 ? "Rotate share link" : "Create share link"}</Button>
        </section>

        <section className="tw-travel-card flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="tw-travel-eyebrow">Active links</p>
            <Badge tone={shares.length ? "success" : "outline"}>{shares.length}</Badge>
          </div>
          {shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active link. Create one when you want to send the trip to someone.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shares.map((share) => (
                <li key={share.id} className="rounded-xl border border-border/70 bg-background/60 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold">Expires {formatDate(share.expiresAt.slice(0, 10))}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{share.viewCount} view{share.viewCount === 1 ? "" : "s"} · {share.includeBudget ? "budget included" : "budget hidden"}</p>
                    </div>
                    <Button type="button" size="icon" variant="ghost" aria-label="Revoke share link" onClick={() => setRevokeTarget(share)}><Trash2 className="size-3.5" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">Existing links are not shown again. Create a new one to copy a fresh URL.</p>
        </section>
      </div>

      <ConfirmDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)} title="Revoke this link?" description="Anyone using the link will see the expired page immediately. You can create a new link afterwards." confirmLabel="Revoke" destructive loading={revoking} onConfirm={() => void revoke()} />
    </div>
  );
}
