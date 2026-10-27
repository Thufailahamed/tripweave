"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronUp, History, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, Badge, Card, EmptyState, ErrorState, LoadingBlock, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/overlay";
import { apiDelete, apiGet, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDate, formatDateTime, mealLabel, money, nightsLabel, percentFromBp, titleCase } from "@/lib/utils";
import { PAYMENT_TYPE_LABEL, PRICING_BASIS_LABEL, RATE_TYPE_LABEL, expiryState } from "./lib";
import { RatePlanForm } from "./rate-plan-form";
import { RuleForm } from "./rule-form";
import type { Agreement, Overlap, RateHistoryRow, RatePlan, RatePlanWithRules, RateRule, RoomType, Supplier } from "./types";

export function ExpiryBadge({ effectiveTo }: { effectiveTo: string }) {
  const s = expiryState(effectiveTo);
  if (!s) return null;
  return s.kind === "expired" ? <Badge tone="danger">Expired {s.days}d ago</Badge> : <Badge tone="warning">Expires in {s.days}d</Badge>;
}

const SCOPE_LABEL: Record<string, string> = { net_rates: "Net rates shared", indicative_only: "Indicative rates only" };

function HistoryPanel({ propertyId, plan }: { propertyId: string; plan: RatePlan }) {
  const q = useQuery({ queryKey: ["hotel", propertyId, "history", plan.id], queryFn: () => apiGet<RateHistoryRow[]>(`/rate-plans/${plan.id}/history`) });
  if (q.isLoading) return <LoadingBlock rows={3} label="Loading change history" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load history" />;
  if (!q.data || q.data.length === 0) return <p className="text-sm text-muted-foreground">No changes recorded yet.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {q.data.map((h) => {
        let after: Record<string, unknown> | null = null;
        try {
          after = h.after_json ? (JSON.parse(h.after_json) as Record<string, unknown>) : null;
        } catch {
          after = null;
        }
        return (
          <li key={h.id} className="rounded-md border border-border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{titleCase(h.change_type)}</span>
              <span className="text-xs text-muted-foreground">
                {h.changed_by_name ?? "System"} · {formatDateTime(h.created_at)}
              </span>
            </div>
            {after ? (
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {Object.entries(after)
                  .filter(([, val]) => val !== null && val !== undefined && typeof val !== "object")
                  .map(([k, val]) => `${titleCase(k.replace(/([A-Z])/g, " $1"))}: ${k === "amountMinor" && typeof val === "number" ? money(val, plan.currency) : String(val)}`)
                  .join(" · ")}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function RulesTable({ plan, overlapIds, canEdit, onEdit, onDelete }: { plan: RatePlanWithRules; overlapIds: Set<string>; canEdit: boolean; onEdit: (r: RateRule) => void; onDelete: (r: RateRule) => void }) {
  if (plan.rules.length === 0) return <p className="text-sm text-muted-foreground">No rate rules yet, so this plan has no prices.{canEdit ? " Add a seasonal rule to set a nightly amount." : ""}</p>;
  return (
    <div className="relative overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">Rate rules for {plan.name}</caption>
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2">Dates</th>
            <th scope="col" className="px-3 py-2 text-right">Amount / night</th>
            <th scope="col" className="px-3 py-2">Priority</th>
            <th scope="col" className="px-3 py-2">Tax / service</th>
            <th scope="col" className="px-3 py-2">Extras</th>
            {canEdit ? <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {plan.rules.map((r) => (
            <tr key={r.id} className="border-t border-border align-top">
              <td className="px-3 py-2">
                <div className="font-medium">
                  {formatDate(r.applicableStartDate)} – {formatDate(r.applicableEndDate)}
                </div>
                {r.label ? <div className="text-xs text-muted-foreground">{r.label}</div> : null}
                {overlapIds.has(r.id) ? <Badge tone="warning" className="mt-1"><AlertTriangle className="size-3" aria-hidden /> Overlaps</Badge> : null}
                {r.blackoutDates.length > 0 ? <div className="mt-1 text-xs text-muted-foreground">{r.blackoutDates.length} blackout date{r.blackoutDates.length === 1 ? "" : "s"}</div> : null}
              </td>
              <td className="tw-num px-3 py-2 text-right font-semibold">{money(r.amountMinor, plan.currency)}</td>
              <td className="tw-num px-3 py-2">{r.priority}</td>
              <td className="px-3 py-2 text-xs">
                {r.taxTreatment.included ? "Inclusive" : `Tax ${percentFromBp(r.taxTreatment.taxBp)}`}
                {!r.taxTreatment.included ? ` + service ${percentFromBp(r.taxTreatment.serviceChargeBp)}` : ""}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                <div>Base {r.extraPersonRules.baseAdults} adult{r.extraPersonRules.baseAdults === 1 ? "" : "s"}</div>
                {r.extraPersonRules.extraAdultMinor > 0 ? <div>Extra adult {money(r.extraPersonRules.extraAdultMinor, plan.currency)}</div> : null}
                {r.extraPersonRules.extraChildMinor > 0 ? <div>Extra child {money(r.extraPersonRules.extraChildMinor, plan.currency)}</div> : null}
                {r.extraPersonRules.childFreeUnderAge > 0 ? <div>Free under {r.extraPersonRules.childFreeUnderAge}</div> : null}
                {r.occupancyConditions.minAdults || r.occupancyConditions.maxAdults ? (
                  <div>
                    Adults {r.occupancyConditions.minAdults ?? 1}–{r.occupancyConditions.maxAdults ?? "any"}
                  </div>
                ) : null}
              </td>
              {canEdit ? (
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" aria-label={`Edit rule ${formatDate(r.applicableStartDate)}`} onClick={() => onEdit(r)}>
                      <Pencil />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`Delete rule ${formatDate(r.applicableStartDate)}`} onClick={() => onDelete(r)}>
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanCard({ propertyId, plan, rooms, canEdit, suppliers, agreements, onEditPlan }: { propertyId: string; plan: RatePlanWithRules; rooms: RoomType[]; canEdit: boolean; suppliers: Map<string, Supplier>; agreements: Map<string, Agreement>; onEditPlan: (p: RatePlan) => void }) {
  const qc = useQueryClient();
  const [showHistory, setShowHistory] = React.useState(false);
  const [ruleDialog, setRuleDialog] = React.useState<RateRule | "new" | null>(null);
  const [deleteRule, setDeleteRule] = React.useState<RateRule | null>(null);
  const owned = !plan.shared;
  const room = rooms.find((r) => r.id === plan.roomTypeId);

  const overlaps = useQuery({ queryKey: ["hotel", propertyId, "overlaps", plan.id], queryFn: () => apiGet<{ overlaps: Overlap[] }>(`/rate-plans/${plan.id}/rules`), enabled: owned, retry: false });
  const overlapPairs = overlaps.data?.overlaps ?? [];
  const overlapIds = new Set(overlapPairs.flatMap((o) => [o.a, o.b]));
  const ruleById = new Map(plan.rules.map((r) => [r.id, r]));

  const del = useMutation({
    mutationFn: (r: RateRule) => apiDelete(`/rate-plans/${plan.id}/rules/${r.id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["hotel", propertyId] });
      await qc.invalidateQueries({ queryKey: ["expiring"] });
      toast.success("Rate rule deleted");
      setDeleteRule(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setDeleteRule(null);
    },
  });

  const supplier = plan.supplierId ? suppliers.get(plan.supplierId) : undefined;
  const agreement = plan.supplierAgreementId ? agreements.get(plan.supplierAgreementId) : undefined;
  const cancel = plan.cancellationPolicy;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold">{plan.name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {room?.name ?? plan.roomTypeName ?? "Room"} · {mealLabel(plan.mealPlan)} · {plan.currency}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge status={plan.status} />
            <Badge tone="outline">{RATE_TYPE_LABEL[plan.rateType] ?? plan.rateType}</Badge>
            <ExpiryBadge effectiveTo={plan.effectiveTo} />
            {plan.shared ? <Badge tone="info">Shared with you · {SCOPE_LABEL[plan.scope ?? ""] ?? plan.scope}</Badge> : null}
          </div>
        </div>
        {canEdit && owned ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onEditPlan(plan)}>
              <Pencil /> Edit plan
            </Button>
            <Button size="sm" onClick={() => setRuleDialog("new")}>
              <Plus /> Add rule
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Valid</dt>
            <dd>{formatDate(plan.effectiveFrom)} – {formatDate(plan.effectiveTo)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Stay length</dt>
            <dd>{nightsLabel(plan.minimumNights)} min{plan.maximumNights ? `, ${nightsLabel(plan.maximumNights)} max` : ""}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Pricing basis</dt>
            <dd>{PRICING_BASIS_LABEL[plan.pricingBasis] ?? plan.pricingBasis}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Cancellation</dt>
            <dd>
              {cancel.refundable === false ? "Non-refundable" : cancel.freeCancellationDaysBeforeArrival != null ? `Free until ${cancel.freeCancellationDaysBeforeArrival} days before arrival` : "Refundable"}
              {cancel.penaltyDescription ? <span className="block text-xs text-muted-foreground">{cancel.penaltyDescription}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Payment</dt>
            <dd>
              {PAYMENT_TYPE_LABEL[plan.paymentTerms.type ?? ""] ?? plan.paymentTerms.type ?? "Not specified"}
              {plan.paymentTerms.description ? <span className="block text-xs text-muted-foreground">{plan.paymentTerms.description}</span> : null}
            </dd>
          </div>
          {owned && (supplier || agreement) ? (
            <div>
              <dt className="text-xs text-muted-foreground">Supplier / contract (internal)</dt>
              <dd>
                {supplier?.name ?? "Supplier"}
                {agreement ? <span className="block text-xs text-muted-foreground">Contract {agreement.contractReference}</span> : null}
              </dd>
            </div>
          ) : null}
        </dl>

        {plan.shared ? (
          <Alert tone="info">This plan was shared with you and is read-only. Only this plan is visible to you; the owner&apos;s other plans and contract terms are not.</Alert>
        ) : null}

        {overlapPairs.length > 0 ? (
          <Alert tone="warning" title="Overlapping rules at the same priority">
            <ul className="mt-1 list-disc pl-4">
              {overlapPairs.map((o) => {
                const a = ruleById.get(o.a);
                const b = ruleById.get(o.b);
                const label = (r?: RateRule) => (r ? `${formatDate(r.applicableStartDate)} – ${formatDate(r.applicableEndDate)}${r.label ? ` (${r.label})` : ""}` : "a rule");
                return (
                  <li key={`${o.a}-${o.b}`}>
                    {label(a)} overlaps {label(b)}. Give one a higher priority to make the outcome explicit.
                  </li>
                );
              })}
            </ul>
          </Alert>
        ) : null}

        <RulesTable plan={plan} overlapIds={overlapIds} canEdit={canEdit && owned} onEdit={setRuleDialog} onDelete={setDeleteRule} />

        {owned ? (
          <div>
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
              <History /> Change history {showHistory ? <ChevronUp /> : <ChevronDown />}
            </Button>
            {showHistory ? (
              <div className="mt-2">
                <HistoryPanel propertyId={propertyId} plan={plan} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog open={ruleDialog !== null} onOpenChange={(o) => !o && setRuleDialog(null)}>
        {ruleDialog !== null ? (
          <DialogContent title={ruleDialog === "new" ? `Add rate rule to ${plan.name}` : "Edit rate rule"} description="A rule sets the nightly amount for a date range within the plan period." wide>
            <RuleForm propertyId={propertyId} plan={plan} rule={ruleDialog === "new" ? undefined : ruleDialog} onDone={() => setRuleDialog(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
      <ConfirmDialog open={deleteRule !== null} onOpenChange={(o) => !o && setDeleteRule(null)} title="Delete this rate rule?" description="The dates it covered will have no price unless another rule applies. The change is recorded in the history." confirmLabel="Delete rule" destructive loading={del.isPending} onConfirm={() => deleteRule && del.mutate(deleteRule)} />
    </Card>
  );
}

export function RatesTab({ propertyId, rooms, canEdit }: { propertyId: string; rooms: RoomType[]; canEdit: boolean }) {
  const can = useCan();
  const canRead = can("rates:read");
  const [planDialog, setPlanDialog] = React.useState<RatePlan | "new" | null>(null);
  const q = useQuery({ queryKey: ["hotel", propertyId, "rates"], queryFn: () => apiGet<RatePlanWithRules[]>(`/hotels/${propertyId}/rates`), enabled: canRead });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => apiGet<Supplier[]>("/suppliers"), enabled: canRead && can("agreements:manage"), staleTime: 60_000 });
  const agreements = useQuery({ queryKey: ["agreements"], queryFn: () => apiGet<Agreement[]>("/agreements"), enabled: can("agreements:manage"), staleTime: 60_000 });
  const supplierMap = React.useMemo(() => new Map((suppliers.data ?? []).map((s) => [s.id, s])), [suppliers.data]);
  const agreementMap = React.useMemo(() => new Map((agreements.data ?? []).map((a) => [a.id, a])), [agreements.data]);
  const canWrite = canEdit && can("rates:write");

  if (!canRead) return <Alert tone="warning" title="Rates are not available to your role">You need the rates:read permission to see rate plans.</Alert>;
  if (q.isLoading) return <LoadingBlock label="Loading rate plans" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load rate plans" />;
  const plans = q.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Rates are built from plans (meal plan, currency, policies) containing dated rules.</p>
          <Button onClick={() => setPlanDialog("new")} disabled={rooms.length === 0}>
            <Plus /> New rate plan
          </Button>
        </div>
      ) : null}
      {canWrite && rooms.length === 0 ? <Alert tone="info">Add a room type first; every rate plan belongs to a room type.</Alert> : null}
      {plans.length === 0 ? (
        <EmptyState icon={Tags} title="No rate plans visible" description={canWrite ? "Create a rate plan, then add seasonal rules with nightly amounts." : "No rates have been published or shared for this property."} action={canWrite && rooms.length > 0 ? <Button onClick={() => setPlanDialog("new")}>New rate plan</Button> : undefined} />
      ) : (
        plans.map((p) => <PlanCard key={p.id} propertyId={propertyId} plan={p} rooms={rooms} canEdit={canWrite} suppliers={supplierMap} agreements={agreementMap} onEditPlan={setPlanDialog} />)
      )}
      <Dialog open={planDialog !== null} onOpenChange={(o) => !o && setPlanDialog(null)}>
        {planDialog !== null ? (
          <DialogContent title={planDialog === "new" ? "New rate plan" : `Edit ${planDialog.name}`} description="Plan-level terms. Nightly amounts are set by rules inside the plan." wide>
            <RatePlanForm propertyId={propertyId} rooms={rooms} plan={planDialog === "new" ? undefined : planDialog} onDone={() => setPlanDialog(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
