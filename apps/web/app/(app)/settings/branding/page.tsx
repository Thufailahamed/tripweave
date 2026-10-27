"use client";
import * as React from "react";
import { Palette } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { brandingSchema } from "@tripweave/shared";
import type { z } from "zod";
import { Alert, Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { apiPatch } from "@/lib/api";
import { SESSION_KEY, useCan } from "@/lib/session";
import { applyFieldErrors, NoAccess, ORG_KEY, useOrganization } from "@/features/settings/shared";

const DEFAULT_PRIMARY = "#14443c";
const DEFAULT_ACCENT = "#b8943f";

type BrandingValues = z.input<typeof brandingSchema>;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Picks black or white text for a background colour (presentation only). */
function readableOn(hex: string): string {
  if (!HEX.test(hex)) return "#ffffff";
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.4 ? "#1b2421" : "#ffffff";
}

function ColorField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field label={label} htmlFor={id} error={error} hint="Six-digit hex, e.g. #14443c">
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} colour picker`} value={HEX.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-card p-0.5" />
        <Input id={id} value={value} maxLength={7} spellCheck={false} aria-invalid={!!error} className="tw-num uppercase" onChange={(e) => onChange(e.target.value.startsWith("#") || e.target.value === "" ? e.target.value : `#${e.target.value}`)} />
      </div>
    </Field>
  );
}

function Preview({ v, orgName }: { v: BrandingValues; orgName: string }) {
  const primary = HEX.test(v.primaryColor ?? "") ? v.primaryColor! : DEFAULT_PRIMARY;
  const accent = HEX.test(v.accentColor ?? "") ? v.accentColor! : DEFAULT_ACCENT;
  const fg = readableOn(primary);
  const [logoFailed, setLogoFailed] = React.useState(false);
  React.useEffect(() => setLogoFailed(false), [v.logoUrl]);
  const name = v.productName?.trim() || orgName;
  const contact = [v.contactEmail, v.contactPhone, v.website].filter(Boolean);
  return (
    <Card className="self-start overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Quotation header preview</CardTitle>
          <Badge tone="outline">Sample</Badge>
        </div>
        <CardDescription>How your branding will look at the top of a client quotation. Sample text only.</CardDescription>
      </CardHeader>
      <div className="p-5">
        <div className="tw-light overflow-hidden rounded-lg border border-border bg-white text-foreground shadow-sm">
          <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ background: primary, color: fg }}>
            <div className="flex min-w-0 items-center gap-3">
              {v.logoUrl && !logoFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.logoUrl} alt="" referrerPolicy="no-referrer" onError={() => setLogoFailed(true)} className="h-9 max-w-28 rounded bg-white/90 object-contain p-0.5" />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md font-display text-lg font-bold" style={{ background: accent, color: readableOn(accent) }}>
                  {name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate font-display text-lg font-semibold">{name}</span>
            </div>
            <div className="text-right text-xs">
              <p className="font-semiboldr opacity-80">Quotation</p>
              <p className="tw-num">Q-0000 (sample)</p>
            </div>
          </div>
          <div className="h-1" style={{ background: accent }} />
          <div className="space-y-2 px-5 py-4 text-sm">
            <p className="font-display text-base font-semibold" style={{ color: primary }}>
              Sri Lanka Highlights, 9 nights
            </p>
            <p className="text-xs text-slate-500">Prepared for: Sample client</p>
            <div className="mt-2 rounded-md px-3 py-2 text-xs font-semibold" style={{ background: `${accent}22`, color: "#4a3a0c" }}>
              Sample package highlight bar
            </div>
          </div>
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] leading-relaxed text-slate-600">
            {v.quoteFooter ? <p className="whitespace-pre-line">{v.quoteFooter}</p> : <p className="italic text-slate-400">Your quotation footer appears here.</p>}
            {contact.length || v.address ? (
              <p className="mt-1.5 text-slate-500">
                {[v.address, ...contact].filter(Boolean).join("  ·  ")}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function BrandingPage() {
  const can = useCan();
  const qc = useQueryClient();
  const q = useOrganization();
  const [error, setError] = React.useState<string | null>(null);
  const { register, control, handleSubmit, reset, watch, setError: setFieldError, formState } = useForm<BrandingValues>({
    resolver: zodResolver(brandingSchema) as never,
    defaultValues: { productName: "", logoUrl: "", primaryColor: DEFAULT_PRIMARY, accentColor: DEFAULT_ACCENT, contactEmail: "", contactPhone: "", address: "", website: "", quoteFooter: "" },
  });
  const toValues = React.useCallback((b: NonNullable<typeof q.data>["branding"]): BrandingValues => ({
    productName: b.productName ?? "",
    logoUrl: b.logoUrl ?? "",
    primaryColor: b.primaryColor ?? DEFAULT_PRIMARY,
    accentColor: b.accentColor ?? DEFAULT_ACCENT,
    contactEmail: b.contactEmail ?? "",
    contactPhone: b.contactPhone ?? "",
    address: b.address ?? "",
    website: b.website ?? "",
    quoteFooter: b.quoteFooter ?? "",
  }), []);
  React.useEffect(() => {
    if (q.data) reset(toValues(q.data.branding ?? {}));
  }, [q.data, reset, toValues]);
  const values = watch();

  const save = useMutation({
    mutationFn: (b: BrandingValues) => apiPatch("/organization", { branding: b }),
    onSuccess: () => {
      toast.success("Branding saved");
      qc.invalidateQueries({ queryKey: ORG_KEY });
      qc.invalidateQueries({ queryKey: SESSION_KEY });
    },
  });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await save.mutateAsync(v);
    } catch (e) {
      setError(applyFieldErrors(e, (name, err) => setFieldError((String(name).replace(/^branding\./, "")) as keyof BrandingValues, err)));
    }
  });

  if (!can("org:manage")) {
    return (
      <>
        <PageHeader title="Branding" eyebrow="Settings" />
        <NoAccess what="Editing branding" permission="org:manage" />
      </>
    );
  }
  const err = formState.errors;
  return (
    <>
      <PageHeader title="Branding" eyebrow="Settings" icon={Palette} description="Your name, colours and contact details on client-facing quotations and the app header." />
      {q.isLoading ? (
        <LoadingBlock label="Loading branding" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Card>
            <form onSubmit={onSubmit} noValidate>
              <CardContent className="flex flex-col gap-4">
                {error ? <Alert tone="danger">{error}</Alert> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Product / trading name" htmlFor="b-name" error={err.productName?.message} hint="Shown instead of the organisation name. Max 80 characters.">
                    <Input id="b-name" {...register("productName")} />
                  </Field>
                  <Field label="Logo URL" htmlFor="b-logo" error={err.logoUrl?.message} hint="A public https:// image link. Leave empty for none.">
                    <Input id="b-logo" type="url" inputMode="url" {...register("logoUrl")} />
                  </Field>
                  <Controller control={control} name="primaryColor" render={({ field }) => <ColorField id="b-primary" label="Primary colour" value={field.value ?? ""} onChange={field.onChange} error={err.primaryColor ? "Use a six-digit hex colour like #14443c" : undefined} />} />
                  <Controller control={control} name="accentColor" render={({ field }) => <ColorField id="b-accent" label="Accent colour" value={field.value ?? ""} onChange={field.onChange} error={err.accentColor ? "Use a six-digit hex colour like #b8943f" : undefined} />} />
                  <Field label="Contact email" htmlFor="b-email" error={err.contactEmail?.message}>
                    <Input id="b-email" type="email" {...register("contactEmail")} />
                  </Field>
                  <Field label="Contact phone" htmlFor="b-phone" error={err.contactPhone?.message}>
                    <Input id="b-phone" type="tel" {...register("contactPhone")} />
                  </Field>
                  <Field label="Website" htmlFor="b-web" error={err.website?.message}>
                    <Input id="b-web" {...register("website")} />
                  </Field>
                  <Field label="Address" htmlFor="b-address" error={err.address?.message}>
                    <Input id="b-address" {...register("address")} />
                  </Field>
                </div>
                <Field label="Quotation footer" htmlFor="b-footer" error={err.quoteFooter?.message} hint="Terms, payment instructions or a thank-you note. Max 1,000 characters.">
                  <Textarea id="b-footer" rows={4} {...register("quoteFooter")} />
                </Field>
              </CardContent>
              <CardFooter>
                <Button type="button" variant="outline" disabled={!formState.isDirty} onClick={() => q.data && reset(toValues(q.data.branding ?? {}))}>
                  Reset
                </Button>
                <Button type="submit" loading={save.isPending} disabled={!formState.isDirty}>
                  Save branding
                </Button>
              </CardFooter>
            </form>
          </Card>
          <Preview v={values} orgName={q.data?.name ?? "Your company"} />
        </div>
      )}
    </>
  );
}
