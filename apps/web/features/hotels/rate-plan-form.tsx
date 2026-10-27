"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MEAL_PLANS, MEAL_PLAN_LABELS, SUPPORTED_CURRENCIES, ratePlanSchema } from "@tripweave/shared";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { apiGet, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { AGREEMENT_TYPE_LABEL, PAYMENT_TYPE_LABEL, PRICING_BASIS_LABEL, RATE_TYPE_LABEL, addDaysIso, apiFieldErrors, issuesToErrors, todayIso } from "./lib";
import type { Agreement, RatePlan, RoomType, Supplier } from "./types";

export function RatePlanForm({ propertyId, rooms, plan, onDone }: { propertyId: string; rooms: RoomType[]; plan?: RatePlan; onDone: () => void }) {
  const qc = useQueryClient();
  const can = useCan();
  const canAgreements = can("agreements:manage");
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => apiGet<Supplier[]>("/suppliers"), enabled: can("rates:read"), staleTime: 60_000 });
  const agreements = useQuery({ queryKey: ["agreements"], queryFn: () => apiGet<Agreement[]>("/agreements"), enabled: canAgreements, staleTime: 60_000 });

  const [v, setV] = React.useState({
    roomTypeId: plan?.roomTypeId ?? rooms[0]?.id ?? "",
    name: plan?.name ?? "",
    mealPlan: plan?.mealPlan ?? "BB",
    rateType: plan?.rateType ?? "contract",
    currency: plan?.currency ?? "USD",
    pricingBasis: plan?.pricingBasis ?? "per_room_per_night",
    refundable: plan?.cancellationPolicy?.refundable ?? true,
    freeDays: plan?.cancellationPolicy?.freeCancellationDaysBeforeArrival != null ? String(plan.cancellationPolicy.freeCancellationDaysBeforeArrival) : "7",
    penalty: plan?.cancellationPolicy?.penaltyDescription ?? "",
    paymentType: plan?.paymentTerms?.type ?? "credit",
    paymentDescription: plan?.paymentTerms?.description ?? "",
    effectiveFrom: plan?.effectiveFrom ?? todayIso(),
    effectiveTo: plan?.effectiveTo ?? addDaysIso(todayIso(), 364),
    minimumNights: String(plan?.minimumNights ?? 1),
    maximumNights: plan?.maximumNights != null ? String(plan.maximumNights) : "",
    status: plan?.status ?? "active",
    supplierId: plan?.supplierId ?? "",
    supplierAgreementId: plan?.supplierAgreementId ?? "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));

  const agreementOptions = (agreements.data ?? []).filter((a) => !v.supplierId || a.supplierId === v.supplierId);

  const save = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const payload = {
        roomTypeId: v.roomTypeId,
        name: v.name.trim(),
        mealPlan: v.mealPlan,
        rateType: v.rateType,
        currency: v.currency,
        pricingBasis: v.pricingBasis,
        cancellationPolicy: {
          refundable: v.refundable,
          ...(v.refundable && v.freeDays.trim() !== "" ? { freeCancellationDaysBeforeArrival: Number(v.freeDays) } : {}),
          ...(v.penalty.trim() ? { penaltyDescription: v.penalty.trim() } : {}),
        },
        paymentTerms: { type: v.paymentType, ...(v.paymentDescription.trim() ? { description: v.paymentDescription.trim() } : {}) },
        effectiveFrom: v.effectiveFrom,
        effectiveTo: v.effectiveTo,
        minimumNights: Number(v.minimumNights),
        maximumNights: v.maximumNights.trim() === "" ? null : Number(v.maximumNights),
        status: v.status,
        ...(canAgreements || plan ? { supplierId: v.supplierId || null, supplierAgreementId: canAgreements ? v.supplierAgreementId || null : (plan?.supplierAgreementId ?? null) } : {}),
      };
      const parsed = ratePlanSchema.safeParse(payload);
      const errs = parsed.success ? {} : issuesToErrors(parsed.error);
      if (!payload.roomTypeId) errs.roomTypeId = "Choose a room type";
      if (payload.maximumNights !== null && payload.maximumNights < payload.minimumNights) errs.maximumNights = "Must be at least the minimum nights";
      if (Object.keys(errs).length) {
        setErrors(errs);
        throw new Error("Please fix the highlighted fields.");
      }
      setErrors({});
      if (plan) {
        const { roomTypeId: _ignored, ...patch } = payload;
        void _ignored;
        return apiPatch(`/rate-plans/${plan.id}`, patch);
      }
      return apiPost(`/hotels/${propertyId}/rates`, payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["hotel", propertyId] });
      await qc.invalidateQueries({ queryKey: ["expiring"] });
      toast.success(plan ? "Rate plan updated" : "Rate plan created");
      onDone();
    },
    onError: (e) => {
      setErrors((s) => ({ ...s, ...apiFieldErrors(e) }));
      setFormError(errorMessage(e));
    },
  });

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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room type" htmlFor="rp-room" error={e.roomTypeId} required hint={plan ? "A rate plan cannot be moved to another room type." : undefined}>
          <Select id="rp-room" value={v.roomTypeId} disabled={!!plan} onChange={(ev) => set("roomTypeId", ev.target.value)}>
            {rooms.length === 0 ? <option value="">No room types</option> : null}
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rate plan name" htmlFor="rp-name" error={e.name} required>
          <Input id="rp-name" value={v.name} onChange={(ev) => set("name", ev.target.value)} aria-invalid={!!e.name} placeholder="e.g. Low season 2026/27" />
        </Field>
        <Field label="Meal plan" htmlFor="rp-meal" error={e.mealPlan}>
          <Select id="rp-meal" value={v.mealPlan} onChange={(ev) => set("mealPlan", ev.target.value as typeof v.mealPlan)}>
            {MEAL_PLANS.map((m) => (
              <option key={m} value={m}>
                {m} – {MEAL_PLAN_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rate type" htmlFor="rp-type" error={e.rateType}>
          <Select id="rp-type" value={v.rateType} onChange={(ev) => set("rateType", ev.target.value)}>
            {Object.entries(RATE_TYPE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency" htmlFor="rp-cur" error={e.currency} hint="Fixed per plan: all rules use this currency.">
          <Select id="rp-cur" value={v.currency} disabled={!!plan} onChange={(ev) => set("currency", ev.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Pricing basis" htmlFor="rp-basis" error={e.pricingBasis}>
          <Select id="rp-basis" value={v.pricingBasis} onChange={(ev) => set("pricingBasis", ev.target.value as typeof v.pricingBasis)}>
            {Object.entries(PRICING_BASIS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valid from" htmlFor="rp-from" error={e.effectiveFrom} required>
          <Input id="rp-from" type="date" value={v.effectiveFrom} onChange={(ev) => set("effectiveFrom", ev.target.value)} aria-invalid={!!e.effectiveFrom} />
        </Field>
        <Field label="Valid to" htmlFor="rp-to" error={e.effectiveTo} required>
          <Input id="rp-to" type="date" value={v.effectiveTo} onChange={(ev) => set("effectiveTo", ev.target.value)} aria-invalid={!!e.effectiveTo} />
        </Field>
        <Field label="Minimum nights" htmlFor="rp-min" error={e.minimumNights}>
          <Input id="rp-min" type="number" min={1} max={60} value={v.minimumNights} onChange={(ev) => set("minimumNights", ev.target.value)} />
        </Field>
        <Field label="Maximum nights" htmlFor="rp-max" error={e.maximumNights} hint="Leave blank for no limit.">
          <Input id="rp-max" type="number" min={1} max={365} value={v.maximumNights} onChange={(ev) => set("maximumNights", ev.target.value)} />
        </Field>
      </div>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Cancellation policy</legend>
        <div className="sm:col-span-2">
          <Switch checked={v.refundable} onCheckedChange={(c) => set("refundable", c)} label="Refundable booking" />
        </div>
        {v.refundable ? (
          <Field label="Free cancellation (days before arrival)" htmlFor="rp-free" error={e["cancellationPolicy.freeCancellationDaysBeforeArrival"]}>
            <Input id="rp-free" type="number" min={0} max={365} value={v.freeDays} onChange={(ev) => set("freeDays", ev.target.value)} />
          </Field>
        ) : null}
        <Field label="Penalty description" htmlFor="rp-pen" error={e["cancellationPolicy.penaltyDescription"]} className={v.refundable ? "" : "sm:col-span-2"}>
          <Input id="rp-pen" maxLength={300} value={v.penalty} onChange={(ev) => set("penalty", ev.target.value)} placeholder="e.g. First night charged inside 7 days" />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Payment terms</legend>
        <Field label="Payment type" htmlFor="rp-pay" error={e["paymentTerms.type"]}>
          <Select id="rp-pay" value={v.paymentType} onChange={(ev) => set("paymentType", ev.target.value)}>
            {Object.entries(PAYMENT_TYPE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Details" htmlFor="rp-pay-d" error={e["paymentTerms.description"]}>
          <Input id="rp-pay-d" maxLength={300} value={v.paymentDescription} onChange={(ev) => set("paymentDescription", ev.target.value)} placeholder="e.g. 30 days after check-out" />
        </Field>
      </fieldset>

      {canAgreements ? (
        <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Supplier & contract (internal, never shared)</legend>
          <Field label="Supplier" htmlFor="rp-sup" error={e.supplierId}>
            <Select
              id="rp-sup"
              value={v.supplierId}
              onChange={(ev) => {
                set("supplierId", ev.target.value);
                set("supplierAgreementId", "");
              }}
            >
              <option value="">No supplier</option>
              {(suppliers.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Agreement" htmlFor="rp-ag" error={e.supplierAgreementId} hint="Currency and dates must fit within the agreement; the server checks this.">
            <Select id="rp-ag" value={v.supplierAgreementId} onChange={(ev) => set("supplierAgreementId", ev.target.value)}>
              <option value="">No agreement</option>
              {agreementOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.contractReference} · {AGREEMENT_TYPE_LABEL[a.agreementType] ?? a.agreementType} · {a.currency} · {formatDate(a.effectiveFrom)}–{formatDate(a.effectiveTo)}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>
      ) : null}

      <Field label="Status" htmlFor="rp-status">
        <Select id="rp-status" value={v.status} onChange={(ev) => set("status", ev.target.value)} className="max-w-48">
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending} disabled={rooms.length === 0}>
          {plan ? "Save rate plan" : "Create rate plan"}
        </Button>
      </div>
    </form>
  );
}
