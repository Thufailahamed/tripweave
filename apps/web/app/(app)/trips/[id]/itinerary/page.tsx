"use client";
import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Building2, ChevronDown, ChevronUp, Info, Plus, Route, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { OBJECTIVE_LABELS, addDays, isIsoDate, itineraryInputSchema, nightsBetween } from "@tripweave/shared";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, LoadingBlock, PageHeader, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { ApiError, apiPost, apiPut, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { cn, formatDate, mealLabel, minutesLabel, nightsLabel } from "@/lib/utils";
import { tripKeys, useItineraryView, usePackages } from "@/features/trips/hooks";
import { PlaceInput } from "@/features/trips/place-input";
import { TagInput } from "@/features/trips/tag-input";
import { routeSourceLabel, type ItineraryStop, type ItineraryIssue, type ItineraryView, type PackageView, type Trip } from "@/features/trips/types";

const ItineraryMap = dynamic(() => import("@/features/trips/itinerary-map"), { ssr: false, loading: () => <Skeleton className="h-80 w-full" /> });

interface EditStop {
  key: string;
  id?: string;
  destination: string;
  latitude: string;
  longitude: string;
  arrivalDate: string;
  departureDate: string;
  activities: string[];
  notes: string;
}

let keyCounter = 0;
const newKey = () => `s${++keyCounter}`;

const safeNights = (a: string, b: string): number | null => (isIsoDate(a) && isIsoDate(b) ? nightsBetween(a, b) : null);
const safeAdd = (d: string, n: number): string => (isIsoDate(d) ? addDays(d, n) : "");

function toEdit(s: { id?: string; destination: string; latitude: number | null; longitude: number | null; arrivalDate: string; departureDate: string; activities: string[]; notes?: string | null }): EditStop {
  return { key: newKey(), id: s.id, destination: s.destination, latitude: s.latitude === null ? "" : String(s.latitude), longitude: s.longitude === null ? "" : String(s.longitude), arrivalDate: s.arrivalDate, departureDate: s.departureDate, activities: s.activities, notes: s.notes ?? "" };
}

const num = (s: string): number | null => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));

function ISSUE_ICON(sev: ItineraryIssue["severity"]) {
  return sev === "error" ? <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> : sev === "warning" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />;
}

function IssueList({ issues, nameOf }: { issues: ItineraryIssue[]; nameOf: (stopId?: string) => string | null }) {
  const groups: { sev: ItineraryIssue["severity"]; title: string }[] = [
    { sev: "error", title: "Must fix before confirming" },
    { sev: "warning", title: "Warnings" },
    { sev: "info", title: "Notes" },
  ];
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => {
        const list = issues.filter((i) => i.severity === g.sev);
        if (list.length === 0) return null;
        return (
          <section key={g.sev} aria-label={g.title}>
            <h4 className="mb-1 text-xs font-medium text-muted-foreground">
              {g.title} ({list.length})
            </h4>
            <ul className="flex flex-col gap-1.5">
              {list.map((i, idx) => (
                <li key={`${i.code}-${idx}`} className="flex gap-2 text-sm">
                  {ISSUE_ICON(i.severity)}
                  <span>
                    {i.message}
                    {nameOf(i.stopId) ? <span className="text-xs text-muted-foreground"> ({nameOf(i.stopId)})</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function hotelFor(pkg: PackageView | undefined, s: EditStop) {
  if (!pkg) return null;
  const byId = s.id ? pkg.package.selections.find((x) => x.stopId === s.id) : undefined;
  return byId ?? pkg.package.selections.find((x) => x.destination.toLowerCase() === s.destination.toLowerCase() && x.offer.stayStart === s.arrivalDate) ?? null;
}

function ItineraryEditor({ view, tripId }: { view: ItineraryView; tripId: string }) {
  const can = useCan();
  const qc = useQueryClient();
  const sp = useSearchParams();
  const trip: Trip = view.trip;
  const itinerary = view.itinerary;
  const canWrite = can("trips:write");

  const [stops, setStops] = React.useState<EditStop[]>(() => (itinerary ? itinerary.stops.map(toEdit) : []));
  const [title, setTitle] = React.useState(itinerary?.title ?? "");
  const [dirty, setDirty] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [blocking, setBlocking] = React.useState<ItineraryIssue[]>([]);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [startDate, setStartDate] = React.useState(trip.arrivalDate ?? "");
  const [suggestDest, setSuggestDest] = React.useState("");
  const [suggestNights, setSuggestNights] = React.useState("");

  // After every save the server returns a new itinerary version; reload the editor from it.
  const loadedId = React.useRef(itinerary?.id ?? null);
  React.useEffect(() => {
    if ((itinerary?.id ?? null) !== loadedId.current) {
      loadedId.current = itinerary?.id ?? null;
      setStops(itinerary ? itinerary.stops.map(toEdit) : []);
      setTitle(itinerary?.title ?? "");
      setDirty(false);
    }
  }, [itinerary]);

  const packagesQ = usePackages(tripId);
  const pkg = packagesQ.data?.packages[0];

  const edit = (fn: (s: EditStop[]) => EditStop[]) => {
    setStops(fn);
    setDirty(true);
    setFieldErrors({});
  };
  const patchStop = (key: string, patch: Partial<EditStop>) => edit((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const addStop = () =>
    edit((s) => {
      const last = s.at(-1);
      const arrival = last?.departureDate || trip.arrivalDate || "";
      return [...s, { key: newKey(), destination: "", latitude: "", longitude: "", arrivalDate: arrival, departureDate: safeAdd(arrival, 1), activities: [], notes: "" }];
    });

  const payload = (confirm: boolean) => ({
    title: title || undefined,
    summary: itinerary?.summary || undefined,
    origin: itinerary?.origin || undefined,
    arrivalInformation: itinerary?.arrivalInformation,
    departureInformation: itinerary?.departureInformation,
    stops: stops.map((s) => ({ id: s.id, destination: s.destination.trim(), latitude: num(s.latitude), longitude: num(s.longitude), arrivalDate: s.arrivalDate, departureDate: s.departureDate, activities: s.activities, notes: s.notes.trim() === "" ? null : s.notes })),
    confirm,
  });

  const applyView = (v: ItineraryView) => {
    qc.setQueryData(tripKeys.itinerary(tripId), v);
    qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
    qc.invalidateQueries({ queryKey: tripKeys.packages(tripId) });
  };

  const save = useMutation({
    mutationFn: async (confirm: boolean) => {
      const p = payload(confirm);
      const check = itineraryInputSchema.safeParse(p);
      if (!check.success) {
        const errs: Record<string, string> = {};
        for (const i of check.error.issues) if (!(i.path.join(".") in errs)) errs[i.path.join(".")] = i.message;
        throw Object.assign(new Error("Fix the highlighted stop fields."), { local: errs });
      }
      return apiPut<ItineraryView>(`/trips/${tripId}/itinerary`, p);
    },
    onSuccess: (v, confirm) => {
      setSaveError(null);
      setBlocking([]);
      setFieldErrors({});
      setConfirming(false);
      loadedId.current = null; // force reload from the saved version
      applyView(v);
      toast.success(confirm ? "Itinerary confirmed" : "Draft saved");
    },
    onError: (e) => {
      setConfirming(false);
      const local = (e as { local?: Record<string, string> }).local;
      if (local) setFieldErrors(local);
      if (e instanceof ApiError) {
        setFieldErrors(e.fieldErrors);
        const issues = (e.details as { issues?: ItineraryIssue[] } | undefined)?.issues;
        setBlocking(Array.isArray(issues) ? issues.filter((i) => i.severity && i.message) : []);
      }
      setSaveError(errorMessage(e));
    },
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => apiPost<ItineraryView>(`/trips/${tripId}/itinerary/reorder`, { orderedIds }),
    onSuccess: (v) => {
      loadedId.current = null;
      applyView(v);
      toast.success("Order changed; dates were recalculated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const suggest = useMutation({
    mutationFn: () =>
      apiPost<{ suggestion: { plan: { destination: string; nights: number }[]; dayVisitOnly: string[]; question: string }; stops: ItineraryStop[] }>(`/trips/${tripId}/itinerary/suggest`, {
        destinations: suggestDest.split(",").map((d) => d.trim()).filter(Boolean),
        nights: suggestNights ? Number(suggestNights) : undefined,
        arrivalDate: startDate || undefined,
      }),
    onSuccess: (r) => {
      if (r.stops.length === 0) {
        toast.error("Add an arrival date so dates can be proposed.");
        return;
      }
      setStops(r.stops.map((s) => toEdit(s)));
      setDirty(true);
      toast.success("Suggested plan loaded as an unsaved draft. Review it, then save.");
      if (r.suggestion.dayVisitOnly.length) toast.message(r.suggestion.question);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const seeded = sp.get("seed") === "suggestion";
  const plan = trip.parseResult?.suggestedItinerary?.plan ?? [];
  const useSuggestedPlan = () => {
    let cursor = startDate;
    const out: EditStop[] = plan.map((p) => {
      const arrival = cursor;
      cursor = safeAdd(cursor, p.nights);
      return { key: newKey(), destination: p.destination, latitude: "", longitude: "", arrivalDate: arrival, departureDate: cursor, activities: [], notes: "" };
    });
    setStops(out);
    setDirty(true);
    toast.success("Plan loaded as an unsaved draft. Review it, then save or confirm.");
  };

  const nameOf = (stopId?: string) => (stopId ? (stops.find((s) => s.id === stopId)?.destination ?? null) : null);
  const mapStops = stops.map((s) => ({ key: s.key, destination: s.destination || "Unnamed stop", latitude: num(s.latitude), longitude: num(s.longitude) }));
  const firstArrival = stops[0]?.arrivalDate ?? "";
  const canReorder = canWrite && !dirty && stops.length > 1 && stops.every((s) => s.id) && !reorder.isPending;
  const issues = view.issues;

  const move = (i: number, dir: -1 | 1) => {
    const ids = stops.map((s) => s.id!);
    const j = i + dir;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorder.mutate(ids);
  };

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link href={`/trips/${tripId}`} className="hover:underline">
            {trip.title}
          </Link>
        }
        title="Itinerary builder"
        icon={Route}
        description="Where the guests sleep, night by night. Hotels are chosen in the next step; nothing is final until you confirm."
        actions={
          <>
            {canWrite ? (
              <>
                <Button variant="outline" onClick={() => save.mutate(false)} loading={save.isPending && save.variables === false} disabled={stops.length === 0 || (save.isPending && save.variables === true)}>
                  Save draft
                </Button>
                <Button onClick={() => setConfirming(true)} disabled={stops.length === 0 || save.isPending}>
                  Confirm itinerary
                </Button>
              </>
            ) : null}
            {itinerary?.status === "confirmed" && !dirty ? (
              <Button asChild variant="accent">
                <Link href={`/trips/${tripId}/optimise`}>
                  Next: Optimise <ArrowRight />
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {itinerary ? <Badge tone={itinerary.status === "confirmed" ? "success" : itinerary.status === "suggested" ? "warning" : "neutral"}>{itinerary.status === "confirmed" ? "Confirmed" : itinerary.status === "suggested" ? "Suggested, not confirmed" : "Draft"}</Badge> : <Badge tone="neutral">Not started</Badge>}
        {itinerary ? <span className="text-muted-foreground">Version {itinerary.version}</span> : null}
        {dirty ? <Badge tone="accent">Unsaved changes</Badge> : null}
        <span className="text-muted-foreground">
          Trip dates: <span className="tw-num">{trip.arrivalDate ? formatDate(trip.arrivalDate) : "not set"} to {trip.departureDate ? formatDate(trip.departureDate) : "not set"}</span>
        </span>
      </div>

      {itinerary?.status === "suggested" ? (
        <Alert tone="warning" title="This plan was suggested from the enquiry" className="mb-4">
          It has not been confirmed by a person. Check the stops and dates, edit what is wrong, then choose Confirm itinerary.
        </Alert>
      ) : null}
      {saveError ? (
        <Alert tone="danger" title="Could not save" className="mb-4">
          {saveError}
          {blocking.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {blocking.map((b, i) => (
                <li key={i}>{b.message}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="flex flex-col gap-4 xl:col-span-3">
          <Field label="Itinerary title" htmlFor="it-title">
            <Input id="it-title" value={title} maxLength={200} disabled={!canWrite} onChange={(e) => (setTitle(e.target.value), setDirty(true))} placeholder="e.g. Highlights loop" />
          </Field>

          {stops.length === 0 ? (
            <div className="flex flex-col gap-4">
              <EmptyState icon={Route} title="No overnight stops yet" description="Add stops one by one, load the plan suggested from the enquiry, or let TripWeave propose a split of nights across your destinations." />
              {canWrite ? (
                <>
                  {plan.length > 0 ? (
                    <Card className={cn(seeded && "border-accent")}>
                      <CardHeader>
                        <CardTitle>Plan suggested from the enquiry</CardTitle>
                        <CardDescription>{trip.parseResult?.suggestedItinerary?.question}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <ol className="flex flex-wrap gap-2 text-sm">
                          {plan.map((p, i) => (
                            <li key={i} className="rounded-full bg-muted px-3 py-1">
                              {i + 1}. {p.destination} ({nightsLabel(p.nights)})
                            </li>
                          ))}
                        </ol>
                        <Field label="First night (arrival date)" htmlFor="it-start" hint="Dates for each stop follow from this.">
                          <Input id="it-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="max-w-48" />
                        </Field>
                        <div>
                          <Button onClick={useSuggestedPlan} disabled={!startDate}>
                            Load this plan to review
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                  <Card>
                    <CardHeader>
                      <CardTitle>Suggest a split of nights</CardTitle>
                      <CardDescription>List the destinations in travel order. The suggestion is a starting point you must review.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-3">
                      <Field label="Destinations (comma separated)" htmlFor="it-dests" className="sm:col-span-3">
                        <Input id="it-dests" value={suggestDest} onChange={(e) => setSuggestDest(e.target.value)} placeholder="Kandy, Ella, Galle" />
                      </Field>
                      <Field label="Total nights" htmlFor="it-nights" hint={trip.arrivalDate && trip.departureDate ? "Blank uses the trip dates." : undefined}>
                        <Input id="it-nights" type="number" min={1} max={60} value={suggestNights} onChange={(e) => setSuggestNights(e.target.value)} />
                      </Field>
                      <Field label="Arrival date" htmlFor="it-sugg-start">
                        <Input id="it-sugg-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                      </Field>
                      <div className="flex items-end">
                        <Button variant="outline" loading={suggest.isPending} disabled={!suggestDest.trim()} onClick={() => suggest.mutate()}>
                          Suggest
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  <div>
                    <Button variant="outline" onClick={addStop}>
                      <Plus /> Add a stop manually
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <ol className="flex flex-col" aria-label="Overnight stops">
              {stops.map((s, i) => {
                const prev = stops[i - 1];
                const leg = prev?.id && s.id ? view.legs.find((l) => l.fromStopId === prev.id && l.toStopId === s.id) : undefined;
                const n = safeNights(s.arrivalDate, s.departureDate);
                const dayStart = firstArrival && safeNights(firstArrival, s.arrivalDate) !== null ? safeNights(firstArrival, s.arrivalDate)! + 1 : null;
                const hotel = hotelFor(pkg, s);
                const open = expanded[s.key];
                const errAt = (f: string) => fieldErrors[`stops.${i}.${f}`] ?? null;
                return (
                  <React.Fragment key={s.key}>
                    {i > 0 ? (
                      <li aria-hidden={!leg} className="ml-5 flex items-center gap-2 border-l-2 border-dashed border-border py-2 pl-5 text-xs text-muted-foreground">
                        {leg ? (
                          <>
                            <ArrowDown className="size-3" />
                            <span className="tw-num">
                              {leg.durationMinutes === null ? "Travel time unavailable" : `${minutesLabel(leg.durationMinutes)} drive`}
                              {leg.distanceKm !== null ? ` · ${leg.distanceKm} km` : ""}
                            </span>
                            <Badge tone={leg.source === "routing_api" ? "success" : leg.source === "estimated" ? "warning" : "danger"}>{routeSourceLabel(leg.source)}</Badge>
                            {leg.source === "estimated" ? <span>straight-line estimate, not an exact route</span> : null}
                          </>
                        ) : (
                          <span>Travel time appears here after saving.</span>
                        )}
                      </li>
                    ) : null}
                    <li>
                      <Card>
                        <CardHeader className="flex-row items-center gap-3 py-3">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-display text-base font-semibold">{s.destination || "New stop"}</h3>
                            <p className="tw-num text-xs text-muted-foreground">
                              {dayStart !== null && n !== null && n > 0 ? `Day ${dayStart}${n > 1 ? `–${dayStart + n - 1}` : ""} · ` : ""}
                              Check-in {s.arrivalDate ? formatDate(s.arrivalDate) : "—"} · Check-out {s.departureDate ? formatDate(s.departureDate) : "—"}
                              {n !== null ? ` · ${nightsLabel(n)}` : ""}
                            </p>
                          </div>
                          {canWrite ? (
                            <div className="flex shrink-0 items-center">
                              <Button size="icon" variant="ghost" aria-label={`Move ${s.destination || "stop"} up`} disabled={!canReorder || i === 0} onClick={() => move(i, -1)}>
                                <ArrowUp />
                              </Button>
                              <Button size="icon" variant="ghost" aria-label={`Move ${s.destination || "stop"} down`} disabled={!canReorder || i === stops.length - 1} onClick={() => move(i, 1)}>
                                <ArrowDown />
                              </Button>
                              <Button size="icon" variant="ghost" aria-label={`Remove ${s.destination || "stop"}`} onClick={() => edit((all) => all.filter((x) => x.key !== s.key))}>
                                <Trash2 className="text-destructive" />
                              </Button>
                            </div>
                          ) : null}
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="Destination" htmlFor={`st-${s.key}-dest`} error={errAt("destination")} required>
                              {canWrite ? (
                                <PlaceInput
                                  id={`st-${s.key}-dest`}
                                  value={s.destination}
                                  invalid={!!errAt("destination")}
                                  onTextChange={(t) => patchStop(s.key, { destination: t })}
                                  onPick={(p) => patchStop(s.key, { destination: p.name, latitude: String(p.latitude), longitude: String(p.longitude) })}
                                />
                              ) : (
                                <Input id={`st-${s.key}-dest`} value={s.destination} readOnly />
                              )}
                            </Field>
                            <Field label="Check-in" htmlFor={`st-${s.key}-in`} error={errAt("arrivalDate")} required>
                              <Input id={`st-${s.key}-in`} type="date" value={s.arrivalDate} disabled={!canWrite} onChange={(e) => patchStop(s.key, { arrivalDate: e.target.value })} aria-invalid={!!errAt("arrivalDate")} />
                            </Field>
                            <Field label="Check-out" htmlFor={`st-${s.key}-out`} error={errAt("departureDate")} required>
                              <Input id={`st-${s.key}-out`} type="date" value={s.departureDate} min={s.arrivalDate || undefined} disabled={!canWrite} onChange={(e) => patchStop(s.key, { departureDate: e.target.value })} aria-invalid={!!errAt("departureDate")} />
                            </Field>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                            <Building2 className="size-4 text-muted-foreground" aria-hidden />
                            {hotel ? (
                              <span>
                                <span className="font-semibold">{hotel.offer.property.name}</span> · {hotel.offer.roomType.name} · {mealLabel(hotel.offer.mealPlan)}
                                {pkg ? <span className="text-xs text-muted-foreground"> (from {OBJECTIVE_LABELS[pkg.objective]} package #{pkg.number}{hotel.offer.isMock ? ", illustrative data" : ""})</span> : null}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Hotel: not assigned yet</span>
                            )}
                          </div>

                          <div>
                            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" aria-expanded={!!open} onClick={() => setExpanded((e) => ({ ...e, [s.key]: !e[s.key] }))}>
                              {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />} Activities, notes and coordinates
                              {!open && (s.activities.length || s.notes || s.latitude === "" || s.longitude === "") ? <span className="font-normal text-muted-foreground">{s.latitude === "" || s.longitude === "" ? " (no coordinates)" : ""}</span> : null}
                            </button>
                            {open ? (
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <Field label="Latitude" htmlFor={`st-${s.key}-lat`} error={errAt("latitude")} hint="Filled automatically for known places. Enter manually for unlisted ones.">
                                  <Input id={`st-${s.key}-lat`} inputMode="decimal" value={s.latitude} disabled={!canWrite} onChange={(e) => patchStop(s.key, { latitude: e.target.value })} placeholder="e.g. 7.2906" />
                                </Field>
                                <Field label="Longitude" htmlFor={`st-${s.key}-lng`} error={errAt("longitude")}>
                                  <Input id={`st-${s.key}-lng`} inputMode="decimal" value={s.longitude} disabled={!canWrite} onChange={(e) => patchStop(s.key, { longitude: e.target.value })} placeholder="e.g. 80.6337" />
                                </Field>
                                <Field label="Activities" htmlFor={`st-${s.key}-act`} className="sm:col-span-2" hint="Press Enter to add each activity.">
                                  <TagInput id={`st-${s.key}-act`} label="Activities" value={s.activities} onChange={(v) => patchStop(s.key, { activities: v })} placeholder="e.g. Temple of the Tooth" maxLength={160} />
                                </Field>
                                <Field label="Notes" htmlFor={`st-${s.key}-notes`} error={errAt("notes")} className="sm:col-span-2">
                                  <Textarea id={`st-${s.key}-notes`} rows={2} maxLength={1000} value={s.notes} disabled={!canWrite} onChange={(e) => patchStop(s.key, { notes: e.target.value })} />
                                </Field>
                              </div>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  </React.Fragment>
                );
              })}
            </ol>
          )}

          {stops.length > 0 && canWrite ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={addStop} disabled={stops.length >= 20}>
                <Plus /> Add stop
              </Button>
              {dirty && stops.length > 1 ? <span className="text-xs text-muted-foreground">Save the draft to reorder stops; the server recalculates dates for the new order.</span> : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Map</CardTitle>
            </CardHeader>
            <CardContent>
              <ItineraryMap stops={mapStops} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Checks</CardTitle>
              <CardDescription>{dirty ? "Reflects the last saved version. Save a draft to refresh." : "From the saved itinerary."}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {view.warnings.map((w) => (
                <Alert key={w} tone="warning">
                  {w}
                </Alert>
              ))}
              {!itinerary ? <p className="text-sm text-muted-foreground">Save a draft to run the checks.</p> : issues.length === 0 ? <p className="text-sm text-success">No problems found.</p> : <IssueList issues={issues} nameOf={nameOf} />}
              {itinerary && view.legSource ? <p className="text-xs text-muted-foreground">Travel times source: {view.legSource === "routing_api" || view.legSource === "routing" ? "routing provider" : view.legSource === "estimated" || view.legSource === "estimate" ? "straight-line estimates (not exact)" : view.legSource}.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Confirm this itinerary?"
        description="Confirming says the overnight stops and dates above are the plan to price. The server refuses if there are blocking errors. You can still edit and re-confirm later, but earlier packages will not follow the change."
        confirmLabel="Confirm itinerary"
        loading={save.isPending}
        onConfirm={() => save.mutate(true)}
      />
    </div>
  );
}

export default function ItineraryPage() {
  const { id } = useParams<{ id: string }>();
  const q = useItineraryView(id);
  if (q.isLoading) return <LoadingBlock label="Loading itinerary" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load the itinerary" />;
  return (
    <React.Suspense fallback={<LoadingBlock label="Loading itinerary" />}>
      <ItineraryEditor view={q.data!} tripId={id} />
    </React.Suspense>
  );
}
