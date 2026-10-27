"use client";
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { HOTEL_CATEGORIES, propertySchema } from "@tripweave/shared";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { ApiError, apiGet, errorMessage } from "@/lib/api";
import { AmenityInput } from "./amenity-input";
import { AMENITY_SUGGESTIONS, CATEGORY_LABEL, apiFieldErrors, issuesToErrors, numOrNull } from "./lib";
import type { Place, Property } from "./types";

export interface PropertyPayload {
  name: string;
  description: string;
  country: string;
  region?: string;
  city: string;
  address?: string;
  latitude: number | null;
  longitude: number | null;
  category: string;
  starClassification: number | null;
  reviewScore: number | null;
  amenities: string[];
  checkInTime: string;
  checkOutTime: string;
  contact: { email?: string; phone?: string; website?: string };
  status: string;
  preferredPartner: boolean;
}

interface Values {
  name: string;
  description: string;
  country: string;
  region: string;
  city: string;
  address: string;
  latitude: string;
  longitude: string;
  category: string;
  starClassification: string;
  reviewScore: string;
  amenities: string[];
  checkInTime: string;
  checkOutTime: string;
  email: string;
  phone: string;
  website: string;
  preferredPartner: boolean;
  status: string;
}

function initialValues(p?: Property): Values {
  return {
    name: p?.name ?? "",
    description: p?.description ?? "",
    country: p?.country ?? "LK",
    region: p?.region ?? "",
    city: p?.city ?? "",
    address: p?.address ?? "",
    latitude: p?.latitude != null ? String(p.latitude) : "",
    longitude: p?.longitude != null ? String(p.longitude) : "",
    category: p?.category ?? "standard",
    starClassification: p?.starClassification != null ? String(p.starClassification) : "",
    reviewScore: p?.reviewScore != null ? String(p.reviewScore) : "",
    amenities: p?.amenities ?? [],
    checkInTime: p?.checkInTime ?? "14:00",
    checkOutTime: p?.checkOutTime ?? "11:00",
    email: p?.contact?.email ?? "",
    phone: p?.contact?.phone ?? "",
    website: p?.contact?.website ?? "",
    preferredPartner: p?.preferredPartner ?? false,
    status: p?.status ?? "active",
  };
}

export function PropertyForm({ mode, initial, onSubmit, submitLabel, onCancel }: { mode: "create" | "edit"; initial?: Property; onSubmit: (payload: PropertyPayload) => Promise<void>; submitLabel: string; onCancel?: () => void }) {
  const [v, setV] = React.useState<Values>(() => initialValues(initial));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [places, setPlaces] = React.useState<Place[] | null>(null);
  const [placeMsg, setPlaceMsg] = React.useState<string | null>(null);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((s) => ({ ...s, [k]: val }));

  const lookup = useMutation({
    mutationFn: (q: string) => apiGet<Place[]>("/places/search", { q }),
    onSuccess: (list) => {
      setPlaceMsg(null);
      if (list.length === 0) {
        setPlaces([]);
        setPlaceMsg("No known place matches. Enter the coordinates manually (optional).");
      } else if (list.length === 1) {
        applyPlace(list[0]!);
        setPlaces(null);
      } else setPlaces(list);
    },
    onError: (e) => {
      setPlaces(null);
      setPlaceMsg(e instanceof ApiError && e.status === 403 ? "You do not have permission to look up places. Enter the coordinates manually." : errorMessage(e));
    },
  });
  function applyPlace(p: Place) {
    setV((s) => ({ ...s, latitude: String(p.latitude), longitude: String(p.longitude) }));
    setPlaceMsg(`Coordinates filled from "${p.name}". Adjust them if the hotel is elsewhere in town.`);
    setPlaces(null);
  }

  const submit = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const lat = numOrNull(v.latitude);
      const lng = numOrNull(v.longitude);
      const star = numOrNull(v.starClassification);
      const review = numOrNull(v.reviewScore);
      const local: Record<string, string> = {};
      if (lat !== null && Number.isNaN(lat)) local.latitude = "Enter a number such as 6.9271";
      if (lng !== null && Number.isNaN(lng)) local.longitude = "Enter a number such as 79.8612";
      if (review !== null && Number.isNaN(review)) local.reviewScore = "Enter a number between 0 and 10";
      if ((lat === null) !== (lng === null)) local[lat === null ? "latitude" : "longitude"] = "Provide both latitude and longitude, or neither";
      const contact: PropertyPayload["contact"] = {};
      if (v.email.trim()) contact.email = v.email.trim();
      if (v.phone.trim()) contact.phone = v.phone.trim();
      if (v.website.trim()) contact.website = v.website.trim();
      const payload: PropertyPayload = {
        name: v.name.trim(),
        description: v.description,
        country: v.country.trim().toUpperCase(),
        city: v.city.trim(),
        latitude: lat !== null && Number.isNaN(lat) ? null : lat,
        longitude: lng !== null && Number.isNaN(lng) ? null : lng,
        category: v.category,
        starClassification: star,
        reviewScore: review !== null && Number.isNaN(review) ? null : review,
        amenities: v.amenities,
        checkInTime: v.checkInTime,
        checkOutTime: v.checkOutTime,
        contact,
        status: v.status,
        preferredPartner: v.preferredPartner,
        ...(v.region.trim() || mode === "edit" ? { region: v.region.trim() } : {}),
        ...(v.address.trim() || mode === "edit" ? { address: v.address.trim() } : {}),
      };
      const parsed = propertySchema.safeParse(payload);
      const all = { ...(parsed.success ? {} : issuesToErrors(parsed.error)), ...local };
      if (Object.keys(all).length > 0) {
        setErrors(all);
        throw new Error("Please fix the highlighted fields.");
      }
      setErrors({});
      await onSubmit(payload);
    },
    onError: (e) => {
      setErrors((s) => ({ ...s, ...apiFieldErrors(e) }));
      setFormError(errorMessage(e));
    },
  });

  const e = errors;
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        submit.mutate();
      }}
      noValidate
      className="flex flex-col gap-5"
    >
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>How the property appears in the catalogue and in quotations.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Hotel name" htmlFor="p-name" error={e.name} required className="sm:col-span-2">
            <Input id="p-name" value={v.name} onChange={(ev) => set("name", ev.target.value)} aria-invalid={!!e.name} />
          </Field>
          <Field label="Description" htmlFor="p-desc" error={e.description} className="sm:col-span-2">
            <Textarea id="p-desc" rows={4} value={v.description} onChange={(ev) => set("description", ev.target.value)} />
          </Field>
          <Field label="Category" htmlFor="p-cat" error={e.category}>
            <Select id="p-cat" value={v.category} onChange={(ev) => set("category", ev.target.value)}>
              {HOTEL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Star classification" htmlFor="p-star" error={e.starClassification} hint="Official classification, if any.">
            <Select id="p-star" value={v.starClassification} onChange={(ev) => set("starClassification", ev.target.value)}>
              <option value="">Not classified</option>
              {[1, 2, 3, 4, 5].map((s) => (
                <option key={s} value={s}>
                  {s} star{s > 1 ? "s" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Review score (0–10)" htmlFor="p-review" error={e.reviewScore} hint="Optional and supplied by your organisation (for example from your own guest surveys). It is not verified by TripWeave; leave blank if unrated." className="sm:col-span-2">
            <Input id="p-review" inputMode="decimal" value={v.reviewScore} onChange={(ev) => set("reviewScore", ev.target.value)} aria-invalid={!!e.reviewScore} className="max-w-40" />
          </Field>
          <Field label="Status" htmlFor="p-status" error={e.status} hint="Only active properties are used when optimising itineraries.">
            <Select id="p-status" value={v.status} onChange={(ev) => set("status", ev.target.value)}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <div className="flex items-end pb-1">
            <Switch checked={v.preferredPartner} onCheckedChange={(c) => set("preferredPartner", c)} label="Preferred partner property" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
          <CardDescription>Coordinates let the optimiser estimate travel between stops.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="City / town" htmlFor="p-city" error={e.city} required>
            <Input id="p-city" value={v.city} onChange={(ev) => set("city", ev.target.value)} aria-invalid={!!e.city} />
          </Field>
          <Field label="Region / province" htmlFor="p-region" error={e.region}>
            <Input id="p-region" value={v.region} onChange={(ev) => set("region", ev.target.value)} />
          </Field>
          <Field label="Address" htmlFor="p-address" error={e.address} className="sm:col-span-2">
            <Input id="p-address" value={v.address} onChange={(ev) => set("address", ev.target.value)} />
          </Field>
          <Field label="Country (ISO code)" htmlFor="p-country" error={e.country}>
            <Input id="p-country" maxLength={2} value={v.country} onChange={(ev) => set("country", ev.target.value)} className="max-w-24 uppercase" />
          </Field>
          <div />
          <Field label="Latitude" htmlFor="p-lat" error={e.latitude}>
            <Input id="p-lat" inputMode="decimal" value={v.latitude} onChange={(ev) => set("latitude", ev.target.value)} aria-invalid={!!e.latitude} />
          </Field>
          <Field label="Longitude" htmlFor="p-lng" error={e.longitude}>
            <Input id="p-lng" inputMode="decimal" value={v.longitude} onChange={(ev) => set("longitude", ev.target.value)} aria-invalid={!!e.longitude} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="button" variant="outline" size="sm" loading={lookup.isPending} disabled={v.city.trim() === ""} onClick={() => lookup.mutate(v.city.trim())}>
              <MapPin /> Fill coordinates from town name
            </Button>
            {v.city.trim() === "" ? <span className="ml-2 text-xs text-muted-foreground">Enter the city first.</span> : null}
            <div aria-live="polite" className="mt-2 text-xs text-muted-foreground">
              {placeMsg}
            </div>
            {places && places.length > 1 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {places.map((p) => (
                  <li key={`${p.name}-${p.latitude}`}>
                    <Button type="button" size="sm" variant="secondary" onClick={() => applyPlace(p)}>
                      {p.name} ({p.latitude.toFixed(2)}, {p.longitude.toFixed(2)})
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amenities & times</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Amenities" htmlFor="p-amenities" error={e.amenities} hint="Amenities are matched against client requirements when optimising." className="sm:col-span-2">
            <AmenityInput id="p-amenities" value={v.amenities} onChange={(a) => set("amenities", a)} suggestions={AMENITY_SUGGESTIONS} />
          </Field>
          <Field label="Check-in time" htmlFor="p-in" error={e.checkInTime}>
            <Input id="p-in" type="time" value={v.checkInTime} onChange={(ev) => set("checkInTime", ev.target.value)} className="max-w-36" />
          </Field>
          <Field label="Check-out time" htmlFor="p-out" error={e.checkOutTime}>
            <Input id="p-out" type="time" value={v.checkOutTime} onChange={(ev) => set("checkOutTime", ev.target.value)} className="max-w-36" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Reservations email" htmlFor="p-email" error={e["contact.email"]}>
            <Input id="p-email" type="email" value={v.email} onChange={(ev) => set("email", ev.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="p-phone" error={e["contact.phone"]}>
            <Input id="p-phone" type="tel" value={v.phone} onChange={(ev) => set("phone", ev.target.value)} />
          </Field>
          <Field label="Website" htmlFor="p-web" error={e["contact.website"]}>
            <Input id="p-web" value={v.website} onChange={(ev) => set("website", ev.target.value)} placeholder="https://" />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={submit.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
