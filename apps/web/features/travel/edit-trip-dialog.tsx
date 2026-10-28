"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HOTEL_CATEGORIES } from "@tripweave/shared";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { ApiError, apiPatch, errorMessage } from "@/lib/api";
import { titleCase } from "@/lib/utils";
import { tripKeys } from "@/features/trips/hooks";
import type { Trip } from "@/features/trips/types";
import { travelKeys } from "./hooks";
import { allocateTravelerRooms } from "./lib";

export function EditTripDialog({ trip, open, onOpenChange, onSaved }: { trip: Trip; open: boolean; onOpenChange: (open: boolean) => void; onSaved?: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = React.useState(trip.title);
  const [arrivalDate, setArrivalDate] = React.useState(trip.arrivalDate ?? "");
  const [departureDate, setDepartureDate] = React.useState(trip.departureDate ?? "");
  const [adults, setAdults] = React.useState(trip.party.adults);
  const [children, setChildren] = React.useState(trip.party.children);
  const [childAges, setChildAges] = React.useState<string[]>((trip.party.childAges ?? []).map(String));
  const [budgetMinor, setBudgetMinor] = React.useState<number | null>(trip.budgetAmountMinor);
  const [currency, setCurrency] = React.useState(trip.budgetCurrency);
  const [category, setCategory] = React.useState(trip.preferredHotelCategory ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(trip.title);
    setArrivalDate(trip.arrivalDate ?? "");
    setDepartureDate(trip.departureDate ?? "");
    setAdults(trip.party.adults);
    setChildren(trip.party.children);
    setChildAges((trip.party.childAges ?? []).map(String));
    setBudgetMinor(trip.budgetAmountMinor);
    setCurrency(trip.budgetCurrency);
    setCategory(trip.preferredHotelCategory ?? "");
    setErrors({});
    setError(null);
  }, [open, trip]);

  const setChildCount = (count: number) => {
    setChildren(count);
    setChildAges((current) => Array.from({ length: count }, (_, index) => current[index] ?? ""));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (title.trim().length < 2) next.title = "Give the trip a title.";
    if (!arrivalDate || !departureDate) next.departureDate = "Both dates are required.";
    else if (departureDate <= arrivalDate) next.departureDate = "Departure must be after arrival.";
    if (adults < 1) next.adults = "At least one adult.";
    const ages = childAges.slice(0, children).map(Number);
    if (children > 0 && (ages.length !== children || ages.some((age) => !Number.isInteger(age) || age < 0 || age > 17))) next.childAges = "Add an age (0–17) for every child.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/trips/${trip.id}`, {
        title: title.trim(),
        arrivalDate,
        departureDate,
        party: { adults, children, childAges: ages, rooms: allocateTravelerRooms(adults, children, ages) },
        budgetAmountMinor: budgetMinor,
        budgetCurrency: currency,
        preferredHotelCategory: category || null,
      });
      qc.invalidateQueries({ queryKey: tripKeys.detail(trip.id) });
      qc.invalidateQueries({ queryKey: tripKeys.itinerary(trip.id) });
      qc.invalidateQueries({ queryKey: travelKeys.trips });
      toast.success("Trip updated");
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Edit trip details" description="Dates, travellers and the budget you want to keep in view.">
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Title" htmlFor="edit-title" error={errors.title} required>
            <Input id="edit-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Arrival" htmlFor="edit-arrival" error={errors.arrivalDate} required>
              <Input id="edit-arrival" type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} />
            </Field>
            <Field label="Departure" htmlFor="edit-departure" error={errors.departureDate} required>
              <Input id="edit-departure" type="date" min={arrivalDate || undefined} value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Adults" htmlFor="edit-adults" error={errors.adults}>
              <Input id="edit-adults" type="number" min={1} max={60} value={adults} onChange={(event) => setAdults(Math.max(1, Math.min(60, Number(event.target.value) || 1)))} />
            </Field>
            <Field label="Children" htmlFor="edit-children" error={errors.childAges}>
              <Input id="edit-children" type="number" min={0} max={40} value={children} onChange={(event) => setChildCount(Math.max(0, Math.min(40, Number(event.target.value) || 0)))} />
            </Field>
          </div>
          {children > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {childAges.slice(0, children).map((age, index) => (
                <Field key={index} label={`Child ${index + 1} age`} htmlFor={`edit-child-age-${index}`}>
                  <Input id={`edit-child-age-${index}`} inputMode="numeric" maxLength={2} value={age} onChange={(event) => setChildAges((current) => current.map((value, i) => (i === index ? event.target.value : value)))} placeholder="0–17" />
                </Field>
              ))}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trip budget" htmlFor="edit-budget">
              <MoneyInput id="edit-budget" valueMinor={budgetMinor} onMinorChange={setBudgetMinor} currency={currency} />
            </Field>
            <Field label="Currency" htmlFor="edit-currency">
              <Select id="edit-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {["USD", "EUR", "GBP", "LKR"].map((value) => <option key={value}>{value}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Stay style" htmlFor="edit-category">
            <Select id="edit-category" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">No preference</option>
              {HOTEL_CATEGORIES.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Save changes</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
