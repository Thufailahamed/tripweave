"use client";
import * as React from "react";
import { ArrowRight, BedDouble, CalendarDays, Check, Hotel, NotebookPen, Plus, Trash2, Users, Wallet } from "lucide-react";
import { HOTEL_CATEGORIES, MEAL_PLANS, MEAL_PLAN_LABELS, tripRequestSchema, SUPPORTED_CURRENCIES, type MealPlan, type SpecialRequirements } from "@tripweave/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, IconTile } from "@/components/ui/card";
import { Field, Input, MoneyInput, Select, Switch, Textarea } from "@/components/ui/form";
import { CustomerPicker } from "@/features/customers/customer-picker";
import { cn, dateRange, money, nightsLabel, titleCase } from "@/lib/utils";
import { TagInput } from "./tag-input";
import type { Trip } from "./types";

export interface RoomState {
  adults: number;
  children: number;
  ages: string[];
}
export interface TripFormState {
  title: string;
  customerId: string;
  description: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  rooms: RoomState[];
  budgetMinor: number | null;
  budgetCurrency: string;
  budgetScope: string;
  category: string;
  mealPlan: string;
  requiredAmenities: string[];
  preferredAmenities: string[];
  accessibility: string[];
  maxLegMinutes: string;
  freeCancellation: boolean;
  other: string;
  /** Parts of specialRequirements this form does not edit; preserved on save. */
  keep: Partial<SpecialRequirements>;
}

export function defaultTripForm(over: Partial<TripFormState> = {}): TripFormState {
  return {
    title: "", customerId: "", description: "", arrivalDate: "", departureDate: "", adults: 2, children: 0, rooms: [{ adults: 2, children: 0, ages: [] }],
    budgetMinor: null, budgetCurrency: "USD", budgetScope: "accommodation_only", category: "", mealPlan: "", requiredAmenities: [], preferredAmenities: [], accessibility: [],
    maxLegMinutes: "", freeCancellation: false, other: "", keep: {}, ...over,
  };
}

export function tripToForm(t: Trip): TripFormState {
  const s = t.specialRequirements ?? {};
  return defaultTripForm({
    title: t.title, customerId: t.customerId ?? "", description: t.description, arrivalDate: t.arrivalDate ?? "", departureDate: t.departureDate ?? "",
    adults: t.party.adults, children: t.party.children,
    rooms: t.party.rooms.map((r) => ({ adults: r.adults, children: r.children, ages: Array.from({ length: r.children }, (_, i) => (r.childAges?.[i] !== undefined ? String(r.childAges[i]) : "")) })),
    budgetMinor: t.budgetAmountMinor, budgetCurrency: t.budgetCurrency, budgetScope: t.budgetScope, category: t.preferredHotelCategory ?? "", mealPlan: t.preferredMealPlan ?? "",
    requiredAmenities: s.requiredAmenities ?? [], preferredAmenities: s.preferredAmenities ?? [], accessibility: s.accessibility ?? [],
    maxLegMinutes: s.maxLegDurationMinutes ? String(s.maxLegDurationMinutes) : "", freeCancellation: !!s.requireFreeCancellation, other: s.other ?? "",
    keep: { requiredMealPlans: s.requiredMealPlans ?? [] },
  });
}

const parseAge = (a: string): number | null => (/^\d{1,2}$/.test(a.trim()) ? Number(a) : null);

/** Shapes form state into the API payload (no business logic: only structure and empty-to-null). */
export function formToPayload(f: TripFormState) {
  const roomsOut = f.rooms.map((r) => {
    const ages = r.ages.slice(0, r.children).map(parseAge);
    const complete = r.children > 0 && ages.length === r.children && ages.every((a) => a !== null);
    return { adults: r.adults, children: r.children, ...(complete ? { childAges: ages as number[] } : {}) };
  });
  const allAges = roomsOut.flatMap((r) => r.childAges ?? []);
  return {
    customerId: f.customerId || null,
    title: f.title,
    description: f.description,
    arrivalDate: f.arrivalDate || null,
    departureDate: f.departureDate || null,
    party: { adults: f.adults, children: f.children, childAges: allAges.length === f.children ? allAges : [], rooms: roomsOut },
    budgetAmountMinor: f.budgetMinor,
    budgetCurrency: f.budgetCurrency,
    budgetScope: f.budgetScope,
    preferredHotelCategory: f.category || null,
    preferredMealPlan: f.mealPlan || null,
    specialRequirements: {
      requiredAmenities: f.requiredAmenities,
      preferredAmenities: f.preferredAmenities,
      accessibility: f.accessibility,
      maxLegDurationMinutes: f.maxLegMinutes.trim() === "" ? null : Number(f.maxLegMinutes),
      requiredMealPlans: f.keep.requiredMealPlans ?? [],
      requireFreeCancellation: f.freeCancellation,
      other: f.other,
    },
  };
}

/** Validates with the shared Zod schema; returns field errors keyed by dotted path. */
export function validateTripForm(f: TripFormState): { ok: true; payload: ReturnType<typeof formToPayload> } | { ok: false; errors: Record<string, string> } {
  const payload = formToPayload(f);
  const res = tripRequestSchema.safeParse(payload);
  if (res.success) return { ok: true, payload };
  const errors: Record<string, string> = {};
  for (const i of res.error.issues) {
    const key = i.path.join(".");
    if (!(key in errors)) errors[key] = i.message;
  }
  return { ok: false, errors };
}

const intOr = (v: string, fallback: number) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

const SCOPES = [
  { value: "accommodation_only", title: "Accommodation only", text: "The budget covers hotels only. The optimiser treats it as a hard limit on the accommodation selling price." },
  { value: "all_inclusive_trip", title: "Whole trip", text: "The budget also has to cover transport, activities and guides. It cannot limit hotels on its own, so the optimiser does not apply it as a hotel cap." },
];

/** Anchors for the form's sections, so a page can link to them. */
export const TRIP_FORM_SECTIONS = [
  { id: "trip-basics", title: "Trip basics" },
  { id: "trip-guests", title: "Guests and rooms" },
  { id: "trip-budget", title: "Budget" },
  { id: "trip-hotels", title: "Hotel preferences" },
] as const;

function SectionHeader({ n, icon, title, description }: { n: number; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; title: string; description?: string }) {
  return (
    <CardHeader className="flex-row items-start gap-3">
      <span aria-hidden className="tw-num font-display pt-0.5 text-[1.5rem] leading-none text-muted-foreground/45">
        {String(n).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
      <IconTile icon={icon} tone="primary" size="sm" />
    </CardHeader>
  );
}

export function TripFormFields({ value, onChange, errors }: { value: TripFormState; onChange: (next: TripFormState) => void; errors: Record<string, string> }) {
  const set = <K extends keyof TripFormState>(k: K, v: TripFormState[K]) => onChange({ ...value, [k]: v });
  const setRoom = (i: number, patch: Partial<RoomState>) => {
    const rooms = value.rooms.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, ...patch };
      next.ages = Array.from({ length: next.children }, (_, k) => next.ages[k] ?? "");
      return next;
    });
    onChange({ ...value, rooms });
  };
  const sumA = value.rooms.reduce((s, r) => s + r.adults, 0);
  const sumC = value.rooms.reduce((s, r) => s + r.children, 0);
  const err = (k: string) => errors[k] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Card id="trip-basics" className="scroll-mt-24">
        <SectionHeader n={1} icon={NotebookPen} title="Trip basics" description="Who is travelling, when, and what they asked for." />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Trip title" htmlFor="tf-title" error={err("title")} required className="sm:col-span-2">
            <Input id="tf-title" value={value.title} onChange={(e) => set("title", e.target.value)} maxLength={200} aria-invalid={!!err("title")} placeholder="e.g. Anderson family – Sri Lanka highlights" />
          </Field>
          <Field label="Customer" htmlFor="tf-customer" error={err("customerId")} className="sm:col-span-2">
            <CustomerPicker id="tf-customer" value={value.customerId} onChange={(id) => set("customerId", id)} />
          </Field>
          <Field label="Arrival date" htmlFor="tf-arrival" error={err("arrivalDate")}>
            <Input id="tf-arrival" type="date" value={value.arrivalDate} onChange={(e) => set("arrivalDate", e.target.value)} aria-invalid={!!err("arrivalDate")} />
          </Field>
          <Field label="Departure date" htmlFor="tf-departure" error={err("departureDate")}>
            <Input id="tf-departure" type="date" value={value.departureDate} min={value.arrivalDate || undefined} onChange={(e) => set("departureDate", e.target.value)} aria-invalid={!!err("departureDate")} />
          </Field>
          <Field label="Notes / original enquiry" htmlFor="tf-desc" error={err("description")} className="sm:col-span-2">
            <Textarea id="tf-desc" rows={3} value={value.description} onChange={(e) => set("description", e.target.value)} maxLength={10000} />
          </Field>
        </CardContent>
      </Card>

      <Card id="trip-guests" className="scroll-mt-24">
        <SectionHeader n={2} icon={BedDouble} title="Guests and rooms" description="Totals must equal what you allocate across rooms. Every room needs at least one adult." />
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total adults" htmlFor="tf-adults" error={err("party.adults")}>
              <Input id="tf-adults" type="number" min={1} max={60} value={value.adults} onChange={(e) => set("adults", intOr(e.target.value, 0))} />
            </Field>
            <Field label="Total children" htmlFor="tf-children" error={err("party.children") ?? err("party.childAges")}>
              <Input id="tf-children" type="number" min={0} max={40} value={value.children} onChange={(e) => set("children", intOr(e.target.value, 0))} />
            </Field>
          </div>
          <ul className="flex flex-col gap-3">
            {value.rooms.map((r, i) => (
              <li key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Room {i + 1}</p>
                  {value.rooms.length > 1 ? (
                    <Button variant="ghost" size="sm" aria-label={`Remove room ${i + 1}`} onClick={() => onChange({ ...value, rooms: value.rooms.filter((_, k) => k !== i) })}>
                      <Trash2 /> Remove
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Adults" htmlFor={`tf-r${i}-a`} error={err(`party.rooms.${i}.adults`)}>
                    <Input id={`tf-r${i}-a`} type="number" min={1} max={10} value={r.adults} onChange={(e) => setRoom(i, { adults: intOr(e.target.value, 0) })} />
                  </Field>
                  <Field label="Children" htmlFor={`tf-r${i}-c`} error={err(`party.rooms.${i}.children`)}>
                    <Input id={`tf-r${i}-c`} type="number" min={0} max={10} value={r.children} onChange={(e) => setRoom(i, { children: Math.max(0, intOr(e.target.value, 0)) })} />
                  </Field>
                </div>
                {r.children > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {r.ages.map((age, k) => (
                      <Field key={k} label={`Child ${k + 1} age`} htmlFor={`tf-r${i}-age${k}`} error={err(`party.rooms.${i}.childAges.${k}`)}>
                        <Input id={`tf-r${i}-age${k}`} inputMode="numeric" maxLength={2} value={age} onChange={(e) => setRoom(i, { ages: r.ages.map((x, idx) => (idx === k ? e.target.value : x)) })} placeholder="0-17" />
                      </Field>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => onChange({ ...value, rooms: [...value.rooms, { adults: 1, children: 0, ages: [] }] })} disabled={value.rooms.length >= 30}>
              <Plus /> Add room
            </Button>
            <p className="tw-num text-xs text-muted-foreground" aria-live="polite">
              Rooms hold {sumA} adult{sumA === 1 ? "" : "s"} and {sumC} child{sumC === 1 ? "" : "ren"}; totals above say {value.adults} and {value.children}.
            </p>
          </div>
          {err("party.rooms") ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {err("party.rooms")}
            </p>
          ) : null}
          {err("party") ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {err("party")}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">Child ages are optional but improve pricing; give an age for every child or leave all blank.</p>
        </CardContent>
      </Card>

      <Card id="trip-budget" className="scroll-mt-24">
        <SectionHeader n={3} icon={Wallet} title="Budget" description="The optimiser treats an accommodation budget as a hard limit." />
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Budget amount" htmlFor="tf-budget" error={err("budgetAmountMinor")} hint="Leave blank if the customer has not given a budget.">
              <MoneyInput id="tf-budget" valueMinor={value.budgetMinor} onMinorChange={(v) => set("budgetMinor", v)} currency={value.budgetCurrency} invalid={!!err("budgetAmountMinor")} />
            </Field>
            <Field label="Currency" htmlFor="tf-currency" error={err("budgetCurrency")}>
              <Select id="tf-currency" value={value.budgetCurrency} onChange={(e) => set("budgetCurrency", e.target.value)}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1.5 text-xs font-medium text-muted-foreground">What does the budget cover?</legend>
            {SCOPES.map((s) => (
              <label key={s.value} className={cn("cursor-pointer rounded-lg border p-3 transition-colors focus-within:outline-2 focus-within:outline-ring", value.budgetScope === s.value ? "border-primary bg-primary-soft" : "border-input bg-card hover:bg-muted")}>
                <input type="radio" name="budget-scope" className="sr-only" checked={value.budgetScope === s.value} onChange={() => set("budgetScope", s.value)} />
                <span className="block text-sm font-semibold">{s.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{s.text}</span>
              </label>
            ))}
          </fieldset>
        </CardContent>
      </Card>

      <Card id="trip-hotels" className="scroll-mt-24">
        <SectionHeader n={4} icon={Hotel} title="Hotel preferences" description="Hard rules filter hotels out; preferences only change the score." />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred hotel category" htmlFor="tf-category" error={err("preferredHotelCategory")} hint="Guides scoring; it is a preference, not a hard rule.">
            <Select id="tf-category" value={value.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">No preference</option>
              {HOTEL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Minimum meal plan" htmlFor="tf-meal" error={err("preferredMealPlan")} hint="A hard minimum: the optimiser only accepts hotels with this meal plan or a richer one.">
            <Select id="tf-meal" value={value.mealPlan} onChange={(e) => set("mealPlan", e.target.value)}>
              <option value="">No minimum</option>
              {MEAL_PLANS.map((m) => (
                <option key={m} value={m}>
                  {MEAL_PLAN_LABELS[m]} ({m})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Required amenities" htmlFor="tf-req-am" error={err("specialRequirements.requiredAmenities")} hint="Hotels without all of these are rejected. Press Enter to add." className="sm:col-span-2">
            <TagInput id="tf-req-am" label="Required amenities" value={value.requiredAmenities} onChange={(v) => set("requiredAmenities", v)} placeholder="e.g. pool, wifi" suggestions={["pool", "wifi", "air conditioning", "spa", "parking", "lift"]} />
          </Field>
          <Field label="Preferred amenities" htmlFor="tf-pref-am" error={err("specialRequirements.preferredAmenities")} hint="Nice to have; they raise the score but never exclude a hotel." className="sm:col-span-2">
            <TagInput id="tf-pref-am" label="Preferred amenities" value={value.preferredAmenities} onChange={(v) => set("preferredAmenities", v)} placeholder="e.g. beach access" suggestions={["pool", "wifi", "spa", "gym", "restaurant", "bar"]} />
          </Field>
          <Field label="Accessibility needs" htmlFor="tf-access" error={err("specialRequirements.accessibility")} className="sm:col-span-2">
            <TagInput id="tf-access" label="Accessibility needs" value={value.accessibility} onChange={(v) => set("accessibility", v)} placeholder="e.g. step-free access" maxLength={120} />
          </Field>
          <Field label="Max drive between stops (minutes)" htmlFor="tf-leg" error={err("specialRequirements.maxLegDurationMinutes")} hint="Leave blank for no limit. 15 to 1440.">
            <Input id="tf-leg" type="number" min={15} max={1440} step={15} value={value.maxLegMinutes} onChange={(e) => set("maxLegMinutes", e.target.value)} />
          </Field>
          <div className="flex items-end pb-1">
            <Switch checked={value.freeCancellation} onCheckedChange={(v) => set("freeCancellation", v)} label="Require free cancellation" />
          </div>
          <Field label="Other requirements" htmlFor="tf-other" error={err("specialRequirements.other")} className="sm:col-span-2">
            <Textarea id="tf-other" rows={2} value={value.other} onChange={(e) => set("other", e.target.value)} maxLength={2000} />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

/** A live summary of the form beside it, with jump links to each section and a page-specific note. */
export function RequirementsGlance({ form, note }: { form: TripFormState; note?: React.ReactNode }) {
  const nights = form.arrivalDate && form.departureDate ? Math.round((Date.parse(form.departureDate) - Date.parse(form.arrivalDate)) / 86_400_000) : null;
  const done: Record<(typeof TRIP_FORM_SECTIONS)[number]["id"], boolean> = {
    "trip-basics": !!form.title.trim() && !!form.arrivalDate && !!form.departureDate,
    "trip-guests": form.adults > 0 && form.rooms.length > 0,
    "trip-budget": form.budgetMinor !== null,
    "trip-hotels": !!(form.category || form.mealPlan || form.requiredAmenities.length || form.preferredAmenities.length),
  };
  const facts = [
    { icon: CalendarDays, text: form.arrivalDate ? `${dateRange(form.arrivalDate, form.departureDate)}${nights && nights > 0 ? ` · ${nightsLabel(nights)}` : ""}` : "Dates not set" },
    { icon: Users, text: `${form.adults} adult${form.adults === 1 ? "" : "s"}${form.children ? `, ${form.children} child${form.children === 1 ? "" : "ren"}` : ""} · ${form.rooms.length} room${form.rooms.length === 1 ? "" : "s"}` },
    { icon: Wallet, text: form.budgetMinor !== null ? money(form.budgetMinor, form.budgetCurrency) : "No budget given" },
    { icon: Hotel, text: [form.category ? titleCase(form.category) : null, form.mealPlan ? (MEAL_PLAN_LABELS[form.mealPlan as MealPlan] ?? form.mealPlan) : null].filter(Boolean).join(" · ") || "No hotel preferences" },
  ];
  return (
    <aside aria-label="Requirements at a glance" className="lg:sticky lg:top-20 lg:self-start">
      <div className="tw-surface flex flex-col gap-4 rounded-2xl border border-border p-5">
        <div>
          <p className="tw-kicker">At a glance</p>
          <p className="tw-trip-display mt-1.5 text-[1.35rem] leading-tight break-words">{form.title.trim() || "Untitled trip"}</p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {facts.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2.5 text-[13px] leading-snug">
              <Icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 break-words">{text}</span>
            </li>
          ))}
        </ul>
        <nav aria-label="Requirement sections" className="flex flex-col border-t border-border pt-3">
          {TRIP_FORM_SECTIONS.map((section, index) => (
            <a key={section.id} href={`#${section.id}`} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition hover:bg-muted">
              <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold ${done[section.id] ? "border-success bg-success text-white" : "border-border text-muted-foreground"}`}>
                {done[section.id] ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{section.title}</span>
              <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" aria-hidden />
            </a>
          ))}
        </nav>
        {note ? <p className="border-t border-border pt-3 text-[11.5px] leading-relaxed text-muted-foreground">{note}</p> : null}
      </div>
    </aside>
  );
}
