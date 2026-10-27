"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { SUPPORTED_CURRENCIES, supplierAgreementSchema, supplierSchema } from "@tripweave/shared";
import { Alert, Badge, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { apiGet, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDate, percentFromBp } from "@/lib/utils";
import { AGREEMENT_TYPE_LABEL, SUPPLIER_TYPE_LABEL, addDaysIso, apiFieldErrors, expiryState, issuesToErrors, todayIso } from "@/features/hotels/lib";
import type { Agreement, Supplier } from "@/features/hotels/types";

/* ---------------- supplier form ---------------- */
function SupplierForm({ supplier, onDone }: { supplier?: Supplier; onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = React.useState({ name: supplier?.name ?? "", providerKey: supplier?.providerKey ?? "", supplierType: supplier?.supplierType ?? "direct_hotel", status: supplier?.status ?? "active", configurationReference: supplier?.configurationReference ?? "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  const save = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const payload = { name: v.name.trim(), providerKey: v.providerKey.trim(), supplierType: v.supplierType, status: v.status, ...(v.configurationReference.trim() ? { configurationReference: v.configurationReference.trim() } : {}) };
      const parsed = supplierSchema.safeParse(payload);
      if (!parsed.success) {
        setErrors(issuesToErrors(parsed.error));
        throw new Error("Please fix the highlighted fields.");
      }
      setErrors({});
      if (supplier) {
        const { providerKey: _k, ...patch } = payload;
        void _k;
        return apiPatch(`/suppliers/${supplier.id}`, patch);
      }
      return apiPost("/suppliers", payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      await qc.invalidateQueries({ queryKey: ["agreements"] });
      toast.success(supplier ? "Supplier updated" : "Supplier created");
      onDone();
    },
    onError: (e) => {
      setErrors((s) => ({ ...s, ...apiFieldErrors(e) }));
      setFormError(errorMessage(e));
    },
  });
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field label="Supplier name" htmlFor="s-name" error={errors.name} required>
        <Input id="s-name" value={v.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
      </Field>
      <Field label="Provider key" htmlFor="s-key" error={errors.providerKey} hint={supplier ? "The provider key cannot be changed after creation." : "Lowercase letters, numbers and underscores, e.g. sea_breeze_direct."} required>
        <Input id="s-key" value={v.providerKey} disabled={!!supplier} onChange={(e) => set("providerKey", e.target.value)} aria-invalid={!!errors.providerKey} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="s-type" error={errors.supplierType}>
          <Select id="s-type" value={v.supplierType} onChange={(e) => set("supplierType", e.target.value)}>
            {Object.entries(SUPPLIER_TYPE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="s-status">
          <Select id="s-status" value={v.status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </div>
      <Field label="Configuration reference" htmlFor="s-cfg" error={errors.configurationReference} hint="An internal reference only. Never enter passwords or API keys here.">
        <Input id="s-cfg" maxLength={120} value={v.configurationReference} onChange={(e) => set("configurationReference", e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{supplier ? "Save supplier" : "Create supplier"}</Button>
      </div>
    </form>
  );
}

/* ---------------- agreement form ---------------- */
function AgreementForm({ agreement, suppliers, onDone }: { agreement?: Agreement; suppliers: Supplier[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = React.useState({
    supplierId: agreement?.supplierId ?? suppliers[0]?.id ?? "",
    contractReference: agreement?.contractReference ?? "",
    agreementType: agreement?.agreementType ?? "net_rate",
    currency: agreement?.currency ?? "USD",
    commissionPct: agreement ? String(agreement.commissionBp / 100) : "0",
    effectiveFrom: agreement?.effectiveFrom ?? todayIso(),
    effectiveTo: agreement?.effectiveTo ?? addDaysIso(todayIso(), 364),
    termsReference: agreement?.termsReference ?? "",
    status: agreement?.status ?? "active",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  const save = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const pct = v.commissionPct.trim() === "" ? 0 : /^\d+(\.\d{1,2})?$/.test(v.commissionPct.trim()) ? Number(v.commissionPct) : NaN;
      const payload = {
        supplierId: v.supplierId,
        contractReference: v.contractReference.trim(),
        agreementType: v.agreementType,
        currency: v.currency,
        commissionBp: Math.round(pct * 100),
        effectiveFrom: v.effectiveFrom,
        effectiveTo: v.effectiveTo,
        status: v.status,
        ...(v.termsReference.trim() ? { termsReference: v.termsReference.trim() } : {}),
      };
      const parsed = supplierAgreementSchema.safeParse(payload);
      const errs = parsed.success ? {} : issuesToErrors(parsed.error);
      if (Number.isNaN(pct)) errs.commissionBp = "Enter a percentage such as 10 or 12.5";
      else if (pct > 90) errs.commissionBp = "Commission cannot exceed 90%";
      if (!v.supplierId) errs.supplierId = "Choose a supplier";
      if (Object.keys(errs).length) {
        setErrors(errs);
        throw new Error("Please fix the highlighted fields.");
      }
      setErrors({});
      if (agreement) {
        const { supplierId: _s, ...patch } = payload;
        void _s;
        return apiPatch(`/agreements/${agreement.id}`, patch);
      }
      return apiPost("/agreements", payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["agreements"] });
      await qc.invalidateQueries({ queryKey: ["expiring"] });
      toast.success(agreement ? "Agreement updated" : "Agreement created");
      onDone();
    },
    onError: (e) => {
      setErrors((s) => ({ ...s, ...apiFieldErrors(e) }));
      setFormError(errorMessage(e));
    },
  });
  const e = errors;
  return (
    <form noValidate onSubmit={(ev) => { ev.preventDefault(); save.mutate(); }} className="flex flex-col gap-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier" htmlFor="a-sup" error={e.supplierId} required hint={agreement ? "The supplier of an agreement cannot be changed." : undefined}>
          <Select id="a-sup" value={v.supplierId} disabled={!!agreement} onChange={(ev) => set("supplierId", ev.target.value)}>
            {suppliers.length === 0 ? <option value="">Create a supplier first</option> : null}
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Contract reference" htmlFor="a-ref" error={e.contractReference} required>
          <Input id="a-ref" value={v.contractReference} onChange={(ev) => set("contractReference", ev.target.value)} aria-invalid={!!e.contractReference} />
        </Field>
        <Field label="Agreement type" htmlFor="a-type" error={e.agreementType}>
          <Select id="a-type" value={v.agreementType} onChange={(ev) => set("agreementType", ev.target.value)}>
            {Object.entries(AGREEMENT_TYPE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Currency" htmlFor="a-cur" error={e.currency}>
          <Select id="a-cur" value={v.currency} onChange={(ev) => set("currency", ev.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Commission (%)" htmlFor="a-comm" error={e.commissionBp} hint="0–90%. Used for commissionable agreements.">
          <Input id="a-comm" inputMode="decimal" value={v.commissionPct} onChange={(ev) => set("commissionPct", ev.target.value)} className="max-w-32" />
        </Field>
        <Field label="Status" htmlFor="a-status" error={e.status}>
          <Select id="a-status" value={v.status} onChange={(ev) => set("status", ev.target.value)}>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="expired">Expired</option>
            <option value="terminated">Terminated</option>
          </Select>
        </Field>
        <Field label="Valid from" htmlFor="a-from" error={e.effectiveFrom} required>
          <Input id="a-from" type="date" value={v.effectiveFrom} onChange={(ev) => set("effectiveFrom", ev.target.value)} />
        </Field>
        <Field label="Valid to" htmlFor="a-to" error={e.effectiveTo} required>
          <Input id="a-to" type="date" value={v.effectiveTo} onChange={(ev) => set("effectiveTo", ev.target.value)} />
        </Field>
      </div>
      <Field label="Terms reference" htmlFor="a-terms" error={e.termsReference} hint="Where the signed terms live, e.g. a document number or folder. Do not paste confidential contract text.">
        <Textarea id="a-terms" rows={2} maxLength={500} value={v.termsReference} onChange={(ev) => set("termsReference", ev.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={save.isPending} disabled={suppliers.length === 0}>{agreement ? "Save agreement" : "Create agreement"}</Button>
      </div>
    </form>
  );
}

/* ---------------- tables ---------------- */
function SuppliersPanel({ canManage }: { canManage: boolean }) {
  const [dialog, setDialog] = React.useState<Supplier | "new" | null>(null);
  const q = useQuery({ queryKey: ["suppliers"], queryFn: () => apiGet<Supplier[]>("/suppliers") });
  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setDialog("new")}><Plus /> Add supplier</Button>
        </div>
      ) : null}
      {q.isLoading ? (
        <LoadingBlock label="Loading suppliers" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load suppliers" />
      ) : !q.data || q.data.length === 0 ? (
        <EmptyState title="No suppliers yet" description="Suppliers are the hotels, DMCs or wholesalers you buy rates from." action={canManage ? <Button onClick={() => setDialog("new")}>Add supplier</Button> : undefined} />
      ) : (
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">Suppliers</caption>
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5">Name</th>
                <th scope="col" className="px-4 py-2.5">Provider key</th>
                <th scope="col" className="px-4 py-2.5">Type</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
                {canManage ? <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.providerKey}</td>
                  <td className="px-4 py-3">{SUPPLIER_TYPE_LABEL[s.supplierType] ?? s.supplierType}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  {canManage ? (
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setDialog(s)}><Pencil /> Edit</Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog !== null ? (
          <DialogContent title={dialog === "new" ? "Add supplier" : `Edit ${dialog.name}`}>
            <SupplierForm supplier={dialog === "new" ? undefined : dialog} onDone={() => setDialog(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function AgreementsPanel({ canManageSuppliers }: { canManageSuppliers: boolean }) {
  void canManageSuppliers;
  const [dialog, setDialog] = React.useState<Agreement | "new" | null>(null);
  const q = useQuery({ queryKey: ["agreements"], queryFn: () => apiGet<Agreement[]>("/agreements") });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => apiGet<Supplier[]>("/suppliers"), staleTime: 60_000 });
  const expiring = (q.data ?? []).filter((a) => a.status === "active" && expiryState(a.effectiveTo, 30));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setDialog("new")}><Plus /> Add agreement</Button>
      </div>
      {expiring.length > 0 ? (
        <Alert tone="warning" title={`${expiring.length} agreement${expiring.length === 1 ? "" : "s"} expiring within 30 days or already expired`}>
          {expiring.map((a) => a.contractReference).join(", ")}. Renew them before the rates they support lapse.
        </Alert>
      ) : null}
      {q.isLoading ? (
        <LoadingBlock label="Loading agreements" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load agreements" />
      ) : !q.data || q.data.length === 0 ? (
        <EmptyState title="No agreements yet" description="Record each supplier contract so rate plans can reference it. Contract details are internal and never shared with partners." action={<Button onClick={() => setDialog("new")}>Add agreement</Button>} />
      ) : (
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <caption className="sr-only">Supplier agreements</caption>
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5">Contract</th>
                <th scope="col" className="px-4 py-2.5">Supplier</th>
                <th scope="col" className="px-4 py-2.5">Type</th>
                <th scope="col" className="px-4 py-2.5">Currency</th>
                <th scope="col" className="px-4 py-2.5">Commission</th>
                <th scope="col" className="px-4 py-2.5">Validity</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((a) => {
                const ex = a.status === "active" ? expiryState(a.effectiveTo, 30) : null;
                return (
                  <tr key={a.id} className={ex ? "border-t border-border bg-warning-soft/40" : "border-t border-border"}>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{a.contractReference}</div>
                      {a.termsReference ? <div className="max-w-56 truncate text-xs text-muted-foreground" title={a.termsReference}>{a.termsReference}</div> : null}
                    </td>
                    <td className="px-4 py-3">{a.supplierName ?? (suppliers.data ?? []).find((s) => s.id === a.supplierId)?.name ?? "—"}</td>
                    <td className="px-4 py-3">{AGREEMENT_TYPE_LABEL[a.agreementType] ?? a.agreementType}</td>
                    <td className="px-4 py-3">{a.currency}</td>
                    <td className="tw-num px-4 py-3">{percentFromBp(a.commissionBp)}</td>
                    <td className="px-4 py-3">
                      <div className="tw-num">{formatDate(a.effectiveFrom)} – {formatDate(a.effectiveTo)}</div>
                      {ex ? <Badge tone={ex.kind === "expired" ? "danger" : "warning"} className="mt-1">{ex.kind === "expired" ? `Expired ${ex.days}d ago` : `Expires in ${ex.days}d`}</Badge> : null}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setDialog(a)}><Pencil /> Edit</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog !== null ? (
          <DialogContent title={dialog === "new" ? "Add agreement" : `Edit ${dialog.contractReference}`} description="Contract details are internal. Partners you share rates with never see them." wide>
            <AgreementForm agreement={dialog === "new" ? undefined : dialog} suppliers={suppliers.data ?? []} onDone={() => setDialog(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

export default function AgreementsPage() {
  const can = useCan();
  const canAgreements = can("agreements:manage");
  const canSuppliers = can("suppliers:manage");
  const canReadSuppliers = can("rates:read");
  if (!canAgreements && !canSuppliers)
    return (
      <div>
        <PageHeader title="Suppliers & contracts" />
        <Alert tone="warning" title="Not available to your role">You need the suppliers:manage or agreements:manage permission.</Alert>
      </div>
    );
  return (
    <div>
      <PageHeader title="Suppliers & contracts" icon={Handshake} description="Who you buy from and the contracts behind your rates. This information is internal and never shown to partners or clients." />
      <Tabs defaultValue={canReadSuppliers ? "suppliers" : "agreements"}>
        <TabsList aria-label="Suppliers and agreements">
          {canReadSuppliers ? <TabsTrigger value="suppliers">Suppliers</TabsTrigger> : null}
          {canAgreements ? <TabsTrigger value="agreements">Agreements</TabsTrigger> : null}
        </TabsList>
        {canReadSuppliers ? (
          <TabsContent value="suppliers">
            <SuppliersPanel canManage={canSuppliers} />
          </TabsContent>
        ) : null}
        {canAgreements ? (
          <TabsContent value="agreements">
            <AgreementsPanel canManageSuppliers={canSuppliers} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
