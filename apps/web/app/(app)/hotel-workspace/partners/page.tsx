"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Search, Share2 } from "lucide-react";
import { IMAGES } from "@/features/marketing/imagery";
import { toast } from "sonner";
import { partnerAccessSchema } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { ApiError, apiDelete, apiGet, apiList, apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDate, titleCase } from "@/lib/utils";
import { addDaysIso, apiFieldErrors, issuesToErrors, todayIso } from "@/features/hotels/lib";
import type { PartnerShare, Property, RatePlanWithRules } from "@/features/hotels/types";

interface OrgLookup {
  id: string;
  name: string;
  type: string;
}

const SCOPE_LABEL: Record<string, string> = { net_rates: "Net rates", indicative_only: "Indicative only" };

function ShareForm() {
  const qc = useQueryClient();
  const [slug, setSlug] = React.useState("");
  const [org, setOrg] = React.useState<OrgLookup | null>(null);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [resourceType, setResourceType] = React.useState<"property" | "rate_plan">("property");
  const [propertyId, setPropertyId] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [scope, setScope] = React.useState<"net_rates" | "indicative_only">("net_rates");
  const [validFrom, setValidFrom] = React.useState(todayIso());
  const [validUntil, setValidUntil] = React.useState(addDaysIso(todayIso(), 365));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const props = useQuery({ queryKey: ["hotels", "own-all"], queryFn: () => apiList<Property>("/hotels", { scope: "own", pageSize: 100, sort: "name", order: "asc" }) });
  const properties = props.data?.items ?? [];
  React.useEffect(() => {
    if (!propertyId && properties[0]) setPropertyId(properties[0].id);
  }, [properties, propertyId]);
  const plans = useQuery({ queryKey: ["hotel", propertyId, "rates"], queryFn: () => apiGet<RatePlanWithRules[]>(`/hotels/${propertyId}/rates`), enabled: resourceType === "rate_plan" && !!propertyId });
  const ownPlans = (plans.data ?? []).filter((p) => !p.shared);
  React.useEffect(() => setPlanId(""), [propertyId, resourceType]);

  const lookup = useMutation({
    mutationFn: () => apiGet<OrgLookup>("/organizations/lookup", { slug: slug.trim().toLowerCase() }),
    onSuccess: (o) => {
      setOrg(o);
      setLookupError(null);
    },
    onError: (e) => {
      setOrg(null);
      setLookupError(e instanceof ApiError && e.status === 404 ? "No active organisation has that slug. Ask your partner for the slug shown in their organisation settings." : errorMessage(e));
    },
  });

  const share = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const payload = { receivingOrganizationId: org?.id ?? "", resourceType, resourceId: resourceType === "property" ? propertyId : planId, permittedRateScope: scope, validFrom, validUntil };
      const parsed = partnerAccessSchema.safeParse(payload);
      const errs = parsed.success ? {} : issuesToErrors(parsed.error);
      if (!org) errs.receivingOrganizationId = "Look up the recipient organisation first";
      if (!payload.resourceId) errs.resourceId = resourceType === "property" ? "Choose a property" : "Choose a rate plan";
      if (Object.keys(errs).length) {
        setErrors(errs);
        throw new Error("Please fix the highlighted fields.");
      }
      setErrors({});
      return apiPost("/partners/shared", payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["partners", "shared"] });
      toast.success(`Shared with ${org?.name}`);
    },
    onError: (e) => {
      setErrors((s) => ({ ...s, ...apiFieldErrors(e) }));
      setFormError(errorMessage(e));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Share2 className="size-4" aria-hidden /> Share with a partner</CardTitle>
        <CardDescription>Find the partner by their organisation slug, then choose exactly what to share and for how long.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert tone="info" title="What sharing exposes">
          Sharing one rate plan shows only that plan to the partner. It never exposes your other plans, supplier names or contract terms, and you can revoke it at any time.
        </Alert>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (slug.trim().length >= 2) lookup.mutate();
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <Field label="Recipient organisation slug" htmlFor="sh-slug" error={errors.receivingOrganizationId} className="min-w-60 flex-1">
            <Input id="sh-slug" value={slug} onChange={(e) => { setSlug(e.target.value); setOrg(null); }} placeholder="e.g. island-tours" aria-invalid={!!errors.receivingOrganizationId} />
          </Field>
          <Button type="submit" variant="outline" loading={lookup.isPending} disabled={slug.trim().length < 2}>
            <Search /> Look up
          </Button>
        </form>
        <div aria-live="polite">
          {org ? (
            <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm">
              <span className="font-semibold">{org.name}</span>
              <Badge tone="neutral">{org.type === "tour_operator" ? "Tour operator" : "Hotel management"}</Badge>
            </div>
          ) : lookupError ? (
            <p role="alert" className="text-sm text-destructive">{lookupError}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Share" htmlFor="sh-type">
            <Select id="sh-type" value={resourceType} onChange={(e) => setResourceType(e.target.value as "property" | "rate_plan")}>
              <option value="property">A whole property (all its rate plans)</option>
              <option value="rate_plan">A single rate plan</option>
            </Select>
          </Field>
          <Field label="Property" htmlFor="sh-prop" error={resourceType === "property" ? errors.resourceId : undefined}>
            <Select id="sh-prop" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} disabled={properties.length === 0}>
              {properties.length === 0 ? <option value="">{props.isLoading ? "Loading…" : "You own no properties"}</option> : null}
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name} – {p.city}</option>
              ))}
            </Select>
          </Field>
          {resourceType === "rate_plan" ? (
            <Field label="Rate plan" htmlFor="sh-plan" error={errors.resourceId} className="sm:col-span-2" hint={plans.isLoading ? "Loading plans…" : ownPlans.length === 0 ? "This property has no rate plans of its own yet." : undefined}>
              <Select id="sh-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">Choose a rate plan</option>
                {ownPlans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.roomTypeName} · {p.mealPlan} · {p.currency} · to {formatDate(p.effectiveTo)}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="What the partner may see" htmlFor="sh-scope" error={errors.permittedRateScope} hint={scope === "net_rates" ? "Partner sees your net rates and can use them in quotations." : "Partner sees indicative information only, not your net rates."}>
            <Select id="sh-scope" value={scope} onChange={(e) => setScope(e.target.value as "net_rates" | "indicative_only")}>
              <option value="net_rates">Net rates</option>
              <option value="indicative_only">Indicative only</option>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valid from" htmlFor="sh-from" error={errors.validFrom}>
              <Input id="sh-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </Field>
            <Field label="Valid until" htmlFor="sh-until" error={errors.validUntil}>
              <Input id="sh-until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="flex justify-end">
          <Button loading={share.isPending} onClick={() => share.mutate()}>
            <Share2 /> Share
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SharedByMe() {
  const qc = useQueryClient();
  const [revoking, setRevoking] = React.useState<PartnerShare | null>(null);
  const q = useQuery({ queryKey: ["partners", "shared"], queryFn: () => apiGet<PartnerShare[]>("/partners/shared") });
  const revoke = useMutation({
    mutationFn: (s: PartnerShare) => apiDelete(`/partners/shared/${s.id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["partners", "shared"] });
      toast.success("Share revoked");
      setRevoking(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setRevoking(null);
    },
  });
  return (
    <div className="flex flex-col gap-6">
      <ShareForm />
      <Card>
        <CardHeader>
          <CardTitle>Shares you granted</CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {q.isLoading ? (
            <div className="p-5"><LoadingBlock label="Loading shares" /></div>
          ) : q.error ? (
            <div className="p-5"><ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load shares" /></div>
          ) : !q.data || q.data.length === 0 ? (
            <div className="p-5"><EmptyState icon={Share2} title="Nothing shared yet" description="Use the form above to share a property or a single rate plan with a partner." /></div>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <caption className="sr-only">Shares you granted</caption>
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Partner</th>
                    <th scope="col" className="px-4 py-2.5">Shared</th>
                    <th scope="col" className="px-4 py-2.5">Scope</th>
                    <th scope="col" className="px-4 py-2.5">Validity</th>
                    <th scope="col" className="px-4 py-2.5">Status</th>
                    <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold">{s.receivingOrganizationName ?? "Organisation"}</td>
                      <td className="px-4 py-3">
                        <Badge tone="outline">{s.resourceType === "property" ? "Property" : "Rate plan"}</Badge>{" "}
                        {s.resourceType === "property" ? <Link href={`/hotels/${s.resourceId}`} className="text-primary hover:underline">{s.resourceName ?? "Property"}</Link> : <span>{s.resourceName ?? "Rate plan"}</span>}
                      </td>
                      <td className="px-4 py-3">{SCOPE_LABEL[s.permittedRateScope] ?? titleCase(s.permittedRateScope)}</td>
                      <td className="tw-num px-4 py-3">{formatDate(s.validFrom)} – {formatDate(s.validUntil)}</td>
                      <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {s.status === "active" ? <Button size="sm" variant="outline" onClick={() => setRevoking(s)}>Revoke</Button> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog open={revoking !== null} onOpenChange={(o) => !o && setRevoking(null)} title="Revoke this share?" description={`${revoking?.receivingOrganizationName ?? "The partner"} will immediately lose access to ${revoking?.resourceName ?? "it"}. Quotes they already created are not changed.`} confirmLabel="Revoke" destructive loading={revoke.isPending} onConfirm={() => revoking && revoke.mutate(revoking)} />
    </div>
  );
}

function EnquiryForm({ share, onDone }: { share: PartnerShare; onDone: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = React.useState({ subject: "", message: "", stayStart: "", stayEnd: "", guests: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  const send = useMutation({
    mutationFn: async () => {
      const errs: Record<string, string> = {};
      if (v.subject.trim().length < 3) errs.subject = "Subject must be at least 3 characters";
      if (v.stayStart && v.stayEnd && v.stayEnd < v.stayStart) errs.stayEnd = "Must be on or after the arrival date";
      if (v.guests && (!/^\d+$/.test(v.guests) || Number(v.guests) < 1 || Number(v.guests) > 200)) errs.guests = "Enter a number from 1 to 200";
      if (Object.keys(errs).length) {
        setErrors(errs);
        throw new Error("Please fix the highlighted fields.");
      }
      setErrors({});
      return apiPost("/enquiries", {
        toOrganizationId: share.sourceOrganizationId,
        propertyId: share.resourceType === "property" ? share.resourceId : null,
        subject: v.subject.trim(),
        message: v.message,
        stayStart: v.stayStart || null,
        stayEnd: v.stayEnd || null,
        guests: v.guests ? Number(v.guests) : null,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["enquiries"] });
      toast.success("Enquiry sent");
      onDone();
    },
    onError: (e) => {
      setErrors((s) => ({ ...s, ...apiFieldErrors(e) }));
      setError(errorMessage(e));
    },
  });
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Subject" htmlFor="en-subject" error={errors.subject} required>
        <Input id="en-subject" value={v.subject} onChange={(e) => set("subject", e.target.value)} aria-invalid={!!errors.subject} />
      </Field>
      <Field label="Message" htmlFor="en-msg" error={errors.message}>
        <Textarea id="en-msg" rows={4} maxLength={4000} value={v.message} onChange={(e) => set("message", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Arrival" htmlFor="en-from" error={errors.stayStart}><Input id="en-from" type="date" value={v.stayStart} onChange={(e) => set("stayStart", e.target.value)} /></Field>
        <Field label="Departure" htmlFor="en-to" error={errors.stayEnd}><Input id="en-to" type="date" value={v.stayEnd} onChange={(e) => set("stayEnd", e.target.value)} /></Field>
        <Field label="Guests" htmlFor="en-guests" error={errors.guests}><Input id="en-guests" inputMode="numeric" value={v.guests} onChange={(e) => set("guests", e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={send.isPending}><Mail /> Send enquiry</Button>
      </div>
    </form>
  );
}

function SharedWithMe() {
  const can = useCan();
  const [enquiring, setEnquiring] = React.useState<PartnerShare | null>(null);
  const q = useQuery({ queryKey: ["partners", "received"], queryFn: () => apiGet<PartnerShare[]>("/partners/received") });
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info">Partners decide what you can see. You can only send an enquiry to a partner that currently shares something with you.</Alert>
      {q.isLoading ? (
        <LoadingBlock label="Loading shared inventory" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load shared inventory" />
      ) : !q.data || q.data.length === 0 ? (
        <EmptyState icon={Share2} title="Nothing shared with you" description="When a partner shares a property or rate plan with your organisation it will appear here." />
      ) : (
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <caption className="sr-only">Shared with you</caption>
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5">From</th>
                <th scope="col" className="px-4 py-2.5">Shared</th>
                <th scope="col" className="px-4 py-2.5">Scope</th>
                <th scope="col" className="px-4 py-2.5">Valid until</th>
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold">{s.sourceOrganizationName ?? "Partner"}</td>
                  <td className="px-4 py-3">
                    <Badge tone="outline">{s.resourceType === "property" ? "Property" : "Rate plan"}</Badge>{" "}
                    {s.resourceType === "property" ? <Link href={`/hotels/${s.resourceId}`} className="text-primary hover:underline">{s.resourceName ?? "Property"}</Link> : <span>{s.resourceName ?? "Rate plan"}</span>}
                  </td>
                  <td className="px-4 py-3">{SCOPE_LABEL[s.permittedRateScope] ?? titleCase(s.permittedRateScope)}</td>
                  <td className="tw-num px-4 py-3">{formatDate(s.validUntil)}</td>
                  <td className="px-4 py-3 text-right">
                    {can("trips:write") ? <Button size="sm" variant="outline" onClick={() => setEnquiring(s)}><Mail /> Send enquiry</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Dialog open={enquiring !== null} onOpenChange={(o) => !o && setEnquiring(null)}>
        {enquiring ? (
          <DialogContent title={`Enquiry to ${enquiring.sourceOrganizationName ?? "partner"}`} description={enquiring.resourceType === "property" ? `About ${enquiring.resourceName ?? "the shared property"}` : "General enquiry about the rates they shared"}>
            <EnquiryForm share={enquiring} onDone={() => setEnquiring(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

export default function PartnersPage() {
  const can = useCan();
  const canManage = can("partners:manage");
  return (
    <div>
      <PageHeader title="Partner sharing" icon={Share2} image={IMAGES.operators} description="Share inventory with other organisations on your terms, and see what has been shared with you." />
      <Tabs defaultValue={canManage ? "shared" : "received"}>
        <TabsList aria-label="Partner sharing">
          {canManage ? <TabsTrigger value="shared">Shared by me</TabsTrigger> : null}
          <TabsTrigger value="received">Shared with me</TabsTrigger>
        </TabsList>
        {canManage ? (
          <TabsContent value="shared">
            <SharedByMe />
          </TabsContent>
        ) : null}
        <TabsContent value="received">
          <SharedWithMe />
        </TabsContent>
      </Tabs>
    </div>
  );
}
