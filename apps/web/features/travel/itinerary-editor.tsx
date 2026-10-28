"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CalendarDays, Check, Loader2, MapPin, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, Badge, ErrorState, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { TagInput } from "@/features/trips/tag-input";
import { PlaceInput } from "@/features/trips/place-input";
import { tripKeys, useItineraryView, useTrip } from "@/features/trips/hooks";
import type { ItineraryView } from "@/features/trips/types";
import { ApiError, apiPost, apiPut, errorMessage } from "@/lib/api";
import { formatDate, nightsLabel } from "@/lib/utils";

const ItineraryMap = dynamic(() => import("@/features/trips/itinerary-map"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-muted" /> });

interface StopDraft {
  key: string;
  id?: string;
  destination: string;
  latitude: number | null;
  longitude: number | null;
  arrivalDate: string;
  departureDate: string;
  activitiesText: string;
  notes: string;
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function draftsFrom(view: ItineraryView | null | undefined): StopDraft[] {
  if (!view?.itinerary) return [];
  return view.itinerary.stops.map((stop) => ({
    key: newKey(),
    id: stop.id,
    destination: stop.destination,
    latitude: stop.latitude,
    longitude: stop.longitude,
    arrivalDate: stop.arrivalDate,
    departureDate: stop.departureDate,
    activitiesText: stop.activities.join("\n"),
    notes: stop.notes ?? "",
  }));
}

function addDays(date: string, days: number): string {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) ? new Date(parsed + days * 86_400_000).toISOString().slice(0, 10) : date;
}

export function TravelItineraryEditor() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const tripQuery = useTrip(id);
  const itineraryQuery = useItineraryView(id);
  const [stops, setStops] = React.useState<StopDraft[]>([]);
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [suggesting, setSuggesting] = React.useState(false);
  const [saving, setSaving] = React.useState<"draft" | "confirm" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [issueMessages, setIssueMessages] = React.useState<string[]>([]);
  const hydrated = React.useRef<string | null>(null);

  const itinerary = itineraryQuery.data?.itinerary ?? null;
  const trip = tripQuery.data?.trip;

  React.useEffect(() => {
    const loaded = itinerary?.id ?? null;
    if (!loaded || loaded === hydrated.current) return;
    hydrated.current = loaded;
    setStops(draftsFrom(itineraryQuery.data));
    setTitle(itinerary?.title ?? "");
    setSummary(itinerary?.summary ?? "");
  }, [itinerary?.id, itinerary?.title, itinerary?.summary, itineraryQuery.data]);

  React.useEffect(() => {
    if (suggestions.length > 0 || !trip) return;
    const parsed = trip.parseResult?.parsed?.destinations ?? [];
    if (parsed.length > 0) setSuggestions(parsed.slice(0, 12));
  }, [trip, suggestions.length]);

  if (tripQuery.isLoading || itineraryQuery.isLoading) return <LoadingBlock label="Loading the route" />;
  if (tripQuery.isError || itineraryQuery.isError) return <ErrorState error={tripQuery.error ?? itineraryQuery.error} onRetry={() => { void tripQuery.refetch(); void itineraryQuery.refetch(); }} title="Could not load the itinerary" />;
  if (!trip) return null;

  const setStop = (index: number, patch: Partial<StopDraft>) => setStops((current) => current.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)));
  const move = (index: number, delta: number) => setStops((current) => {
    const next = [...current];
    const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next;
  });
  const remove = (index: number) => setStops((current) => current.filter((_, i) => i !== index));
  const add = () => {
    const last = stops.at(-1);
    const start = last?.departureDate ?? trip.arrivalDate ?? new Date().toISOString().slice(0, 10);
    setStops((current) => [...current, { key: newKey(), destination: "", latitude: null, longitude: null, arrivalDate: start, departureDate: addDays(start, 1), activitiesText: "", notes: "" }]);
  };

  const suggest = async () => {
    if (suggestions.length === 0) return;
    setSuggesting(true);
    setError(null);
    try {
      const nights = trip.arrivalDate && trip.departureDate ? Math.max(1, Math.round((Date.parse(`${trip.departureDate}T00:00:00Z`) - Date.parse(`${trip.arrivalDate}T00:00:00Z`)) / 86_400_000)) : 3;
      const result = await apiPost<{ stops: { destination: string; latitude: number | null; longitude: number | null; arrivalDate: string; departureDate: string; activities: string[]; notes?: string | null; id?: string }[]; suggestion?: { question?: string } }>(`/trips/${id}/itinerary/suggest`, { destinations: suggestions, nights, arrivalDate: trip.arrivalDate ?? undefined });
      setStops(result.stops.map((stop) => ({ key: newKey(), id: stop.id, destination: stop.destination, latitude: stop.latitude, longitude: stop.longitude, arrivalDate: stop.arrivalDate, departureDate: stop.departureDate, activitiesText: (stop.activities ?? []).join("\n"), notes: stop.notes ?? "" })));
      setTitle((current) => current || "Suggested route");
      setSummary(result.suggestion?.question ?? "");
      toast.success("Route suggested. Review it, then save or confirm.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSuggesting(false);
    }
  };

  const save = async (confirm: boolean) => {
    setError(null);
    setIssueMessages([]);
    if (stops.length === 0) {
      setError("Add at least one stop before saving.");
      return;
    }
    for (const stop of stops) {
      if (!stop.destination.trim()) {
        setError("Every stop needs a destination.");
        return;
      }
      if (!stop.arrivalDate || !stop.departureDate || stop.departureDate <= stop.arrivalDate) {
        setError("Every stop needs a departure date after its arrival.");
        return;
      }
    }
    setSaving(confirm ? "confirm" : "draft");
    try {
      const result = await apiPut<ItineraryView>(`/trips/${id}/itinerary`, {
        title: title.trim(),
        summary: summary.trim(),
        confirm,
        stops: stops.map((stop) => ({
          id: stop.id,
          destination: stop.destination.trim(),
          latitude: stop.latitude,
          longitude: stop.longitude,
          arrivalDate: stop.arrivalDate,
          departureDate: stop.departureDate,
          activities: stop.activitiesText.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 30),
          notes: stop.notes.trim() || null,
        })),
      });
      hydrated.current = result.itinerary?.id ?? hydrated.current;
      setStops(draftsFrom(result));
      setTitle(result.itinerary?.title ?? title);
      setSummary(result.itinerary?.summary ?? summary);
      qc.invalidateQueries({ queryKey: tripKeys.itinerary(id) });
      qc.invalidateQueries({ queryKey: tripKeys.detail(id) });
      toast.success(confirm ? "Route confirmed" : "Itinerary saved");
    } catch (e) {
      if (e instanceof ApiError) {
        const issues = (e.details as { issues?: { message?: string }[] } | null)?.issues ?? [];
        setIssueMessages(issues.map((issue) => issue.message ?? "").filter(Boolean).slice(0, 8));
      }
      setError(errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  const stopNights = (stop: StopDraft) => {
    const start = Date.parse(`${stop.arrivalDate}T00:00:00Z`);
    const end = Date.parse(`${stop.departureDate}T00:00:00Z`);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 86_400_000) : 0;
  };
  const totalNights = stops.reduce((sum, stop) => sum + stopNights(stop), 0);
  const mapStops = stops.filter((stop) => stop.latitude !== null && stop.longitude !== null).map((stop, index) => ({ key: stop.key, destination: stop.destination || `Stop ${index + 1}`, latitude: stop.latitude, longitude: stop.longitude }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tw-travel-eyebrow">Itinerary</p>
          <h2 className="tw-travel-display mt-2 text-4xl leading-none tracking-[-0.04em]">{itinerary ? "Shape the days." : "Build the route."}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{itinerary ? "Move stops, add activities, or change the nights. Nothing is final until you confirm." : "Pick the places you already know, or let us suggest an overnight split."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {itinerary ? <Badge tone={itinerary.status === "confirmed" ? "success" : "neutral"}>{itinerary.status}</Badge> : null}
          <Button variant="outline" onClick={add} disabled={stops.length >= 20}><Plus className="size-4" /> Add stop</Button>
        </div>
      </header>

      {error ? <Alert tone="danger" title="The itinerary was not saved">{error}{issueMessages.length > 0 ? <ul className="mt-2 list-disc pl-5 text-sm">{issueMessages.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul> : null}</Alert> : null}

      {stops.length === 0 ? (
        <section className="tw-travel-card flex flex-col gap-4 p-6 md:p-8">
          <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent"><Sparkles className="size-5" /></span>
          <h3 className="tw-travel-display text-3xl leading-none tracking-[-0.03em]">No route yet.</h3>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">Add the places you have in mind. We will suggest where to sleep based on the number of nights, and you can move or replace every stop afterwards.</p>
          <div className="max-w-xl">
            <TagInput id="suggest-destinations" label="Places" value={suggestions} onChange={setSuggestions} placeholder="e.g. Kandy" suggestions={["Kandy", "Ella", "Galle", "Nuwara Eliya", "Sigiriya", "Mirissa"]} maxLength={80} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void suggest()} loading={suggesting} disabled={suggestions.length === 0}><Wand2 className="size-4" /> Suggest a route</Button>
            <Button variant="outline" onClick={add}><Plus className="size-4" /> Start from a blank stop</Button>
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
            <div className="flex flex-col gap-4">
              <div className="tw-travel-card grid gap-4 p-4 sm:grid-cols-2">
                <Field label="Route title" htmlFor="itinerary-title"><Input id="itinerary-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="Hill country and the coast" /></Field>
                <div className="flex items-end pb-1 text-xs text-muted-foreground">{stops.length} stop{stops.length === 1 ? "" : "s"} · {nightsLabel(totalNights)}</div>
              </div>

              {stops.map((stop, index) => (
                <section key={stop.key} className="tw-travel-card flex flex-col gap-4 p-4 md:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="tw-num grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent">{index + 1}</span>
                      <span className="text-xs font-semibold text-muted-foreground">{nightsLabel(stopNights(stop))}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${stop.destination || "stop"} up`} className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === stops.length - 1} aria-label={`Move ${stop.destination || "stop"} down`} className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                      <button type="button" onClick={() => remove(index)} aria-label={`Remove ${stop.destination || "stop"}`} className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground hover:border-destructive hover:text-destructive"><Trash2 className="size-3.5" /></button>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Destination" htmlFor={`stop-${index}-destination`} required>
                      <PlaceInput
                        id={`stop-${index}-destination`}
                        value={stop.destination}
                        onTextChange={(value) => setStop(index, { destination: value, latitude: null, longitude: null })}
                        onPick={(place) => setStop(index, { destination: place.name, latitude: place.latitude, longitude: place.longitude })}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Arrive" htmlFor={`stop-${index}-arrival`} required><Input id={`stop-${index}-arrival`} type="date" value={stop.arrivalDate} onChange={(event) => setStop(index, { arrivalDate: event.target.value })} /></Field>
                      <Field label="Leave" htmlFor={`stop-${index}-departure`} required><Input id={`stop-${index}-departure`} type="date" min={stop.arrivalDate || undefined} value={stop.departureDate} onChange={(event) => setStop(index, { departureDate: event.target.value })} /></Field>
                    </div>
                  </div>
                  <Field label="Things to do" htmlFor={`stop-${index}-activities`} hint="One per line. These also help the packing list.">
                    <Textarea id={`stop-${index}-activities`} rows={3} maxLength={2_000} value={stop.activitiesText} onChange={(event) => setStop(index, { activitiesText: event.target.value })} placeholder={"Temple of the Tooth\nMarket walk"} />
                  </Field>
                  <Field label="Notes" htmlFor={`stop-${index}-notes`} hint="Optional">
                    <Input id={`stop-${index}-notes`} maxLength={1_000} value={stop.notes} onChange={(event) => setStop(index, { notes: event.target.value })} placeholder="The guesthouse with the courtyard" />
                  </Field>
                </section>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={add} disabled={stops.length >= 20}><Plus className="size-4" /> Add stop</Button>
                <Button variant="outline" onClick={() => void save(false)} loading={saving === "draft"} disabled={!!saving}><Check className="size-4" /> Save draft</Button>
                <Button onClick={() => void save(true)} loading={saving === "confirm"} disabled={!!saving}><MapPin className="size-4" /> Confirm route</Button>
              </div>
            </div>

            <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
              {mapStops.length > 0 ? (
                <div className="tw-travel-card overflow-hidden p-2">
                  <div className="h-64"><ItineraryMap stops={mapStops} compact /></div>
                  <p className="px-2 py-2 text-[11px] text-muted-foreground">A straight-line sketch of the route, not a driving route.</p>
                </div>
              ) : (
                <div className="tw-travel-card p-5 text-sm text-muted-foreground">Pick places from the suggestions to put the route on a map.</div>
              )}
              <div className="tw-travel-card p-5">
                <p className="tw-travel-eyebrow">Before you confirm</p>
                <ul className="mt-3 flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
                  <li className="flex gap-2"><CalendarDays className="mt-0.5 size-3.5 shrink-0" /> Every stop needs an arrival and a later departure.</li>
                  <li className="flex gap-2"><MapPin className="mt-0.5 size-3.5 shrink-0" /> Coordinates come from the place picker; free text still saves.</li>
                  <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0" /> Confirming unlocks stay search and tells the planner the route is settled.</li>
                </ul>
              </div>
              {itineraryQuery.data?.issues && itineraryQuery.data.issues.length > 0 ? (
                <div className="tw-travel-card p-5">
                  <p className="tw-travel-eyebrow">Checks</p>
                  <ul className="mt-3 flex flex-col gap-2 text-xs">
                    {itineraryQuery.data.issues.slice(0, 6).map((issue, index) => (
                      <li key={`${issue.code}-${index}`} className={issue.severity === "error" ? "text-destructive" : issue.severity === "warning" ? "text-warning" : "text-muted-foreground"}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
