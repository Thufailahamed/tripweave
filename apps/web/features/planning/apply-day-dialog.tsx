"use client";
import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PlanningItineraryView } from "@tripweave/planning-contract";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { apiPost, errorMessage } from "@/lib/api";
import { tripKeys } from "@/features/trips/hooks";
import { dateRange } from "@/lib/utils";

export interface ApplyDay {
  day: string;
  title?: string;
  activities: string[];
}

function guessStopId(day: string, stops: PlanningItineraryView["stops"]): string {
  const iso = day.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) {
    const dated = stops.find((stop) => iso >= stop.arrivalDate && iso < stop.departureDate);
    if (dated) return dated.id;
  }
  const number = Number(day.match(/\d+/)?.[0]);
  if (Number.isFinite(number) && number > 0) return stops[Math.min(number - 1, stops.length - 1)]?.id ?? "";
  return stops[0]?.id ?? "";
}

/** The user chooses the stop; the model never decides where a generated day lands. */
export function ApplyDayDialog({
  tripId,
  mode,
  itinerary,
  open,
  onOpenChange,
  day,
  title,
  activities,
  onApplied,
}: {
  tripId: string;
  mode: "operator" | "traveler";
  itinerary: PlanningItineraryView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: string;
  title?: string;
  activities: string[];
  onApplied?: () => void;
}) {
  const qc = useQueryClient();
  const stops = itinerary?.stops ?? [];
  const unique = React.useMemo(() => [...new Set(activities.map((activity) => activity.trim()).filter(Boolean))], [activities]);
  const [stopId, setStopId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const base = mode === "traveler" ? `/travel/trips/${tripId}` : `/trips/${tripId}`;
  const selected = stops.find((stop) => stop.id === stopId) ?? null;

  React.useEffect(() => {
    if (!open) return;
    setStopId(guessStopId(day, itinerary?.stops ?? []));
    setError(null);
  }, [open, day, itinerary?.id]);

  const apply = async () => {
    if (!selected || unique.length === 0) {
      setError("Choose a stop first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/trips/${tripId}/itinerary/activities`, { stopId: selected.id, activities: unique });
      qc.invalidateQueries({ queryKey: tripKeys.itinerary(tripId) });
      qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      toast.success(`Added ${unique.length} ${unique.length === 1 ? "activity" : "activities"} to ${selected.destination}`);
      onApplied?.();
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add this day to the itinerary" description="The activities are merged into one stop. Dates, hotels and the rest of the route stay unchanged.">
        <div className="flex flex-col gap-4">
          <div>
            <p className="pl-eyebrow">{day}{title ? ` · ${title}` : ""}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {unique.map((activity) => (
                <li key={activity} className="pl-chip">{activity}</li>
              ))}
            </ul>
          </div>
          {stops.length === 0 ? (
            <Alert tone="info" title="No route yet">
              Add a stop to the itinerary first, then ask the planner to apply this day.{" "}
              <Link href={`${base}/itinerary`} className="font-semibold text-accent hover:underline">Open the itinerary</Link>
            </Alert>
          ) : (
            <>
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Field label="Add to which stop?" htmlFor="apply-day-stop">
                <Select id="apply-day-stop" value={stopId} onChange={(event) => setStopId(event.target.value)}>
                  {stops.map((stop) => (
                    <option key={stop.id} value={stop.id}>{stop.sequence}. {stop.destination} · {dateRange(stop.arrivalDate, stop.departureDate)}</option>
                  ))}
                </Select>
              </Field>
              <p className="text-xs leading-relaxed text-muted-foreground">Existing activities are kept. Duplicate activities are ignored.</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="button" onClick={() => void apply()} loading={busy} disabled={!selected || unique.length === 0}>
                  Add {unique.length} {unique.length === 1 ? "activity" : "activities"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
