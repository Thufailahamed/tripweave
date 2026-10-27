"use client";
import * as React from "react";
import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, StatusBadge } from "@/components/ui/card";
import { cn, formatDateTime, money, percentFromBp, titleCase } from "@/lib/utils";
import { parseReasons, statusLabel } from "./helpers";
import type { AcceptanceRow, ApprovalRow, StatusHistoryRow, VersionSummary } from "./types";

export function VersionHistory({ quoteId, versions, currentVersion, selected, currency }: { quoteId: string; versions: VersionSummary[]; currentVersion: number; selected: number; currency: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Version history</CardTitle>
        <CardDescription>Every revision is kept. Issued versions are immutable; a change always creates a new version.</CardDescription>
      </CardHeader>
      <ul>
        {versions.map((v) => {
          const active = v.versionNumber === selected;
          return (
            <li key={v.versionNumber} className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 first:border-t-0", active && "bg-primary-soft/50")}>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  Version {v.versionNumber}
                  {v.versionNumber === currentVersion ? <Badge tone="primary">Current</Badge> : <Badge tone="outline"><Lock className="size-3" aria-hidden /> Read-only</Badge>}
                  {v.approvalRequired ? v.approvedAt ? <Badge tone="success"><Check className="size-3" aria-hidden /> Approved</Badge> : <Badge tone="warning">Approval needed</Badge> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(v.createdAt)}
                  {v.grossMarginBp !== undefined ? ` · margin ${percentFromBp(v.grossMarginBp)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="tw-num font-medium">{money(v.sellingPriceMinor, currency)}</span>
                {active ? (
                  <span className="text-xs font-semibold text-primary" aria-current="true">Viewing</span>
                ) : (
                  <Link className="text-xs font-semibold text-primary hover:underline" href={v.versionNumber === currentVersion ? `/quotes/${quoteId}` : `/quotes/${quoteId}?version=${v.versionNumber}`}>
                    View
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function StatusTimeline({ history }: { history: StatusHistoryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status history</CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No status changes recorded.</p>
        ) : (
          <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
            {[...history].reverse().map((h) => (
              <li key={h.id} className="relative">
                <span aria-hidden className="absolute -left-[26px] top-1.5 size-3 rounded-full border-2 border-accent bg-card" />
                <p className="flex flex-wrap items-center gap-1.5 text-sm">
                  {h.from_status ? (
                    <>
                      <StatusBadge status={h.from_status} label={statusLabel(h.from_status)} /> <span aria-label="to">→</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Created as</span>
                  )}
                  <StatusBadge status={h.to_status} label={statusLabel(h.to_status)} />
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(h.created_at)} · {h.changed_by_name ?? "Client or system"}
                </p>
                {h.note ? <p className="mt-0.5 text-sm">{h.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function AcceptancesCard({ acceptances }: { acceptances: AcceptanceRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Client responses</CardTitle>
        <CardDescription>Acceptances and declines, including those recorded by staff on the client&apos;s behalf.</CardDescription>
      </CardHeader>
      <CardContent>
        {acceptances.length === 0 ? (
          <p className="text-sm text-muted-foreground">No response has been recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {acceptances.map((a) => (
              <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={a.decision === "accept" ? "accepted" : "rejected"} label={a.decision === "accept" ? "Accepted" : "Declined"} />
                  <span className="font-medium">{a.accepted_by_name}</span>
                  <span className="text-muted-foreground">{a.accepted_by_email}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Version {a.version_number} · {formatDateTime(a.created_at)}
                </p>
                {a.comment ? <p className="mt-1 whitespace-pre-wrap">{a.comment}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ApprovalsCard({ approvals }: { approvals: ApprovalRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Approvals</CardTitle>
        <CardDescription>Versions that exceeded a discount or margin threshold need a second person to approve them.</CardDescription>
      </CardHeader>
      <CardContent>
        {approvals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No version has needed approval.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {approvals.map((a) => {
              const reasons = parseReasons(a.reasons_json);
              return (
                <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Version {a.version_number}</span>
                    {a.decision ? <StatusBadge status={a.decision === "approved" ? "confirmed" : "rejected"} label={titleCase(a.decision)} /> : <StatusBadge status="pending" label="Awaiting decision" />}
                  </p>
                  {reasons.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">Reason: {reasons.map(titleCase).join(", ")}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Requested {formatDateTime(a.created_at)}
                    {a.decided_at ? ` · decided ${formatDateTime(a.decided_at)} by ${a.decided_by_name ?? "a manager"}` : ""}
                  </p>
                  {a.decision_note ? <p className="mt-1">{a.decision_note}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
