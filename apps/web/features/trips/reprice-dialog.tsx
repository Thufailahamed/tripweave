"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alert, Badge, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { ApiError, apiPost, errorMessage } from "@/lib/api";
import { money, titleCase } from "@/lib/utils";
import { tripKeys } from "./hooks";
import { REJECTION_LABELS, type PackageView, type RepriceResponse } from "./types";

/** Re-price: optionally re-checks every hotel with its supplier first. Creates a new package; the original is untouched. */
export function RepriceDialog({ pkg, tripId, open, onOpenChange, showCost }: { pkg: PackageView; tripId: string; open: boolean; onOpenChange: (o: boolean) => void; showCost: boolean }) {
  const qc = useQueryClient();
  const [live, setLive] = React.useState(false);
  const [result, setResult] = React.useState<RepriceResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [violations, setViolations] = React.useState<{ stopId: string; offerId: string; reasons: string[] }[]>([]);
  const [changes, setChanges] = React.useState<RepriceResponse["changes"]>([]);

  React.useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setViolations([]);
      setChanges([]);
    }
  }, [open]);

  const run = useMutation({
    mutationFn: () => apiPost<RepriceResponse>(`/packages/${pkg.id}/reprice`, { recheck: live }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      qc.invalidateQueries({ queryKey: ["trips", "packages", tripId] });
      qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      toast.success("Re-priced: a new package was added");
    },
    onError: (e) => {
      setError(errorMessage(e));
      const d = e instanceof ApiError ? (e.details as { violations?: typeof violations; changes?: typeof changes } | undefined) : undefined;
      setViolations(Array.isArray(d?.violations) ? d!.violations! : []);
      setChanges(Array.isArray(d?.changes) ? d!.changes! : []);
    },
  });

  const destOf = (id: string) => pkg.package.selections.find((s) => s.stopId === id)?.destination ?? "a stop";
  const shownChanges = result?.changes ?? changes;
  const cur = pkg.package.currency;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title="Re-price package" description="Recalculates the package with current exchange rates and pricing settings. A live supplier check also re-confirms each hotel's rate and availability.">
        <div className="flex flex-col gap-4">
          {!result ? (
            <>
              <Switch checked={live} onCheckedChange={setLive} label="Live supplier check (re-verify each hotel with its supplier)" />
              <p className="text-xs text-muted-foreground">Without the live check, stored rates are re-used and only pricing and exchange rates are refreshed. If a supplier cannot be reached the request fails with that supplier's error.</p>
            </>
          ) : null}
          {error ? (
            <Alert tone="danger" title={error}>
              {violations.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {violations.map((v, i) => (
                    <li key={i}>
                      {destOf(v.stopId)}: {v.reasons.map((r) => REJECTION_LABELS[r] ?? titleCase(r)).join("; ")}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}
          {result ? (
            <div className="flex flex-col gap-3">
              <Alert tone={result.valid ? "success" : "warning"} title={result.valid ? "Re-priced; still meets every mandatory requirement" : "Re-priced, but the package no longer meets every requirement"}>
                A new package (#{result.package.number}) was added next to the original.
                {!result.valid && result.violations.length ? (
                  <ul className="mt-1 list-disc pl-5">
                    {result.violations.map((v, i) => (
                      <li key={i}>
                        {destOf(v.stopId)}: {v.reasons.map((r) => REJECTION_LABELS[r] ?? titleCase(r)).join("; ")}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Alert>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-xs font-medium text-muted-foreground">Selling price before</dt>
                  <dd className="tw-num text-lg font-semibold">{pkg.pricing ? money(pkg.pricing.sellingPriceMinor, pkg.pricing.currency) : "Unavailable"}</dd>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <dt className="text-xs font-medium text-muted-foreground">Selling price after</dt>
                  <dd className="tw-num text-lg font-semibold">{result.package.pricing ? money(result.package.pricing.sellingPriceMinor, result.package.pricing.currency) : "Unavailable"}</dd>
                </div>
                {showCost ? (
                  <>
                    <div className="rounded-lg border border-border p-3">
                      <dt className="text-xs font-medium text-muted-foreground">Supplier cost before</dt>
                      <dd className="tw-num font-semibold">{money(result.previousTotalMinor, cur)}</dd>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <dt className="text-xs font-medium text-muted-foreground">Supplier cost after</dt>
                      <dd className="tw-num font-semibold">{money(result.newTotalMinor, cur)}</dd>
                    </div>
                  </>
                ) : null}
              </dl>
            </div>
          ) : null}
          {shownChanges.length > 0 ? (
            <div>
              <h4 className="mb-1 text-xs font-medium text-muted-foreground">Supplier check results</h4>
              <ul className="flex flex-col gap-1.5">
                {shownChanges.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <span className="font-semibold">{destOf(c.stopId)}</span>
                    <StatusBadge status={c.status} />
                    {showCost && c.currentTotalMinor !== null ? (
                      <span className="tw-num text-muted-foreground">
                        {money(c.previousTotalMinor, cur)} → {money(c.currentTotalMinor, cur)}
                      </span>
                    ) : null}
                    {c.message ? <span className="text-xs text-muted-foreground">{c.message}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : result && live ? (
            <Badge tone="neutral">No supplier changes reported</Badge>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {result ? "Close" : "Cancel"}
            </Button>
            {!result ? (
              <Button loading={run.isPending} onClick={() => run.mutate()}>
                {live ? "Re-price with live check" : "Re-price"}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
