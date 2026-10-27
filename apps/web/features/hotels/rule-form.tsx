"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { rateRuleSchema } from "@tripweave/shared";
import { Alert, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Switch } from "@/components/ui/form";
import { apiPatch, apiPost, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { apiFieldErrors, bpToPercentText, issuesToErrors, percentToBp } from "./lib";
import type { RatePlan, RateRule } from "./types";

export function RuleForm({ propertyId, plan, rule, onDone }: { propertyId: string; plan: RatePlan; rule?: RateRule; onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = React.useState({
    start: rule?.applicableStartDate ?? plan.effectiveFrom,
    end: rule?.applicableEndDate ?? plan.effectiveTo,
    label: rule?.label ?? "",
    priority: String(rule?.priority ?? 0),
    taxIncluded: rule?.taxTreatment.included ?? false,
    taxPct: bpToPercentText(rule?.taxTreatment.taxBp ?? 0),
    servicePct: bpToPercentText(rule?.taxTreatment.serviceChargeBp ?? 0),
    baseAdults: String(rule?.extraPersonRules.baseAdults ?? 2),
    childFreeUnderAge: String(rule?.extraPersonRules.childFreeUnderAge ?? 0),
    minAdults: rule?.occupancyConditions.minAdults != null ? String(rule.occupancyConditions.minAdults) : "",
    maxAdults: rule?.occupancyConditions.maxAdults != null ? String(rule.occupancyConditions.maxAdults) : "",
  });
  const [amount, setAmount] = React.useState<number | null>(rule?.amountMinor ?? null);
  const [extraAdult, setExtraAdult] = React.useState<number | null>(rule?.extraPersonRules.extraAdultMinor ?? 0);
  const [extraChild, setExtraChild] = React.useState<number | null>(rule?.extraPersonRules.extraChildMinor ?? 0);
  const [blackouts, setBlackouts] = React.useState<string[]>(rule?.blackoutDates ?? []);
  const [blackoutDraft, setBlackoutDraft] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));

  const save = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const local: Record<string, string> = {};
      const taxBp = percentToBp(v.taxPct);
      const serviceBp = percentToBp(v.servicePct);
      if (taxBp === null) local["taxTreatment.taxBp"] = "Enter a percentage such as 10 or 12.5";
      if (serviceBp === null) local["taxTreatment.serviceChargeBp"] = "Enter a percentage such as 10 or 12.5";
      if (amount === null) local.amountMinor = "Enter the nightly amount";
      if (extraAdult === null) local["extraPersonRules.extraAdultMinor"] = "Enter an amount (0 for none)";
      if (extraChild === null) local["extraPersonRules.extraChildMinor"] = "Enter an amount (0 for none)";
      const occupancyConditions: { minAdults?: number; maxAdults?: number } = {};
      if (v.minAdults.trim() !== "") occupancyConditions.minAdults = Number(v.minAdults);
      if (v.maxAdults.trim() !== "") occupancyConditions.maxAdults = Number(v.maxAdults);
      if (occupancyConditions.minAdults !== undefined && occupancyConditions.maxAdults !== undefined && occupancyConditions.maxAdults < occupancyConditions.minAdults) local["occupancyConditions.maxAdults"] = "Must be at least the minimum adults";
      const payload = {
        applicableStartDate: v.start,
        applicableEndDate: v.end,
        amountMinor: amount ?? 0,
        priority: Number(v.priority),
        occupancyConditions,
        taxTreatment: { included: v.taxIncluded, taxBp: taxBp ?? 0, serviceChargeBp: serviceBp ?? 0 },
        extraPersonRules: { baseAdults: Number(v.baseAdults), extraAdultMinor: extraAdult ?? 0, extraChildMinor: extraChild ?? 0, childFreeUnderAge: Number(v.childFreeUnderAge) },
        blackoutDates: blackouts,
        ...(v.label.trim() ? { label: v.label.trim() } : {}),
      };
      const parsed = rateRuleSchema.safeParse(payload);
      const errs = { ...(parsed.success ? {} : issuesToErrors(parsed.error)), ...local };
      if (!errs.applicableStartDate && v.start < plan.effectiveFrom) errs.applicableStartDate = `Must be within the plan period (${formatDate(plan.effectiveFrom)} – ${formatDate(plan.effectiveTo)})`;
      if (!errs.applicableEndDate && v.end > plan.effectiveTo) errs.applicableEndDate = `Must be within the plan period (${formatDate(plan.effectiveFrom)} – ${formatDate(plan.effectiveTo)})`;
      if (Object.keys(errs).length) {
        setErrors(errs);
        throw new Error("Please fix the highlighted fields.");
      }
      setErrors({});
      return rule ? apiPatch(`/rate-plans/${plan.id}/rules/${rule.id}`, payload) : apiPost(`/rate-plans/${plan.id}/rules`, payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["hotel", propertyId] });
      await qc.invalidateQueries({ queryKey: ["expiring"] });
      toast.success(rule ? "Rate rule updated" : "Rate rule added");
      onDone();
    },
    onError: (e) => {
      setErrors((s) => ({ ...s, ...apiFieldErrors(e) }));
      setFormError(errorMessage(e));
    },
  });

  const addBlackout = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(blackoutDraft)) return;
    if (!blackouts.includes(blackoutDraft)) setBlackouts([...blackouts, blackoutDraft].sort());
    setBlackoutDraft("");
  };
  const e = errors;

  return (
    <form
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        save.mutate();
      }}
      className="flex flex-col gap-4"
    >
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <p className="text-xs text-muted-foreground">
        Plan period: {formatDate(plan.effectiveFrom)} – {formatDate(plan.effectiveTo)} · currency {plan.currency} · {plan.pricingBasis === "per_person_per_night" ? "price per person per night" : "price per room per night"}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="ru-from" error={e.applicableStartDate} required>
          <Input id="ru-from" type="date" min={plan.effectiveFrom} max={plan.effectiveTo} value={v.start} onChange={(ev) => set("start", ev.target.value)} aria-invalid={!!e.applicableStartDate} />
        </Field>
        <Field label="To (inclusive)" htmlFor="ru-to" error={e.applicableEndDate} required>
          <Input id="ru-to" type="date" min={plan.effectiveFrom} max={plan.effectiveTo} value={v.end} onChange={(ev) => set("end", ev.target.value)} aria-invalid={!!e.applicableEndDate} />
        </Field>
        <Field label="Nightly amount" htmlFor="ru-amount" error={e.amountMinor} required>
          <MoneyInput id="ru-amount" currency={plan.currency} valueMinor={amount} onMinorChange={setAmount} invalid={!!e.amountMinor} />
        </Field>
        <Field label="Label" htmlFor="ru-label" error={e.label} hint="e.g. Peak season, Christmas week">
          <Input id="ru-label" maxLength={80} value={v.label} onChange={(ev) => set("label", ev.target.value)} />
        </Field>
        <Field label="Priority" htmlFor="ru-prio" error={e.priority} hint="Higher priority wins where rules overlap. Equal priorities overlap ambiguously and are flagged.">
          <Input id="ru-prio" type="number" min={0} max={1000} value={v.priority} onChange={(ev) => set("priority", ev.target.value)} className="max-w-32" />
        </Field>
      </div>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Taxes & service charge</legend>
        <div className="flex items-end pb-1 sm:col-span-3">
          <Switch checked={v.taxIncluded} onCheckedChange={(c) => set("taxIncluded", c)} label="Amount already includes tax and service charge" />
        </div>
        <Field label="Tax (%)" htmlFor="ru-tax" error={e["taxTreatment.taxBp"]}>
          <Input id="ru-tax" inputMode="decimal" value={v.taxPct} onChange={(ev) => set("taxPct", ev.target.value)} />
        </Field>
        <Field label="Service charge (%)" htmlFor="ru-svc" error={e["taxTreatment.serviceChargeBp"]}>
          <Input id="ru-svc" inputMode="decimal" value={v.servicePct} onChange={(ev) => set("servicePct", ev.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Extra persons</legend>
        <Field label="Adults included in the rate" htmlFor="ru-base" error={e["extraPersonRules.baseAdults"]}>
          <Input id="ru-base" type="number" min={1} max={12} value={v.baseAdults} onChange={(ev) => set("baseAdults", ev.target.value)} className="max-w-32" />
        </Field>
        <Field label="Children free under age" htmlFor="ru-free" error={e["extraPersonRules.childFreeUnderAge"]} hint="0 = no free-child allowance.">
          <Input id="ru-free" type="number" min={0} max={17} value={v.childFreeUnderAge} onChange={(ev) => set("childFreeUnderAge", ev.target.value)} className="max-w-32" />
        </Field>
        <Field label="Extra adult, per night" htmlFor="ru-xa" error={e["extraPersonRules.extraAdultMinor"]}>
          <MoneyInput id="ru-xa" currency={plan.currency} valueMinor={extraAdult} onMinorChange={setExtraAdult} />
        </Field>
        <Field label="Extra child, per night" htmlFor="ru-xc" error={e["extraPersonRules.extraChildMinor"]}>
          <MoneyInput id="ru-xc" currency={plan.currency} valueMinor={extraChild} onMinorChange={setExtraChild} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Occupancy conditions (optional)</legend>
        <Field label="Minimum adults" htmlFor="ru-minad" error={e["occupancyConditions.minAdults"]}>
          <Input id="ru-minad" type="number" min={1} value={v.minAdults} onChange={(ev) => set("minAdults", ev.target.value)} className="max-w-32" />
        </Field>
        <Field label="Maximum adults" htmlFor="ru-maxad" error={e["occupancyConditions.maxAdults"]}>
          <Input id="ru-maxad" type="number" min={1} value={v.maxAdults} onChange={(ev) => set("maxAdults", ev.target.value)} className="max-w-32" />
        </Field>
      </fieldset>

      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Blackout dates</legend>
        <p className="mb-2 text-xs text-muted-foreground">Stays touching these nights are not priced by this rule.</p>
        <div className="flex gap-2">
          <Input aria-label="Blackout date" type="date" min={v.start} max={v.end} value={blackoutDraft} onChange={(ev) => setBlackoutDraft(ev.target.value)} className="max-w-48" />
          <Button type="button" variant="outline" disabled={!blackoutDraft} onClick={addBlackout}>
            <Plus /> Add date
          </Button>
        </div>
        {blackouts.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {blackouts.map((d) => (
              <li key={d}>
                <Badge tone="warning" className="gap-1 pr-1">
                  {formatDate(d)}
                  <button type="button" aria-label={`Remove ${d}`} className="rounded-full p-0.5 hover:bg-warning/10" onClick={() => setBlackouts(blackouts.filter((b) => b !== d))}>
                    <X className="size-3" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        {e.blackoutDates ? (
          <p role="alert" className="mt-1 text-xs font-medium text-destructive">
            {e.blackoutDates}
          </p>
        ) : null}
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {rule ? "Save rule" : "Add rule"}
        </Button>
      </div>
    </form>
  );
}
