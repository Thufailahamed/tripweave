"use client";
import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, CheckCircle2, Download, Globe, Hotel, Mail, MapPin, Phone, Printer, Users, XCircle } from "lucide-react";
import { quoteAcceptSchema, type Branding } from "@tripweave/shared";
import { ApiError, apiGet, apiPost, errorMessage } from "@/lib/api";
import { cn, dateRange, formatDate, money, nightsLabel, titleCase } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Badge, LoadingBlock } from "@/components/ui/card";
import { categoryLabel } from "./helpers";

/** Mirrors the API's ClientQuoteView allow-list: the only data this page ever receives. */
interface ClientQuoteView {
  quoteNumber: string;
  version: number;
  status: string;
  currency: string;
  issuedAt: string;
  validUntil: string | null;
  organization: { name: string; branding: Branding };
  customerName: string | null;
  trip: { title: string; arrivalDate: string | null; departureDate: string | null; adults: number; children: number; rooms: number };
  itinerary: { destination: string; arrivalDate: string; departureDate: string; nights: number; activities: string[] }[];
  stays: { destination: string; propertyName: string; propertyCategory: string | null; roomType: string; mealPlan: string; checkIn: string; checkOut: string; nights: number; cancellation: string; imageUrl: string | null }[];
  lineItems: { category: string; description: string; quantity: number; totalMinor: number; optional: boolean }[];
  totals: { subtotalMinor: number; discountMinor: number; taxMinor: number; totalPayableMinor: number };
  inclusions: string[];
  exclusions: string[];
  terms: string;
  clientNotes: string;
}
interface PublicQuoteResponse {
  view: ClientQuoteView;
  canRespond: boolean;
  revised: boolean;
  expired: boolean;
}

/* ---------- safe branding helpers ---------- */
const HEX = /^#[0-9a-fA-F]{6}$/;
const safeColor = (c: string | undefined): string | null => (c && HEX.test(c) ? c : null);
/** Readable text colour (white or near-black) for a given #rrggbb background. */
function onColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#161a18" : "#ffffff";
}
function brandStyle(b: Branding): React.CSSProperties {
  const p = safeColor(b.primaryColor);
  const a = safeColor(b.accentColor);
  const s: Record<string, string> = {};
  if (p) {
    s["--primary"] = p;
    s["--primary-foreground"] = onColor(p);
    s["--ring"] = p;
    s["--primary-soft"] = `color-mix(in srgb, ${p} 10%, #ffffff)`;
  }
  if (a) {
    s["--accent"] = a;
    s["--accent-foreground"] = onColor(a);
    s["--accent-soft"] = `color-mix(in srgb, ${a} 16%, #ffffff)`;
  }
  return s as React.CSSProperties;
}
function safeUrl(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
const safeImage = (u: string | null): string | null => (u && (u.startsWith("/api/v1/public/") || u.startsWith("https://")) ? u : null);

/* ---------- page ---------- */
export function PublicProposal({ token }: { token: string }) {
  const q = useQuery({
    queryKey: ["public-quote", token],
    queryFn: () => apiGet<PublicQuoteResponse>(`/public/quotes/${encodeURIComponent(token)}`),
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (q.isLoading)
    return (
      <Shell>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <LoadingBlock rows={5} label="Loading your proposal" />
        </div>
      </Shell>
    );

  if (q.error || !q.data) {
    const transient = !(q.error instanceof ApiError) || q.error.status === 0 || q.error.status >= 500 || q.error.status === 429;
    return (
      <Shell>
        <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <AlertTriangle className="size-6" aria-hidden />
          </div>
          {transient ? (
            <>
              <h1 className="font-display text-2xl font-semibold">We couldn&apos;t load this page</h1>
              <p className="text-sm text-muted-foreground">Something went wrong on our side or with your connection. Please try again in a moment.</p>
              <Button onClick={() => q.refetch()} loading={q.isFetching}>Try again</Button>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-semibold">This link is invalid or has expired</h1>
              <p className="text-sm text-muted-foreground">Please contact your travel consultant and ask them to send you a new link.</p>
            </>
          )}
        </main>
      </Shell>
    );
  }

  return <Proposal token={token} data={q.data} />;
}

function Shell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style} className="tw-light min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 font-display text-xl font-semibold">
      {children}
    </h2>
  );
}

function Proposal({ token, data }: { token: string; data: PublicQuoteResponse }) {
  const { view, revised, expired } = data;
  const b = view.organization.branding;
  const logo = safeUrl(b.logoUrl)?.startsWith("https://") ? safeUrl(b.logoUrl) : null;
  const website = safeUrl(b.website);
  const [responded, setResponded] = React.useState<"accept" | "reject" | null>(null);
  const alreadyDecided = view.status === "accepted" || view.status === "rejected";
  const orgName = view.organization.name;
  const contacts = [
    b.contactEmail ? { icon: Mail, label: b.contactEmail, href: `mailto:${b.contactEmail}` } : null,
    b.contactPhone ? { icon: Phone, label: b.contactPhone, href: `tel:${b.contactPhone.replace(/[^\d+]/g, "")}` } : null,
    website ? { icon: Globe, label: website.replace(/^https?:\/\//, "").replace(/\/$/, ""), href: website } : null,
  ].filter((x): x is { icon: typeof Mail; label: string; href: string } => x !== null);

  return (
    <Shell style={brandStyle(b)}>
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-5">
          <div className="flex min-w-0 items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" referrerPolicy="no-referrer" className="h-10 max-w-32 rounded bg-white/90 object-contain p-1" />
            ) : null}
            <p className="truncate font-display text-lg font-semibold">{b.productName || orgName}</p>
          </div>
          <p className="text-sm opacity-90">
            Proposal <span className="tw-num font-semibold">{view.quoteNumber}</span>
            {view.version > 1 ? ` · version ${view.version}` : ""}
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6 sm:py-10">
        <section aria-labelledby="pp-title">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">{view.customerName ? `Prepared for ${view.customerName}` : "Your travel proposal"}</p>
          <h1 id="pp-title" className="mt-1 font-display text-3xl font-semibold leading-tight sm:text-4xl">{view.trip.title}</h1>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden /> Dates</dt>
              <dd className="mt-1 text-sm font-medium">{dateRange(view.trip.arrivalDate, view.trip.departureDate)}</dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Users className="size-3.5" aria-hidden /> Travellers</dt>
              <dd className="mt-1 text-sm font-medium">
                {view.trip.adults} adult{view.trip.adults === 1 ? "" : "s"}
                {view.trip.children > 0 ? `, ${view.trip.children} child${view.trip.children === 1 ? "" : "ren"}` : ""}
                {view.trip.rooms > 0 ? ` · ${view.trip.rooms} room${view.trip.rooms === 1 ? "" : "s"}` : ""}
              </dd>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total price</dt>
              <dd className="tw-num mt-1 font-display text-xl font-semibold text-primary">{money(view.totals.totalPayableMinor, view.currency)}</dd>
            </div>
          </dl>
        </section>

        <div className="flex flex-col gap-3" aria-live="polite">
          {revised ? (
            <Alert tone="warning" title="Revised">
              This link shows an earlier version of your proposal. Please ask {orgName} for the latest link before you decide.
            </Alert>
          ) : null}
          {expired ? (
            <Alert tone="warning" title="Expired">
              This proposal was valid until {formatDate(view.validUntil)}. Prices and availability need to be re-confirmed, so please contact {orgName} for an updated proposal.
            </Alert>
          ) : view.validUntil && !revised ? (
            <Alert tone="info">This proposal is valid until <strong>{formatDate(view.validUntil)}</strong>.</Alert>
          ) : null}
          {view.status === "accepted" && !responded ? <Alert tone="success" title="Accepted">This proposal has been accepted. Thank you!</Alert> : null}
          {view.status === "rejected" && !responded ? <Alert tone="info" title="Declined">This proposal was declined. If you&apos;d like to reconsider, please get in touch.</Alert> : null}
        </div>

        {view.itinerary.length > 0 ? (
          <section aria-labelledby="pp-itin">
            <SectionTitle id="pp-itin">Your itinerary</SectionTitle>
            <ol className="relative flex flex-col gap-5 border-l-2 border-primary/25 pl-6">
              {view.itinerary.map((s, i) => (
                <li key={`${s.destination}-${i}`} className="relative">
                  <span aria-hidden className="absolute -left-[33px] top-1 size-4 rounded-full border-[3px] border-primary bg-background" />
                  <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                    <MapPin className="size-4 text-accent" aria-hidden /> {s.destination}
                    <Badge tone="primary">{nightsLabel(s.nights)}</Badge>
                  </p>
                  <p className="text-sm text-muted-foreground">{dateRange(s.arrivalDate, s.departureDate)}</p>
                  {s.activities.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {s.activities.map((a, k) => (
                        <li key={k}>{a}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {view.stays.length > 0 ? (
          <section aria-labelledby="pp-stays">
            <SectionTitle id="pp-stays">Where you&apos;ll stay</SectionTitle>
            <ul className="grid gap-4 sm:grid-cols-2">
              {view.stays.map((s, i) => {
                const img = safeImage(s.imageUrl);
                return (
                  <li key={`${s.propertyName}-${i}`} className="overflow-hidden rounded-xl border border-border bg-card print:break-inside-avoid">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={`${s.propertyName}`} loading="lazy" referrerPolicy="no-referrer" className="h-44 w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                    ) : (
                      <div aria-hidden className="flex h-20 items-center justify-center bg-primary-soft text-primary">
                        <Hotel className="size-7" />
                      </div>
                    )}
                    <div className="p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-accent">{s.destination}</p>
                      <h3 className="mt-0.5 text-lg font-semibold leading-snug">{s.propertyName}</h3>
                      {s.propertyCategory ? <p className="text-xs text-muted-foreground">{titleCase(s.propertyCategory)}</p> : null}
                      <p className="mt-2 text-sm">{s.roomType}</p>
                      <p className="text-sm text-muted-foreground">{s.mealPlan}</p>
                      <p className="mt-2 text-sm font-medium">
                        {formatDate(s.checkIn, { day: "numeric", month: "short" })} – {formatDate(s.checkOut)} · {nightsLabel(s.nights)}
                      </p>
                      <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">{s.cancellation}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="pp-price">
          <SectionTitle id="pp-price">Pricing</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul>
              {view.lineItems.map((l, i) => (
                <li key={i} className={cn("flex items-start justify-between gap-4 px-4 py-3 text-sm", i > 0 && "border-t border-border")}>
                  <div className="min-w-0">
                    <p className={cn("font-medium", l.optional && "text-muted-foreground")}>{l.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {categoryLabel(l.category)}
                      {l.quantity > 1 ? ` · qty ${l.quantity}` : ""}
                      {l.optional ? " · Optional, not included in the total" : ""}
                    </p>
                  </div>
                  <p className={cn("tw-num shrink-0 font-medium", l.optional && "text-muted-foreground")}>{money(l.totalMinor, view.currency)}</p>
                </li>
              ))}
              {view.lineItems.length === 0 ? <li className="px-4 py-4 text-sm text-muted-foreground">Itemised pricing is not available for this proposal.</li> : null}
            </ul>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 border-t border-border bg-muted/40 px-4 py-4 text-sm">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tw-num text-right">{money(view.totals.subtotalMinor, view.currency)}</dd>
              {view.totals.discountMinor > 0 ? (
                <>
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="tw-num text-right text-success">−{money(view.totals.discountMinor, view.currency)}</dd>
                </>
              ) : null}
              {view.totals.taxMinor > 0 ? (
                <>
                  <dt className="text-muted-foreground">Taxes</dt>
                  <dd className="tw-num text-right">{money(view.totals.taxMinor, view.currency)}</dd>
                </>
              ) : null}
              <dt className="border-t border-border pt-2 text-base font-semibold">Total payable</dt>
              <dd className="tw-num border-t border-border pt-2 text-right font-display text-xl font-semibold text-primary">{money(view.totals.totalPayableMinor, view.currency)}</dd>
            </dl>
          </div>
        </section>

        {view.inclusions.length > 0 || view.exclusions.length > 0 ? (
          <section aria-labelledby="pp-incl" className="grid gap-4 sm:grid-cols-2">
            <h2 id="pp-incl" className="sr-only">Inclusions and exclusions</h2>
            {view.inclusions.length > 0 ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-2 text-base font-semibold">Included</h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {view.inclusions.map((x, i) => (
                    <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> <span>{x}</span></li>
                  ))}
                </ul>
              </div>
            ) : null}
            {view.exclusions.length > 0 ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-2 text-base font-semibold">Not included</h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {view.exclusions.map((x, i) => (
                    <li key={i} className="flex gap-2"><XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> <span>{x}</span></li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {view.clientNotes ? (
          <section aria-labelledby="pp-notes">
            <SectionTitle id="pp-notes">A note from {orgName}</SectionTitle>
            <p className="whitespace-pre-wrap rounded-xl border border-border bg-accent-soft p-4 text-sm">{view.clientNotes}</p>
          </section>
        ) : null}

        {view.terms ? (
          <section aria-labelledby="pp-terms">
            <SectionTitle id="pp-terms">Terms and conditions</SectionTitle>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{view.terms}</p>
          </section>
        ) : null}

        <div className="no-print flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/api/v1/public/quotes/${encodeURIComponent(token)}/pdf`} target="_blank" rel="noopener noreferrer">
              <Download /> Download PDF
            </a>
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>

        <section aria-labelledby="pp-respond" className="no-print">
          <SectionTitle id="pp-respond">Your decision</SectionTitle>
          {responded ? (
            <ResponseConfirmation decision={responded} orgName={orgName} />
          ) : data.canRespond && !alreadyDecided ? (
            <RespondForm token={token} orgName={orgName} onDone={setResponded} />
          ) : (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
              {alreadyDecided
                ? "A response has already been recorded for this proposal."
                : revised
                  ? "This version can no longer be accepted. Please ask for the latest link."
                  : expired
                    ? "This proposal has expired and can no longer be accepted online."
                    : "This proposal can't be accepted online right now."}{" "}
              {b.contactEmail || b.contactPhone ? "Please contact us using the details below." : ""}
            </p>
          )}
        </section>

        <footer className="border-t border-border pt-6 text-sm">
          <p className="font-display text-base font-semibold">{orgName}</p>
          {contacts.length > 0 || b.address ? (
            <ul className="mt-2 flex flex-col gap-1.5 text-muted-foreground">
              {contacts.map((c) => (
                <li key={c.href} className="flex items-center gap-2">
                  <c.icon className="size-4 shrink-0" aria-hidden />
                  <a className="underline-offset-2 hover:underline" href={c.href} {...(c.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    {c.label}
                  </a>
                </li>
              ))}
              {b.address ? (
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="whitespace-pre-line">{b.address}</span>
                </li>
              ) : null}
            </ul>
          ) : null}
          {b.quoteFooter ? <p className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">{b.quoteFooter}</p> : null}
          <p className="mt-4 text-xs text-muted-foreground">Issued {formatDate(view.issuedAt)} · {view.quoteNumber}{view.version > 1 ? ` v${view.version}` : ""}</p>
        </footer>
      </main>
    </Shell>
  );
}

function ResponseConfirmation({ decision, orgName }: { decision: "accept" | "reject"; orgName: string }) {
  return (
    <div role="status" className={cn("rounded-xl border p-5", decision === "accept" ? "border-success/30 bg-success-soft" : "border-border bg-card")}>
      <p className="flex items-center gap-2 font-display text-xl font-semibold">
        {decision === "accept" ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : <XCircle className="size-5 text-muted-foreground" aria-hidden />}
        {decision === "accept" ? "Thank you, your acceptance is recorded" : "Your response is recorded"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {decision === "accept"
          ? `${orgName} has been notified and will be in touch shortly to confirm the next steps. Nothing is booked until you receive written confirmation.`
          : `${orgName} has been notified that you've declined this proposal. If you change your mind or would like adjustments, simply get in touch.`}
      </p>
    </div>
  );
}

function RespondForm({ token, orgName, onDone }: { token: string; orgName: string; onDone: (d: "accept" | "reject") => void }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<"accept" | "reject" | null>(null);

  const m = useMutation({
    mutationFn: (body: { decision: "accept" | "reject"; acceptedByName: string; acceptedByEmail: string; comment?: string }) => apiPost(`/public/quotes/${encodeURIComponent(token)}/respond`, body),
    onSuccess: (_r, v) => onDone(v.decision),
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      setMessage(errorMessage(e));
    },
  });

  const submit = (decision: "accept" | "reject") => {
    setMessage(null);
    const body = { decision, acceptedByName: name.trim(), acceptedByEmail: email.trim(), comment: comment.trim() || undefined };
    const parsed = quoteAcceptSchema.safeParse(body);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.path[0] === "acceptedByName" ? "Please enter your full name." : i.path[0] === "acceptedByEmail" ? "Please enter a valid email address." : i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setPending(decision);
    m.mutate(body, { onSettled: () => setPending(null) });
  };

  return (
    <form
      noValidate
      onSubmit={(e) => e.preventDefault()}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-describedby="pp-respond-help"
    >
      <p id="pp-respond-help" className="text-sm text-muted-foreground">
        To respond, enter your details below. Accepting lets {orgName} know you&apos;d like to go ahead; it isn&apos;t a payment and nothing is booked until they confirm in writing.
      </p>
      {message ? <Alert tone="danger">{message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your full name" htmlFor="pp-name" error={errors.acceptedByName} required>
          <Input id="pp-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.acceptedByName} maxLength={120} />
        </Field>
        <Field label="Email address" htmlFor="pp-email" error={errors.acceptedByEmail} required>
          <Input id="pp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.acceptedByEmail} maxLength={254} />
        </Field>
      </div>
      <Field label="Comment (optional)" htmlFor="pp-comment" error={errors.comment} hint="Questions, requested changes or a reason for declining.">
        <Textarea id="pp-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" size="lg" loading={pending === "reject"} disabled={pending !== null} onClick={() => submit("reject")}>
          Decline proposal
        </Button>
        <Button variant="accent" size="lg" loading={pending === "accept"} disabled={pending !== null} onClick={() => submit("accept")}>
          Accept proposal
        </Button>
      </div>
    </form>
  );
}
