"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BedDouble, CalendarDays, Check, ClipboardList, CornerDownLeft, HelpCircle, Hotel, MapPin, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import { parseTripSchema, type ParsedTrip } from "@tripweave/shared";
import { Alert, Card, CardContent, CardHeader, CardTitle, CardDescription, LoadingBlock, Spinner } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { CustomerPicker } from "@/features/customers/customer-picker";
import { ApiError, apiPatch, apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { cn, formatDate } from "@/lib/utils";
import { defaultTripForm, RequirementsGlance, TripFormFields, validateTripForm, type TripFormState } from "@/features/trips/trip-form";
import { tripKeys } from "@/features/trips/hooks";
import type { ParseResponse, Trip } from "@/features/trips/types";

const ENQUIRY_MAX = 8000;
const EXAMPLE_ENQUIRY =
  "Hi! We're a family of 4 (kids 8 and 11) planning 10 nights in Sri Lanka from 5 March 2027. We'd love to see Kandy, Ella and the south coast. Our hotel budget is around USD 4,000 and we'd like breakfast included. A pool would be great for the kids.";

/** What the extraction reads, shown beside the enquiry so the user knows what to include. */
const EXTRACTS = [
  { icon: CalendarDays, title: "Dates and length", text: "Arrival, departure or a start date plus nights." },
  { icon: BedDouble, title: "Guests and rooms", text: "Adults, children and their ages." },
  { icon: MapPin, title: "Places and stays", text: "Destinations become a draft itinerary you confirm." },
  { icon: Wallet, title: "Budget", text: "Amount, currency and whether it covers hotels only." },
  { icon: Hotel, title: "Hotel wishes", text: "Category, meal plan, amenities and accessibility." },
] as const;

type Stage = "creating" | "reading" | "opening";
const STAGES: { id: Stage; label: string }[] = [
  { id: "creating", label: "Creating the trip request" },
  { id: "reading", label: "Reading the enquiry" },
  { id: "opening", label: "Opening the trip" },
];

/** A readable trip title from what the enquiry states, e.g. "Kandy, Ella & Galle · Mar 2027". */
function titleFromParsed(p: ParsedTrip): string | null {
  const places = [...new Set((p.overnightStops.length ? p.overnightStops.map((s) => s.destination) : p.destinations).map((d) => d.trim()).filter(Boolean))].slice(0, 3);
  if (!places.length) return null;
  const list = places.length === 1 ? places[0] : `${places.slice(0, -1).join(", ")} & ${places[places.length - 1]}`;
  const when = p.arrivalDate ? formatDate(p.arrivalDate, { month: "short", year: "numeric" }) : null;
  return [list, when].filter(Boolean).join(" · ").slice(0, 200);
}

function useElapsedSeconds(running: boolean) {
  const [s, setS] = React.useState(0);
  React.useEffect(() => {
    if (!running) return setS(0);
    const start = Date.now();
    const t = setInterval(() => setS(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [running]);
  return s;
}

function ExtractionProgress({ stage, seconds }: { stage: Stage; seconds: number }) {
  const at = STAGES.findIndex((s) => s.id === stage);
  return (
    <div className="tw-surface flex flex-col gap-4 rounded-2xl border border-accent/40 p-5 shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_8%,transparent)]" role="status" aria-live="polite">
      <div>
        <p className="tw-kicker">Working on it</p>
        <p className="tw-trip-display mt-1.5 text-[1.35rem] leading-tight">Turning the enquiry into a brief</p>
      </div>
      <ol className="flex flex-col gap-3">
        {STAGES.map((s, i) => (
          <li key={s.id} className={cn("flex items-center gap-2.5 text-[13px]", i > at && "text-muted-foreground")}>
            <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold", i < at ? "border-success bg-success text-white" : i === at ? "border-accent text-accent" : "border-border")}>
              {i < at ? <Check className="size-3" /> : i === at ? <Spinner className="size-3" /> : i + 1}
            </span>
            <span className="min-w-0 flex-1">{s.label}</span>
            {i === at && s.id === "reading" ? <span className="tw-num text-xs text-muted-foreground">{seconds}s</span> : null}
          </li>
        ))}
      </ol>
      <p className="border-t border-border pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
        {stage === "reading" && seconds >= 8 ? "Longer enquiries take a little more time. Usually under 30 seconds." : "Keep this tab open. You will land on the trip when it is ready."}
      </p>
    </div>
  );
}

function NewTripInner() {
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const sp = useSearchParams();
  const [mode, setMode] = React.useState<"enquiry" | "form">("enquiry");
  const [form, setForm] = React.useState<TripFormState>(() => defaultTripForm({ customerId: sp.get("customerId") ?? "" }));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [topError, setTopError] = React.useState<string | null>(null);
  const [enquiry, setEnquiry] = React.useState("");
  const [enquiryError, setEnquiryError] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<Stage>("creating");
  const enquiryRef = React.useRef<HTMLTextAreaElement>(null);

  const afterCreate = (id: string) => {
    qc.invalidateQueries({ queryKey: tripKeys.all });
    router.push(`/trips/${id}`);
  };

  const create = useMutation({
    mutationFn: (payload: unknown) => apiPost<Trip>("/trips", payload),
    onSuccess: (trip) => {
      toast.success("Trip request created");
      afterCreate(trip.id);
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors((prev) => ({ ...prev, ...e.fieldErrors }));
      setTopError(errorMessage(e));
    },
  });

  const fromEnquiry = useMutation({
    mutationFn: async () => {
      const text = enquiry.trim();
      const ownTitle = form.title.trim().length >= 2 ? form.title.trim() : null;
      setStage("creating");
      const trip = await apiPost<Trip>("/trips", { title: ownTitle ?? `New enquiry ${formatDate(new Date().toISOString().slice(0, 10))}`, description: text, customerId: form.customerId || null });
      setStage("reading");
      try {
        const parsed = await apiPost<ParseResponse>(`/trips/${trip.id}/parse`, { text, apply: true });
        setStage("opening");
        // The placeholder title says nothing about the trip; name it from what the enquiry states.
        const derived = ownTitle ? null : titleFromParsed(parsed.parsed);
        if (derived) await apiPatch<Trip>(`/trips/${trip.id}`, { title: derived }).catch(() => undefined);
        return { trip, parsed, parseError: null as string | null };
      } catch (e) {
        return { trip, parsed: null, parseError: errorMessage(e) };
      }
    },
    onSuccess: ({ trip, parsed, parseError }) => {
      if (parseError) toast.error(`Trip created, but requirements could not be extracted: ${parseError}`);
      else {
        const open = parsed!.questions.length;
        toast.success(`Requirements extracted with ${parsed!.engine === "rules" ? "the rules engine" : "AI"}.${open ? ` ${open} question${open === 1 ? "" : "s"} to check.` : " Review them on the trip."}`);
      }
      afterCreate(trip.id);
    },
    onError: (e) => setEnquiryError(errorMessage(e)),
  });

  const busy = fromEnquiry.isPending || create.isPending;
  const seconds = useElapsedSeconds(fromEnquiry.isPending);

  const submitEnquiry = () => {
    if (busy) return;
    setEnquiryError(null);
    const r = parseTripSchema.safeParse({ text: enquiry, apply: true });
    if (!r.success) {
      setEnquiryError(enquiry.trim().length < 10 ? "Paste the customer's message first: at least 10 characters so there is something to read." : (r.error.issues[0]?.message ?? "Invalid enquiry"));
      enquiryRef.current?.focus();
      return;
    }
    fromEnquiry.mutate();
  };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setTopError(null);
    const r = validateTripForm(form);
    if (!r.ok) {
      setErrors(r.errors);
      setTopError("Some fields need attention. Fix the highlighted fields and try again.");
      return;
    }
    setErrors({});
    create.mutate(r.payload);
  };

  const switchMode = (next: string) => {
    if (busy) return;
    // Carry a pasted enquiry into the form's notes so switching never loses it.
    if (next === "form" && enquiry.trim() && !form.description.trim()) setForm((f) => ({ ...f, description: enquiry.trim() }));
    setMode(next as "enquiry" | "form");
  };

  if (!can("trips:write")) {
    return <Alert tone="warning" title="You do not have permission to create trip requests">Ask an administrator for the trips:write permission.</Alert>;
  }

  return (
    <div className="tw-trip p-3 sm:p-5 lg:p-7">
      <header className="mb-7 flex flex-col gap-3 border-b border-border pb-7">
        <p className="tw-kicker">Start a trip</p>
        <h1 className="tw-trip-display text-[2.6rem] leading-[0.95] md:text-[3.4rem]">New trip request</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Paste the customer&apos;s message and TripWeave turns it into a brief, or fill in the requirements yourself. Nothing is final until you confirm the itinerary.</p>
      </header>

      <Tabs value={mode} onValueChange={switchMode}>
        <TabsList aria-label="How to start" className="grid w-full grid-cols-1 gap-2 rounded-2xl border-0 bg-transparent p-0 sm:grid-cols-2 md:max-w-2xl">
          {[
            { value: "enquiry", icon: Sparkles, title: "From an enquiry", text: "Paste an email or chat, we extract the details" },
            { value: "form", icon: ClipboardList, title: "Fill in the form", text: "Enter the requirements yourself" },
          ].map(({ value, icon: Icon, title, text }) => (
            <TabsTrigger
              key={value}
              value={value}
              disabled={busy && mode !== value}
              className="flex items-start gap-3 whitespace-normal rounded-2xl border border-border bg-card px-4 py-3 text-left text-foreground data-[state=active]:border-accent data-[state=active]:bg-accent-soft data-[state=active]:text-foreground disabled:opacity-50"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs font-normal text-muted-foreground">{text}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="enquiry" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>The customer&apos;s message</CardTitle>
              <CardDescription>The extraction never invents details. Anything unclear becomes a question for you, and you can edit every value afterwards.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {enquiryError ? <Alert tone="danger">{enquiryError}</Alert> : null}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-end justify-between gap-3">
                  <label htmlFor="enquiry" className="text-xs font-medium text-muted-foreground">
                    Enquiry <span className="text-destructive">*</span>
                  </label>
                  {!enquiry.trim() ? (
                    <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => setEnquiry(EXAMPLE_ENQUIRY)} disabled={busy}>
                      Try an example
                    </Button>
                  ) : null}
                </div>
                <Textarea
                  id="enquiry"
                  ref={enquiryRef}
                  rows={9}
                  value={enquiry}
                  maxLength={ENQUIRY_MAX}
                  disabled={busy}
                  aria-invalid={!!enquiryError}
                  aria-describedby="enquiry-hint"
                  placeholder="Paste the email, WhatsApp or web-form message here…"
                  className="resize-y text-[15px] leading-relaxed"
                  onChange={(e) => {
                    setEnquiry(e.target.value);
                    if (enquiryError) setEnquiryError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      submitEnquiry();
                    }
                  }}
                />
                <div id="enquiry-hint" className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="hidden items-center gap-1 sm:inline-flex">
                    <kbd className="rounded border border-border bg-muted px-1 font-sans text-[10px]">⌘</kbd>
                    <CornerDownLeft className="size-3" aria-hidden /> to extract
                  </span>
                  <span className={cn("tw-num ml-auto", enquiry.length > ENQUIRY_MAX * 0.9 && "text-warning")}>
                    {enquiry.length.toLocaleString()} / {ENQUIRY_MAX.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Trip title" htmlFor="enq-title" hint="Optional. Left blank, it is named from the enquiry.">
                  <Input id="enq-title" value={form.title} maxLength={200} disabled={busy} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Anderson family – Sri Lanka" />
                </Field>
                <Field label="Customer" htmlFor="enq-customer" hint="Optional. You can link one later.">
                  <CustomerPicker id="enq-customer" value={form.customerId} onChange={(id) => setForm({ ...form, customerId: id })} />
                </Field>
              </div>
            </CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
              <p className="text-xs text-muted-foreground">Creates the trip, then fills in its requirements.</p>
              <Button variant="accent" onClick={submitEnquiry} loading={fromEnquiry.isPending} disabled={create.isPending} className="w-full sm:w-auto">
                {fromEnquiry.isPending ? (
                  <>
                    {STAGES.find((s) => s.id === stage)?.label}…{stage === "reading" ? <span className="tw-num opacity-70">{seconds}s</span> : null}
                  </>
                ) : (
                  <>
                    <Sparkles /> Create trip and extract requirements
                  </>
                )}
              </Button>
            </div>
          </Card>

          <aside aria-label="What TripWeave reads" className="lg:sticky lg:top-20 lg:self-start">
            {fromEnquiry.isPending ? (
              <ExtractionProgress stage={stage} seconds={seconds} />
            ) : (
              <div className="tw-surface flex flex-col gap-4 rounded-2xl border border-border p-5">
                <div>
                  <p className="tw-kicker">What it picks up</p>
                  <p className="tw-trip-display mt-1.5 text-[1.35rem] leading-tight">The more the message says, the less you type</p>
                </div>
                <ul className="flex flex-col gap-3">
                  {EXTRACTS.map(({ icon: Icon, title, text }) => (
                    <li key={title} className="flex items-start gap-2.5 text-[13px] leading-snug">
                      <Icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      <span className="min-w-0">
                        <span className="block font-medium">{title}</span>
                        <span className="block text-muted-foreground">{text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="flex items-start gap-2 border-t border-border pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
                  <HelpCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Missing or vague details are listed as questions on the trip, never guessed.
                </p>
              </div>
            )}
          </aside>
        </TabsContent>

        <TabsContent value="form" className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <RequirementsGlance form={form} note="Only the trip title is required. Everything else can be filled in later from the trip's Requirements tab." />
          <form onSubmit={submitForm} noValidate className="flex min-w-0 flex-col gap-6">
            {topError ? <Alert tone="danger">{topError}</Alert> : null}
            <TripFormFields value={form} onChange={setForm} errors={errors} />
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-[0_18px_40px_-24px_rgba(40,32,20,0.55)] backdrop-blur">
              <p className="text-xs text-muted-foreground">You can change every requirement after creating the trip.</p>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link href="/trips">Cancel</Link>
                </Button>
                <Button type="submit" loading={create.isPending} disabled={fromEnquiry.isPending}>
                  Create trip request
                </Button>
              </div>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function NewTripPage() {
  return (
    <React.Suspense fallback={<LoadingBlock label="Loading form" />}>
      <NewTripInner />
    </React.Suspense>
  );
}
