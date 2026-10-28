"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarDays, Check, Loader2, MapPin, Sparkles, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { HOTEL_CATEGORIES, TRAVELER_PACE_LABELS, TRAVELER_PACES, type TravelerPace } from "@tripweave/shared";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { TagInput } from "@/features/trips/tag-input";
import { apiPost, apiPut, errorMessage } from "@/lib/api";
import { cn, titleCase } from "@/lib/utils";
import { createTripFromWizard, type WizardApi, type WizardStage } from "./lib";

const DESTINATION_SUGGESTIONS = ["Kandy", "Ella", "Galle", "Nuwara Eliya", "Sigiriya", "Mirissa", "Colombo", "Dambulla", "Anuradhapura", "Yala"];
const INTEREST_SUGGESTIONS = ["food", "hiking", "beaches", "temples", "wildlife", "trains", "museums", "markets", "photography", "diving", "tea", "slow mornings"];

const STAGES: { key: WizardStage; label: string }[] = [
  { key: "creating", label: "Creating the trip" },
  { key: "parsing", label: "Reading your idea" },
  { key: "routing", label: "Drafting the route" },
  { key: "opening", label: "Opening your trip" },
];

const api: WizardApi = {
  post: (path, body) => apiPost(path, body),
  put: (path, body) => apiPut(path, body),
};

export function TripWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const welcome = params.get("welcome") === "1";
  const initialDestination = params.get("destination")?.trim() ?? "";
  const initialIdea = params.get("idea")?.trim() ?? "";
  const [title, setTitle] = React.useState(initialDestination ? `${initialDestination} trip` : "");
  const [idea, setIdea] = React.useState(initialIdea);
  const [destinations, setDestinations] = React.useState<string[]>(initialDestination ? [initialDestination] : []);
  const [arrivalDate, setArrivalDate] = React.useState("");
  const [departureDate, setDepartureDate] = React.useState("");
  const [adults, setAdults] = React.useState(2);
  const [children, setChildren] = React.useState(0);
  const [childAges, setChildAges] = React.useState<string[]>([]);
  const [budgetMinor, setBudgetMinor] = React.useState<number | null>(null);
  const [currency, setCurrency] = React.useState("USD");
  const [category, setCategory] = React.useState("");
  const [pace, setPace] = React.useState<TravelerPace>("balanced");
  const [interests, setInterests] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [topError, setTopError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [stage, setStage] = React.useState<WizardStage>("creating");

  const setChildCount = (count: number) => {
    setChildren(count);
    setChildAges((current) => Array.from({ length: count }, (_, index) => current[index] ?? ""));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!arrivalDate) nextErrors.arrivalDate = "Choose an arrival date.";
    if (!departureDate) nextErrors.departureDate = "Choose a departure date.";
    if (arrivalDate && departureDate && departureDate <= arrivalDate) nextErrors.departureDate = "Departure must be after arrival.";
    if (!Number.isFinite(adults) || adults < 1) nextErrors.adults = "At least one adult.";
    const ageNumbers = childAges.slice(0, children).map((age) => Number(age));
    if (children > 0 && (ageNumbers.length !== children || ageNumbers.some((age) => !Number.isInteger(age) || age < 0 || age > 17))) {
      nextErrors.childAges = "Add an age (0–17) for every child.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    const resolvedTitle = title.trim() || (destinations[0] ? `${destinations[0]} trip` : idea.trim().slice(0, 60) || "My trip");
    setBusy(true);
    setTopError(null);
    setStage("creating");
    try {
      const result = await createTripFromWizard({
        title: resolvedTitle,
        idea,
        destinations,
        arrivalDate,
        departureDate,
        adults,
        children,
        childAges: ageNumbers,
        budgetMinor,
        budgetCurrency: currency,
        category: category || null,
        pace,
        interests,
      }, api, setStage);
      if (result.warnings.length > 0) toast.info(result.warnings[0]!);
      router.replace(`/travel/trips/${result.tripId}?created=1`);
    } catch (error) {
      setTopError(errorMessage(error));
      setBusy(false);
    }
  };

  const nights = React.useMemo(() => {
    if (!arrivalDate || !departureDate) return null;
    const start = Date.parse(`${arrivalDate}T00:00:00Z`);
    const end = Date.parse(`${departureDate}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return Math.round((end - start) / 86_400_000);
  }, [arrivalDate, departureDate]);

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start" noValidate>
      <div className="flex flex-col gap-6">
        <header>
          <p className="tw-travel-eyebrow">{welcome ? "Your first trip" : "New trip"}</p>
          <h1 className="tw-travel-display mt-2 max-w-[16ch] text-5xl leading-none tracking-[-0.045em] md:text-6xl">Tell us the shape of it.</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">A sentence is enough. We will keep the details editable and never pretend a price or a room is confirmed.</p>
        </header>

        {topError ? <Alert tone="danger" title="The trip could not be created">{topError}</Alert> : null}

        <section className="tw-travel-card flex flex-col gap-5 p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent"><Sparkles className="size-4" /></span>
            <div>
              <h2 className="text-base font-semibold">Start with the idea</h2>
              <p className="text-xs text-muted-foreground">Dates, people, a place, a feeling — whatever you already know.</p>
            </div>
          </div>
          <Field label="The trip in your head" htmlFor="trip-idea" hint="Optional, but it helps the planner draft a route.">
            <Textarea id="trip-idea" rows={4} maxLength={8_000} value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="Ten days in Sri Lanka in December. Two of us, tea country and trains, a couple of quiet beach days, comfortable guesthouses, not too much driving." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trip title" htmlFor="trip-title" error={errors.title} hint="Optional; we will make one from the first place.">
              <Input id="trip-title" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Hill country and the coast" />
            </Field>
            <Field label="Who is going" htmlFor="trip-party" error={errors.adults}>
              <div className="grid grid-cols-2 gap-2">
                <Input id="trip-adults" type="number" min={1} max={60} value={adults} onChange={(event) => setAdults(Math.max(1, Math.min(60, Number(event.target.value) || 1)))} aria-label="Adults" />
                <Input id="trip-children" type="number" min={0} max={40} value={children} onChange={(event) => setChildCount(Math.max(0, Math.min(40, Number(event.target.value) || 0)))} aria-label="Children" />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Adults · children</p>
            </Field>
          </div>
          {children > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {childAges.slice(0, children).map((age, index) => (
                <Field key={index} label={`Child ${index + 1} age`} htmlFor={`child-age-${index}`} error={errors.childAges && index === 0 ? errors.childAges : undefined}>
                  <Input id={`child-age-${index}`} inputMode="numeric" maxLength={2} value={age} onChange={(event) => setChildAges((current) => current.map((value, i) => (i === index ? event.target.value : value)))} placeholder="0–17" />
                </Field>
              ))}
            </div>
          ) : null}
        </section>

        <section className="tw-travel-card flex flex-col gap-5 p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent"><CalendarDays className="size-4" /></span>
            <div>
              <h2 className="text-base font-semibold">When and where</h2>
              <p className="text-xs text-muted-foreground">Dates can change later. Places can be reordered in the itinerary.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Arrival" htmlFor="trip-arrival" error={errors.arrivalDate} required>
              <Input id="trip-arrival" type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} />
            </Field>
            <Field label="Departure" htmlFor="trip-departure" error={errors.departureDate} required>
              <Input id="trip-departure" type="date" min={arrivalDate || undefined} value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} />
            </Field>
          </div>
          <TagInput id="trip-destinations" label="Places you have in mind" value={destinations} onChange={setDestinations} placeholder="e.g. Kandy" suggestions={DESTINATION_SUGGESTIONS} maxLength={80} />
          <p className="text-[11px] text-muted-foreground">We will suggest an overnight split if you do not give one. You confirm it before it becomes final.</p>
        </section>

        <section className="tw-travel-card flex flex-col gap-5 p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent"><Wallet className="size-4" /></span>
            <div>
              <h2 className="text-base font-semibold">Budget and style</h2>
              <p className="text-xs text-muted-foreground">A rough whole-trip budget is enough. Stay prices are shown separately and always labelled.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trip budget" htmlFor="trip-budget" hint="Optional">
              <MoneyInput id="trip-budget" valueMinor={budgetMinor} onMinorChange={setBudgetMinor} currency={currency} />
            </Field>
            <Field label="Currency" htmlFor="trip-currency">
              <Select id="trip-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {["USD", "EUR", "GBP", "LKR"].map((value) => <option key={value}>{value}</option>)}
              </Select>
            </Field>
            <Field label="Stay style" htmlFor="trip-category">
              <Select id="trip-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">No preference</option>
                {HOTEL_CATEGORIES.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
              </Select>
            </Field>
            <Field label="Pace" htmlFor="trip-pace">
              <Select id="trip-pace" value={pace} onChange={(event) => setPace(event.target.value as TravelerPace)}>
                {TRAVELER_PACES.map((value) => <option key={value} value={value}>{TRAVELER_PACE_LABELS[value]}</option>)}
              </Select>
            </Field>
          </div>
          <TagInput id="trip-interests" label="What you enjoy" value={interests} onChange={setInterests} placeholder="e.g. food, trains" suggestions={INTEREST_SUGGESTIONS} maxLength={60} />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" loading={busy} disabled={busy}>Create the trip <ArrowRight className="size-4" /></Button>
          <Button asChild type="button" variant="ghost"><Link href="/travel/trips">Cancel</Link></Button>
        </div>
        {busy ? (
          <ol className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm" aria-live="polite">
            {STAGES.map((item) => {
              const current = STAGES.findIndex((entry) => entry.key === stage);
              const index = STAGES.findIndex((entry) => entry.key === item.key);
              const done = index < current;
              const active = index === current;
              return (
                <li key={item.key} className={cn("flex items-center gap-2", done ? "text-success" : active ? "text-foreground" : "text-muted-foreground/50")}>
                  {done ? <Check className="size-4" /> : active ? <Loader2 className="size-4 animate-spin" /> : <span className="size-4 rounded-full border border-current/30" />}
                  {item.label}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>

      <aside className="tw-travel-card sticky top-24 flex flex-col gap-4 p-5">
        <p className="tw-travel-eyebrow">The shape so far</p>
        <div className="flex items-start gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent"><MapPin className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold">{destinations.length > 0 ? destinations.join(" · ") : "Places not set yet"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{arrivalDate && departureDate ? `${arrivalDate} → ${departureDate}${nights ? ` · ${nights} night${nights === 1 ? "" : "s"}` : ""}` : "Dates not set yet"}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent"><Users className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold">{adults + children} traveller{adults + children === 1 ? "" : "s"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{adults} adult{adults === 1 ? "" : "s"}{children ? `, ${children} child${children === 1 ? "" : "ren"}` : ""}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent"><Wallet className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold">{budgetMinor === null ? "No budget yet" : `${(budgetMinor / 100).toLocaleString(undefined, { style: "currency", currency })}`}</p>
            <p className="mt-1 text-xs text-muted-foreground">{category ? `${titleCase(category)} stays` : "Stay style open"} · {TRAVELER_PACE_LABELS[pace]}</p>
          </div>
        </div>
        <div className="rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          After this you can open the AI planner, edit the day-by-day route, look at stay ideas, set a budget and share the trip.
        </div>
      </aside>
    </form>
  );
}
