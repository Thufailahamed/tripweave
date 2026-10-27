"use client";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { Scale } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { pricingConfigSchema, SUPPORTED_CURRENCIES, type PricingConfig } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/form";
import { ApiError, apiGet, apiPut, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { cn, formatDateTime, money } from "@/lib/utils";
import { NoAccess, useOrganization } from "@/features/settings/shared";

/* ================= pricing configuration ================= */

type Mode = PricingConfig["mode"];
interface PricingForm {
  mode: Mode;
  targetMarginPct: string;
  markupPct: string;
  fixedMarkupMinor: number | null;
  minimumProfitMinor: number | null;
  minimumSellingPriceMinor: number | null;
  paymentFeePct: string;
  sellingTaxPct: string;
  maxDiscountPct: string;
  approvalMarginFloorPct: string;
  roundTo: PricingConfig["roundTo"];
}

const bpToPct = (bp: number) => String(bp / 100);
const fromConfig = (c: PricingConfig): PricingForm => ({
  mode: c.mode,
  targetMarginPct: bpToPct(c.targetMarginBp),
  markupPct: bpToPct(c.markupBp),
  fixedMarkupMinor: c.fixedMarkupMinor,
  minimumProfitMinor: c.minimumProfitMinor,
  minimumSellingPriceMinor: c.minimumSellingPriceMinor,
  paymentFeePct: bpToPct(c.paymentFeeBp),
  sellingTaxPct: bpToPct(c.sellingTaxBp),
  maxDiscountPct: bpToPct(c.maxDiscountBp),
  approvalMarginFloorPct: bpToPct(c.approvalMarginFloorBp),
  roundTo: c.roundTo,
});

/** Percentages (human units, up to 2 decimals) to basis points for the API. */
function pctToBp(s: string): number | null {
  const t = s.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

const FIELD_OF: Record<string, keyof PricingForm> = {
  mode: "mode",
  targetMarginBp: "targetMarginPct",
  markupBp: "markupPct",
  fixedMarkupMinor: "fixedMarkupMinor",
  minimumProfitMinor: "minimumProfitMinor",
  minimumSellingPriceMinor: "minimumSellingPriceMinor",
  paymentFeeBp: "paymentFeePct",
  sellingTaxBp: "sellingTaxPct",
  maxDiscountBp: "maxDiscountPct",
  approvalMarginFloorBp: "approvalMarginFloorPct",
  roundTo: "roundTo",
};

/** Converts form values to an API payload, validated with the shared schema. */
function toPayload(v: PricingForm): { payload: PricingConfig | null; errors: Partial<Record<keyof PricingForm, string>> } {
  const errors: Partial<Record<keyof PricingForm, string>> = {};
  const pct = (key: keyof PricingForm, s: string) => {
    const bp = pctToBp(s);
    if (bp === null) errors[key] = "Enter a percentage with up to 2 decimals";
    return bp ?? 0;
  };
  const amt = (key: keyof PricingForm, n: number | null) => {
    if (n === null) errors[key] = "Enter an amount (0.00 for none)";
    return n ?? 0;
  };
  const candidate = {
    mode: v.mode,
    targetMarginBp: pct("targetMarginPct", v.targetMarginPct),
    markupBp: pct("markupPct", v.markupPct),
    fixedMarkupMinor: amt("fixedMarkupMinor", v.fixedMarkupMinor),
    minimumProfitMinor: amt("minimumProfitMinor", v.minimumProfitMinor),
    minimumSellingPriceMinor: amt("minimumSellingPriceMinor", v.minimumSellingPriceMinor),
    paymentFeeBp: pct("paymentFeePct", v.paymentFeePct),
    sellingTaxBp: pct("sellingTaxPct", v.sellingTaxPct),
    maxDiscountBp: pct("maxDiscountPct", v.maxDiscountPct),
    approvalMarginFloorBp: pct("approvalMarginFloorPct", v.approvalMarginFloorPct),
    roundTo: v.roundTo,
  };
  const parsed = pricingConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = FIELD_OF[String(issue.path[0])];
      if (key && !errors[key]) errors[key] = issue.message;
    }
  }
  return { payload: parsed.success && Object.keys(errors).length === 0 ? parsed.data : null, errors };
}

/**
 * ILLUSTRATION ONLY. A browser-side sketch of how the three pricing modes relate, so the settings can
 * be understood before saving. The server (pricing engine) calculates every real price.
 */
function illustrate(costMinor: number, c: PricingConfig): { selling: number; profit: number; marginPct: number; markupPct: number } | null {
  const f = c.paymentFeeBp;
  const denomFee = 10_000 - f;
  if (denomFee <= 0) return null;
  let selling: number;
  if (c.mode === "target_margin") {
    const d = 10_000 - c.targetMarginBp - f;
    if (d <= 0) return null;
    selling = Math.ceil((costMinor * 10_000) / d);
  } else if (c.mode === "percent_markup") selling = Math.ceil((costMinor * (10_000 + c.markupBp)) / denomFee);
  else selling = Math.ceil(((costMinor + c.fixedMarkupMinor) * 10_000) / denomFee);
  if (c.minimumProfitMinor > 0) selling = Math.max(selling, Math.ceil(((costMinor + c.minimumProfitMinor) * 10_000) / denomFee));
  const step = c.roundTo === "unit" ? 100 : c.roundTo === "ten" ? 1_000 : c.roundTo === "hundred" ? 10_000 : 0;
  if (step) selling = Math.ceil(selling / step) * step;
  selling = Math.max(selling, c.minimumSellingPriceMinor);
  const fee = Math.round((selling * f) / 10_000);
  const profit = selling - costMinor - fee;
  return { selling, profit, marginPct: selling > 0 ? (profit / selling) * 100 : 0, markupPct: costMinor + fee > 0 ? (profit / (costMinor + fee)) * 100 : 0 };
}

const MODE_INFO: { value: Mode; title: string; text: string }[] = [
  { value: "target_margin", title: "Target margin", text: "Pick the share of the selling price you want to keep as profit." },
  { value: "percent_markup", title: "Percentage markup", text: "Add a percentage on top of cost." },
  { value: "fixed_markup", title: "Fixed markup", text: "Add the same amount to the cost of every quotation." },
];
const ROUND_LABEL: Record<PricingConfig["roundTo"], string> = { none: "No rounding", unit: "Up to a whole unit (1)", ten: "Up to the next 10", hundred: "Up to the next 100" };

function PctField({ id, label, hint, error, disabled, ...rest }: { id: string; label: string; hint?: string; error?: string; disabled?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="relative">
        <Input id={id} inputMode="decimal" aria-invalid={!!error} disabled={disabled} className="tw-num pr-8 text-right" {...rest} />
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
          %
        </span>
      </div>
    </Field>
  );
}

function Illustration({ values, currency }: { values: PricingForm; currency: string }) {
  const [costMinor, setCostMinor] = React.useState<number | null>(80_000);
  const { payload } = toPayload(values);
  const rows = payload && costMinor !== null ? MODE_INFO.map((m) => ({ ...m, result: illustrate(costMinor, { ...payload, mode: m.value }) })) : null;
  return (
    <Card className="self-start">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Worked example</CardTitle>
          <Badge tone="warning">Illustration only</Badge>
        </div>
        <CardDescription>Illustration only – the server calculates all real prices.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field label="Example net cost" htmlFor="ill-cost" hint="Change it to see how each mode behaves.">
          <MoneyInput id="ill-cost" valueMinor={costMinor} onMinorChange={setCostMinor} currency={currency} />
        </Field>
        {rows ? (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <caption className="sr-only">Selling price for the example cost under each pricing mode, using the values currently in the form</caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-2 font-semibold">Mode</th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-semibold">Selling price</th>
                  <th scope="col" className="py-1.5 pr-2 text-right font-semibold">Margin</th>
                  <th scope="col" className="py-1.5 text-right font-semibold">Markup</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.value} className={cn("border-t border-border", r.value === values.mode && "bg-primary-soft/50 font-semibold")}>
                    <th scope="row" className="py-2 pr-2 text-left font-medium">
                      {r.title}
                      {r.value === values.mode ? <span className="ml-1 text-xs text-primary">(selected)</span> : null}
                    </th>
                    {r.result ? (
                      <>
                        <td className="tw-num py-2 pr-2 text-right">{money(r.result.selling, currency)}</td>
                        <td className="tw-num py-2 pr-2 text-right">{r.result.marginPct.toFixed(1)}%</td>
                        <td className="tw-num py-2 text-right">{r.result.markupPct.toFixed(1)}%</td>
                      </>
                    ) : (
                      <td colSpan={3} className="py-2 text-right text-xs font-normal text-muted-foreground">
                        Not possible with these values
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Alert tone="info">Complete the highlighted fields and an example cost to see the illustration.</Alert>
        )}
        <div className="rounded-md border border-accent/40 bg-accent-soft p-3 text-sm">
          <p className="font-semibold">Margin is not markup</p>
          <p className="mt-1 text-foreground/80">
            Margin is profit as a share of the <em>selling price</em>; markup is profit as a share of <em>cost</em>. A 20% margin on a {money(80_000, currency)} cost sells for {money(100_000, currency)} (profit {money(20_000, currency)}), which is a 25% markup, not 20%. Choosing "20% markup" instead would sell at only {money(96_000, currency)}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">(Static explanation with no payment fee, minimums or rounding.)</p>
        </div>
        <p className="text-xs text-muted-foreground">The example uses the unsaved values in the form. Selling tax is added on top of the selling price and is not shown here.</p>
      </CardContent>
    </Card>
  );
}

function PricingCard({ currency }: { currency: string }) {
  const qc = useQueryClient();
  const can = useCan();
  const canEdit = can("settings:pricing");
  const q = useQuery({ queryKey: ["org-pricing"], queryFn: () => apiGet<PricingConfig>("/organization/pricing") });
  const [error, setError] = React.useState<string | null>(null);
  const { register, control, handleSubmit, reset, watch, setError: setFieldError, formState } = useForm<PricingForm>({
    defaultValues: fromConfig(pricingConfigSchema.parse({})),
  });
  React.useEffect(() => {
    if (q.data) reset(fromConfig(q.data));
  }, [q.data, reset]);
  const values = watch();

  const save = useMutation({
    mutationFn: (p: PricingConfig) => apiPut<PricingConfig>("/organization/pricing", p),
    onSuccess: (saved) => {
      toast.success("Pricing configuration saved. New calculations use it; issued quotations are unchanged.");
      qc.setQueryData(["org-pricing"], saved);
    },
  });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const { payload, errors } = toPayload(v);
    if (!payload) {
      for (const [k, message] of Object.entries(errors)) setFieldError(k as keyof PricingForm, { message });
      setError("Some values need attention.");
      return;
    }
    try {
      await save.mutateAsync(payload);
    } catch (e) {
      if (e instanceof ApiError) for (const [path, message] of Object.entries(e.fieldErrors)) if (FIELD_OF[path]) setFieldError(FIELD_OF[path], { message });
      setError(errorMessage(e));
    }
  });

  if (q.isLoading) return <LoadingBlock label="Loading pricing configuration" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const err = formState.errors;
  const mode = values.mode;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Pricing configuration</CardTitle>
          <CardDescription>How selling prices are derived from your net costs. Percentages are entered as people say them (20 means 20%).</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="flex flex-col gap-6">
            {error ? <Alert tone="danger">{error}</Alert> : null}

            <fieldset className="grid gap-2 sm:grid-cols-3" disabled={!canEdit}>
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Pricing mode</legend>
              {MODE_INFO.map((m) => (
                <label key={m.value} className={cn("cursor-pointer rounded-lg border p-3 transition-colors", mode === m.value ? "border-primary bg-primary-soft" : "border-input bg-card hover:bg-muted")}>
                  <input type="radio" value={m.value} className="sr-only" {...register("mode")} />
                  <span className="block text-sm font-semibold">{m.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{m.text}</span>
                </label>
              ))}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              {mode === "target_margin" ? (
                <PctField id="p-margin" label="Target margin" hint="Profit as a share of the selling price. Max 95%." error={err.targetMarginPct?.message} disabled={!canEdit} {...register("targetMarginPct")} />
              ) : null}
              {mode === "percent_markup" ? <PctField id="p-markup" label="Markup on cost" hint="Profit as a share of cost, e.g. 25 turns 800 into 1,000." error={err.markupPct?.message} disabled={!canEdit} {...register("markupPct")} /> : null}
              {mode === "fixed_markup" ? (
                <Field label="Fixed markup" htmlFor="p-fixed" error={err.fixedMarkupMinor?.message} hint="Added to the cost in the quotation's currency.">
                  <Controller control={control} name="fixedMarkupMinor" render={({ field }) => (canEdit ? <MoneyInput id="p-fixed" valueMinor={field.value} onMinorChange={field.onChange} currency={currency} invalid={!!err.fixedMarkupMinor} /> : <Input disabled value={money(field.value, currency)} readOnly />)} />
                </Field>
              ) : null}
              <Field label="Minimum profit" htmlFor="p-minprofit" error={err.minimumProfitMinor?.message} hint="Floor on profit per quotation. 0 for none.">
                <Controller control={control} name="minimumProfitMinor" render={({ field }) => (canEdit ? <MoneyInput id="p-minprofit" valueMinor={field.value} onMinorChange={field.onChange} currency={currency} invalid={!!err.minimumProfitMinor} /> : <Input disabled value={money(field.value, currency)} readOnly />)} />
              </Field>
              <Field label="Minimum selling price" htmlFor="p-minsell" error={err.minimumSellingPriceMinor?.message} hint="No quotation is priced below this. 0 for none.">
                <Controller control={control} name="minimumSellingPriceMinor" render={({ field }) => (canEdit ? <MoneyInput id="p-minsell" valueMinor={field.value} onMinorChange={field.onChange} currency={currency} invalid={!!err.minimumSellingPriceMinor} /> : <Input disabled value={money(field.value, currency)} readOnly />)} />
              </Field>
              <Field label="Rounding" htmlFor="p-round" error={err.roundTo?.message} hint="Selling prices are always rounded up.">
                <Select id="p-round" disabled={!canEdit} {...register("roundTo")}>
                  {(Object.keys(ROUND_LABEL) as PricingConfig["roundTo"][]).map((r) => (
                    <option key={r} value={r}>
                      {ROUND_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div>
              <h4 className="mb-3 font-display text-sm font-semibold">Fees, tax and guard rails</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <PctField id="p-fee" label="Payment fee" hint="Card/gateway fee recovered in the price. Max 20%." error={err.paymentFeePct?.message} disabled={!canEdit} {...register("paymentFeePct")} />
                <PctField id="p-tax" label="Selling tax" hint="Added on top of the selling price (e.g. VAT). Max 50%." error={err.sellingTaxPct?.message} disabled={!canEdit} {...register("sellingTaxPct")} />
                <PctField id="p-maxdisc" label="Maximum discount" hint="Larger discounts need approval." error={err.maxDiscountPct?.message} disabled={!canEdit} {...register("maxDiscountPct")} />
                <PctField id="p-floor" label="Approval margin floor" hint="Quotations below this margin need approval." error={err.approvalMarginFloorPct?.message} disabled={!canEdit} {...register("approvalMarginFloorPct")} />
              </div>
            </div>
          </CardContent>
          {canEdit ? (
            <CardFooter>
              <Button type="button" variant="outline" disabled={!formState.isDirty} onClick={() => q.data && reset(fromConfig(q.data))}>
                Reset
              </Button>
              <Button type="submit" loading={save.isPending} disabled={!formState.isDirty}>
                Save pricing
              </Button>
            </CardFooter>
          ) : null}
        </form>
      </Card>
      <Illustration values={values} currency={currency} />
    </div>
  );
}

/* ================= exchange rates ================= */

interface FxSnapshot {
  pivot: string;
  rates: Record<string, string>;
  asOf: string;
  source: string;
}
const RATE_RE = /^\d+(\.\d{1,8})?$/;

function FxCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["org-fx"], queryFn: () => apiGet<FxSnapshot | null>("/organization/fx") });
  const [pivot, setPivot] = React.useState<string>("USD");
  const [rates, setRates] = React.useState<Record<string, string>>({});
  const [source, setSource] = React.useState("manual");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (q.data) {
      setPivot(q.data.pivot);
      setRates(q.data.rates);
      setSource(q.data.source);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: (body: { pivot: string; rates: Record<string, string>; source: string }) => apiPut<FxSnapshot>("/organization/fx", body),
    onSuccess: (snap) => {
      toast.success("Exchange rates saved");
      qc.setQueryData(["org-fx"], snap);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    const out: Record<string, string> = {};
    for (const c of SUPPORTED_CURRENCIES.filter((x) => x !== pivot)) {
      const v = (rates[c] ?? "").trim();
      if (!RATE_RE.test(v) || Number(v) <= 0) errs[c] = "Enter a positive decimal (up to 8 decimals)";
      else out[c] = v;
    }
    if (!source.trim() || source.length > 80) errs.source = "Source is required (max 80 characters)";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate({ pivot, rates: out, source: source.trim() });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exchange rates</CardTitle>
        <CardDescription>The snapshot used to convert supplier costs into the quotation currency. Each rate is "units of that currency per 1 {pivot}".</CardDescription>
      </CardHeader>
      {q.isLoading ? (
        <CardContent>
          <LoadingBlock rows={3} label="Loading exchange rates" />
        </CardContent>
      ) : q.error ? (
        <CardContent>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </CardContent>
      ) : (
        <form onSubmit={submit} noValidate>
          <CardContent className="flex flex-col gap-4">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {q.data ? (
              <p className="text-sm text-muted-foreground">
                Current snapshot: <span className="font-semibold text-foreground">pivot {q.data.pivot}</span>, as of <span className="tw-num">{formatDateTime(q.data.asOf)}</span>, source <span className="font-semibold text-foreground">{q.data.source}</span>.
              </p>
            ) : (
              <Alert tone="warning" title="No exchange rates configured">
                Multi-currency quotations cannot be priced until you save a snapshot below.
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Pivot currency" htmlFor="fx-pivot">
                <Select id="fx-pivot" value={pivot} onChange={(e) => setPivot(e.target.value)}>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              {SUPPORTED_CURRENCIES.filter((c) => c !== pivot).map((c) => (
                <Field key={c} label={`${c} per 1 ${pivot}`} htmlFor={`fx-${c}`} error={errors[c]}>
                  <Input id={`fx-${c}`} inputMode="decimal" className="tw-num text-right" aria-invalid={!!errors[c]} value={rates[c] ?? ""} onChange={(e) => setRates((r) => ({ ...r, [c]: e.target.value }))} />
                </Field>
              ))}
            </div>
            <Field label="Source" htmlFor="fx-source" error={errors.source} hint="Where these rates came from (e.g. bank name or 'manual').">
              <Input id="fx-source" value={source} maxLength={80} onChange={(e) => setSource(e.target.value)} />
            </Field>
            <Alert tone="info" title="Issued quotations keep their own snapshot">
              Saving new rates only affects future calculations. A quotation keeps the exchange-rate snapshot that was current when it was priced, so its figures never change retroactively. If you have not saved your own snapshot, a platform-wide snapshot (if one exists) is shown and used.
            </Alert>
          </CardContent>
          <CardFooter>
            <Button type="submit" loading={save.isPending}>
              Save exchange rates
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}

export default function PricingSettingsPage() {
  const can = useCan();
  const org = useOrganization();
  if (!can("settings:pricing")) {
    return (
      <>
        <PageHeader title="Pricing & currency" eyebrow="Settings" />
        <NoAccess what="Pricing and exchange-rate settings" permission="settings:pricing" />
      </>
    );
  }
  const currency = org.data?.defaultCurrency ?? "USD";
  return (
    <>
      <PageHeader title="Pricing & currency" eyebrow="Settings" icon={Scale} description="Your commercial rules. Prices are always calculated by the server from these settings and your costs." />
      <div className="flex flex-col gap-6">
        <PricingCard currency={currency} />
        <FxCard />
      </div>
    </>
  );
}
