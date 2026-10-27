"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranchPlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { SUPPORTED_CURRENCIES, quoteVersionSchema } from "@tripweave/shared";
import { Alert, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { Checkbox, Field, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/form";
import { ApiError, apiGet, apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { CATEGORY_LABELS } from "./helpers";
import { quoteKeys, type QuoteSummary, type VersionDetail } from "./types";

interface ItemDraft {
  key: number;
  category: string;
  description: string;
  quantity: string;
  unitCostMinor: number | null;
  currency: string;
  included: boolean;
  optional: boolean;
}

type Cfg = {
  mode: "target_margin" | "percent_markup" | "fixed_markup";
  targetMarginBp: number;
  markupBp: number;
  fixedMarkupMinor: number;
  minimumProfitMinor: number;
  minimumSellingPriceMinor: number;
  paymentFeeBp: number;
  sellingTaxBp: number;
  maxDiscountBp: number;
  approvalMarginFloorBp: number;
  roundTo: "none" | "unit" | "ten" | "hundred";
};

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export function NewVersionButton({ quote, version }: { quote: QuoteSummary; version: VersionDetail }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <GitBranchPlus /> Create new version
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent wide title="Create a new version" description={`Based on version ${quote.currentVersion}. The existing version stays untouched and the new one becomes current.`}>
          <NewVersionForm quote={quote} version={version} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function PercentInput({ id, valueBp, onChange }: { id: string; valueBp: number; onChange: (bp: number) => void }) {
  const [text, setText] = React.useState((valueBp / 100).toString());
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        className="tw-num pr-8 text-right"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100));
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">%</span>
    </div>
  );
}

function NewVersionForm({ quote, version, onClose }: { quote: QuoteSummary; version: VersionDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const can = useCan();
  const canPricing = can("settings:pricing");
  const keyRef = React.useRef(0);
  const [items, setItems] = React.useState<ItemDraft[]>([]);
  const [discount, setDiscount] = React.useState<number | null>(version.pricing.discountMinor ?? 0);
  const [validUntil, setValidUntil] = React.useState(quote.validUntil ?? "");
  const [inclusions, setInclusions] = React.useState((version.terms.inclusions ?? []).join("\n"));
  const [exclusions, setExclusions] = React.useState((version.terms.exclusions ?? []).join("\n"));
  const [terms, setTerms] = React.useState(version.terms.terms ?? "");
  const [clientNotes, setClientNotes] = React.useState(version.terms.clientNotes ?? "");
  const [internalNotes, setInternalNotes] = React.useState(version.internalNotes ?? "");
  const [refreshFx, setRefreshFx] = React.useState(false);
  const [override, setOverride] = React.useState(false);
  const [cfg, setCfg] = React.useState<Cfg | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);

  const cfgQ = useQuery({ queryKey: ["organization", "pricing"], queryFn: () => apiGet<Cfg>("/organization/pricing"), enabled: canPricing && override, staleTime: 30_000 });
  React.useEffect(() => {
    if (cfgQ.data && !cfg) setCfg(cfgQ.data);
  }, [cfgQ.data, cfg]);

  const addItem = () => setItems((xs) => [...xs, { key: ++keyRef.current, category: "activity", description: "", quantity: "1", unitCostMinor: null, currency: quote.currency, included: true, optional: false }]);
  const patch = (key: number, p: Partial<ItemDraft>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const m = useMutation({
    mutationFn: (body: unknown) => apiPost(`/quotes/${quote.id}/versions`, body),
    onSuccess: () => {
      toast.success("New version created");
      void qc.invalidateQueries({ queryKey: quoteKeys.all });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        return;
      }
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      setMessage(errorMessage(e));
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setConflict(false);
    const body = {
      expectedVersion: quote.currentVersion,
      extraItems: items.map((i) => ({ category: i.category, description: i.description, quantity: Number(i.quantity), unitCostMinor: i.unitCostMinor ?? Number.NaN, currency: i.currency, included: i.included, optional: i.optional })),
      discountMinor: discount ?? Number.NaN,
      validUntil: validUntil || undefined,
      inclusions: lines(inclusions),
      exclusions: lines(exclusions),
      terms,
      clientNotes,
      internalNotes,
      refreshFx,
      ...(canPricing && override && cfg ? { pricing: cfg } : {}),
    };
    const parsed = quoteVersionSchema.extend({ refreshFx: z.boolean().default(false) }).safeParse(body);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join(".")] ??= /NaN|expected number/i.test(i.message) ? "Enter a valid amount" : i.message;
      setErrors(errs);
      setMessage("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    m.mutate(body);
  };

  const err = (p: string) => errors[p] ?? null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {conflict ? (
        <Alert tone="warning" title="This quotation was modified by someone else">
          <p>A newer version exists, so your changes were not saved. Reload to see the latest version, then re-apply your edits.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => {
              void qc.invalidateQueries({ queryKey: quoteKeys.all });
              onClose();
            }}
          >
            Reload quotation
          </Button>
        </Alert>
      ) : null}
      {message && !conflict ? <Alert tone="danger">{message}</Alert> : null}

      <section aria-labelledby="nv-extras" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 id="nv-extras" className="text-sm font-semibold">Extra items</h3>
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus /> Add item
          </Button>
        </div>
        <Alert tone="info">Extra items are not carried over from earlier versions. Add every extra item this version should include. Hotels come from the selected package.</Alert>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">No extra items.</p> : null}
        {items.map((it, idx) => (
          <fieldset key={it.key} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[9rem_1fr_5rem_11rem_6rem]">
            <legend className="px-1 text-xs font-semibold text-muted-foreground">Item {idx + 1}</legend>
            <Field label="Category" htmlFor={`it-cat-${it.key}`}>
              <Select id={`it-cat-${it.key}`} value={it.category} onChange={(e) => patch(it.key, { category: e.target.value })}>
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Description" htmlFor={`it-desc-${it.key}`} error={err(`extraItems.${idx}.description`)} required>
              <Input id={`it-desc-${it.key}`} maxLength={300} value={it.description} aria-invalid={!!err(`extraItems.${idx}.description`)} onChange={(e) => patch(it.key, { description: e.target.value })} />
            </Field>
            <Field label="Qty" htmlFor={`it-qty-${it.key}`} error={err(`extraItems.${idx}.quantity`)}>
              <Input id={`it-qty-${it.key}`} inputMode="numeric" className="tw-num text-right" value={it.quantity} onChange={(e) => patch(it.key, { quantity: e.target.value })} />
            </Field>
            <Field label="Unit cost" htmlFor={`it-cost-${it.key}`} error={err(`extraItems.${idx}.unitCostMinor`)} required>
              <MoneyInput id={`it-cost-${it.key}`} currency={it.currency} valueMinor={it.unitCostMinor} onMinorChange={(v) => patch(it.key, { unitCostMinor: v })} invalid={!!err(`extraItems.${idx}.unitCostMinor`)} />
            </Field>
            <Field label="Currency" htmlFor={`it-cur-${it.key}`}>
              <Select id={`it-cur-${it.key}`} value={it.currency} onChange={(e) => patch(it.key, { currency: e.target.value })}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap items-center gap-4 md:col-span-full">
              <Checkbox label="Included in price" checked={it.included} onChange={(e) => patch(it.key, { included: e.target.checked })} />
              <Checkbox label="Optional extra" checked={it.optional} onChange={(e) => patch(it.key, { optional: e.target.checked })} />
              <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} aria-label={`Remove item ${idx + 1}`}>
                <Trash2 /> Remove
              </Button>
            </div>
          </fieldset>
        ))}
        <p className="text-xs text-muted-foreground">Unit costs are your net cost. Selling prices are calculated by the server using your pricing rules.</p>
      </section>

      <section aria-labelledby="nv-price" className="grid gap-4 md:grid-cols-2">
        <h3 id="nv-price" className="sr-only md:col-span-2">Discount and validity</h3>
        <Field label={`Discount (${quote.currency})`} htmlFor="nv-discount" error={err("discountMinor")} hint="Off the selling price. Large discounts may need manager approval.">
          <MoneyInput id="nv-discount" currency={quote.currency} valueMinor={discount} onMinorChange={setDiscount} invalid={!!err("discountMinor")} />
        </Field>
        <Field label="Valid until" htmlFor="nv-valid" error={err("validUntil")} hint="Leave as is to keep the current validity date.">
          <Input id="nv-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} aria-invalid={!!err("validUntil")} />
        </Field>
      </section>

      <section aria-labelledby="nv-content" className="grid gap-4 md:grid-cols-2">
        <h3 id="nv-content" className="sr-only md:col-span-2">Client-facing content</h3>
        <Field label="Inclusions (one per line)" htmlFor="nv-inc" error={err("inclusions")}>
          <Textarea id="nv-inc" rows={5} value={inclusions} onChange={(e) => setInclusions(e.target.value)} />
        </Field>
        <Field label="Exclusions (one per line)" htmlFor="nv-exc" error={err("exclusions")}>
          <Textarea id="nv-exc" rows={5} value={exclusions} onChange={(e) => setExclusions(e.target.value)} />
        </Field>
        <Field label="Terms and conditions" htmlFor="nv-terms" error={err("terms")} className="md:col-span-2">
          <Textarea id="nv-terms" rows={4} maxLength={10000} value={terms} onChange={(e) => setTerms(e.target.value)} />
        </Field>
        <Field label="Notes for the client" htmlFor="nv-cnotes" error={err("clientNotes")} hint="Shown on the proposal.">
          <Textarea id="nv-cnotes" rows={3} maxLength={4000} value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} />
        </Field>
        <Field label="Internal notes" htmlFor="nv-inotes" error={err("internalNotes")} hint="Staff only. Never shown to the client.">
          <Textarea id="nv-inotes" rows={3} maxLength={4000} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
        </Field>
      </section>

      <section aria-labelledby="nv-adv" className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <h3 id="nv-adv" className="text-sm font-semibold">Pricing options</h3>
        <Switch checked={refreshFx} onCheckedChange={setRefreshFx} label="Refresh exchange rates from the latest snapshot" />
        <p className="-mt-1 text-xs text-muted-foreground">Off keeps the exchange rates frozen in the previous version so prices don&apos;t move unexpectedly.</p>
        {canPricing ? (
          <>
            <Switch checked={override} onCheckedChange={setOverride} label="Override pricing rules for this version" />
            {override ? (
              cfgQ.isLoading || !cfg ? (
                cfgQ.error ? <Alert tone="danger">{errorMessage(cfgQ.error)}</Alert> : <Skeleton className="h-24" />
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Mode" htmlFor="pc-mode">
                    <Select id="pc-mode" value={cfg.mode} onChange={(e) => setCfg({ ...cfg, mode: e.target.value as Cfg["mode"] })}>
                      <option value="target_margin">Target margin</option>
                      <option value="percent_markup">Percent markup</option>
                      <option value="fixed_markup">Fixed markup</option>
                    </Select>
                  </Field>
                  <Field label="Target margin" htmlFor="pc-tm" error={err("pricing.targetMarginBp")}><PercentInput id="pc-tm" valueBp={cfg.targetMarginBp} onChange={(v) => setCfg({ ...cfg, targetMarginBp: v })} /></Field>
                  <Field label="Markup" htmlFor="pc-mk" error={err("pricing.markupBp")}><PercentInput id="pc-mk" valueBp={cfg.markupBp} onChange={(v) => setCfg({ ...cfg, markupBp: v })} /></Field>
                  <Field label="Payment fee" htmlFor="pc-pf" error={err("pricing.paymentFeeBp")}><PercentInput id="pc-pf" valueBp={cfg.paymentFeeBp} onChange={(v) => setCfg({ ...cfg, paymentFeeBp: v })} /></Field>
                  <Field label="Selling tax" htmlFor="pc-tax" error={err("pricing.sellingTaxBp")}><PercentInput id="pc-tax" valueBp={cfg.sellingTaxBp} onChange={(v) => setCfg({ ...cfg, sellingTaxBp: v })} /></Field>
                  <Field label="Max discount without approval" htmlFor="pc-md" error={err("pricing.maxDiscountBp")}><PercentInput id="pc-md" valueBp={cfg.maxDiscountBp} onChange={(v) => setCfg({ ...cfg, maxDiscountBp: v })} /></Field>
                  <Field label="Approval margin floor" htmlFor="pc-af" error={err("pricing.approvalMarginFloorBp")}><PercentInput id="pc-af" valueBp={cfg.approvalMarginFloorBp} onChange={(v) => setCfg({ ...cfg, approvalMarginFloorBp: v })} /></Field>
                  <Field label="Fixed markup" htmlFor="pc-fm"><MoneyInput id="pc-fm" currency={quote.currency} valueMinor={cfg.fixedMarkupMinor} onMinorChange={(v) => setCfg({ ...cfg, fixedMarkupMinor: v ?? 0 })} /></Field>
                  <Field label="Minimum profit" htmlFor="pc-mp"><MoneyInput id="pc-mp" currency={quote.currency} valueMinor={cfg.minimumProfitMinor} onMinorChange={(v) => setCfg({ ...cfg, minimumProfitMinor: v ?? 0 })} /></Field>
                  <Field label="Minimum selling price" htmlFor="pc-ms"><MoneyInput id="pc-ms" currency={quote.currency} valueMinor={cfg.minimumSellingPriceMinor} onMinorChange={(v) => setCfg({ ...cfg, minimumSellingPriceMinor: v ?? 0 })} /></Field>
                  <Field label="Round up to" htmlFor="pc-rt">
                    <Select id="pc-rt" value={cfg.roundTo} onChange={(e) => setCfg({ ...cfg, roundTo: e.target.value as Cfg["roundTo"] })}>
                      <option value="none">No rounding</option>
                      <option value="unit">Whole unit</option>
                      <option value="ten">Nearest 10</option>
                      <option value="hundred">Nearest 100</option>
                    </Select>
                  </Field>
                  <p className="text-xs text-muted-foreground md:col-span-3">Starts from your organisation&apos;s pricing rules and applies to this version only.</p>
                </div>
              )
            ) : null}
          </>
        ) : null}
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={m.isPending}>Cancel</Button>
        <Button type="submit" loading={m.isPending} disabled={conflict}>Create version {quote.currentVersion + 1}</Button>
      </div>
    </form>
  );
}
