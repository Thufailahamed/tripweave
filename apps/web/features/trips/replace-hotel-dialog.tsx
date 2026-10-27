"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alert, Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { ApiError, apiGet, apiPost, errorMessage } from "@/lib/api";
import { cn, mealLabel, money, nightsLabel, titleCase } from "@/lib/utils";
import { AvailabilityBadges, cancellationText } from "./availability-badge";
import { tripKeys } from "./hooks";
import { REJECTION_LABELS, type AlternativesResponse, type PackageView } from "./types";

export function ReplaceHotelDialog({ pkg, tripId, open, onOpenChange, showCost }: { pkg: PackageView; tripId: string; open: boolean; onOpenChange: (o: boolean) => void; showCost: boolean }) {
  const qc = useQueryClient();
  const selections = pkg.package.selections;
  const [stopId, setStopId] = React.useState(selections[0]?.stopId ?? "");
  const [offerId, setOfferId] = React.useState("");
  const [violations, setViolations] = React.useState<{ stopId: string; offerId: string; reasons: string[] }[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setOfferId("");
      setViolations([]);
      setError(null);
    }
  }, [open, stopId]);

  const alts = useQuery({ queryKey: ["trips", "alternatives", pkg.id, stopId], queryFn: () => apiGet<AlternativesResponse>(`/packages/${pkg.id}/alternatives`, { stopId }), enabled: open && !!stopId });

  const replace = useMutation({
    mutationFn: () => apiPost<PackageView>(`/packages/${pkg.id}/hotels`, { stopId, offerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips", "packages", tripId] });
      qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      toast.success("A new package with the replacement hotel was created. The original is unchanged.");
      onOpenChange(false);
    },
    onError: (e) => {
      setError(errorMessage(e));
      const v = e instanceof ApiError ? (e.details as { violations?: typeof violations } | undefined)?.violations : undefined;
      setViolations(Array.isArray(v) ? v : []);
    },
  });

  const destOf = (id: string) => selections.find((s) => s.stopId === id)?.destination ?? "a stop";
  const f = alts.data?.funnel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title="Replace a hotel" description="Only hotels that still meet every mandatory requirement are listed. Saving creates a new package marked as manually modified; the original stays as it was.">
        <div className="flex flex-col gap-4">
          {error ? (
            <Alert tone="danger" title={error}>
              {violations.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {violations.map((v, i) => (
                    <li key={i}>
                      {destOf(v.stopId)}: {v.reasons.length ? v.reasons.map((r) => REJECTION_LABELS[r] ?? titleCase(r)).join("; ") : "no hotel selected"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ) : null}
          <Field label="Stop to change" htmlFor="rh-stop">
            <Select id="rh-stop" value={stopId} onChange={(e) => setStopId(e.target.value)}>
              {selections.map((s) => (
                <option key={s.stopId} value={s.stopId}>
                  {s.destination}: currently {s.offer.property.name} ({nightsLabel(s.offer.nights)})
                </option>
              ))}
            </Select>
          </Field>
          {alts.isLoading ? (
            <LoadingBlock label="Finding alternatives" rows={3} />
          ) : alts.isError ? (
            <ErrorState error={alts.error} onRetry={() => alts.refetch()} title="Could not load alternatives" />
          ) : alts.data!.alternatives.length === 0 ? (
            <EmptyState title="No alternative hotels" description={f ? `${f.total} offer(s) were considered for ${f.destination}; none other satisfies the mandatory requirements${Object.keys(f.rejections).length ? ` (${Object.entries(f.rejections).map(([k, n]) => `${REJECTION_LABELS[k] ?? k}: ${n}`).join(", ")})` : ""}.` : undefined} />
          ) : (
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-muted-foreground">
                {alts.data!.alternatives.length} alternative{alts.data!.alternatives.length === 1 ? "" : "s"}
                {f ? ` (${f.accepted} of ${f.total} offers qualify)` : ""}
              </legend>
              <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
                {alts.data!.alternatives.map(({ offer, costMinor, sellingMinor, currency }) => {
                  const selected = offerId === offer.offerId;
                  const current = offer.offerId === alts.data!.currentOfferId;
                  return (
                    <li key={offer.offerId}>
                      <label className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 focus-within:outline-2 focus-within:outline-ring", selected ? "border-primary bg-primary-soft" : "border-border hover:bg-muted/50")}>
                        <input type="radio" name="alt-offer" className="mt-1 accent-[var(--primary)]" checked={selected} onChange={() => setOfferId(offer.offerId)} disabled={current} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{offer.property.name}</span>
                            {offer.property.category ? <Badge tone="outline">{titleCase(offer.property.category)}</Badge> : null}
                            {current ? <Badge tone="primary">Current</Badge> : null}
                          </span>
                          <span className="mt-0.5 block text-sm text-muted-foreground">
                            {offer.roomType.name} · {mealLabel(offer.mealPlan)} · {offer.property.reviewScore !== null ? `${offer.property.reviewScore}/10` : "unrated"}
                          </span>
                          <span className="block text-xs text-muted-foreground">{cancellationText(offer.cancellation)}</span>
                          <span className="mt-1 block">
                            <AvailabilityBadges offer={offer} />
                          </span>
                        </span>
                        <span className="tw-num shrink-0 text-right text-sm font-semibold">{money(sellingMinor, currency)}<span className="block text-xs font-normal text-muted-foreground">selling price</span>{showCost && costMinor !== undefined ? <span className="block text-xs font-normal text-muted-foreground">cost {money(costMinor, currency)}</span> : null}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!offerId} loading={replace.isPending} onClick={() => replace.mutate()}>
              Create package with this hotel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
