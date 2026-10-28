import {
  TRAVELER_PACE_LABELS,
  type RoomAllocation,
  type TravelerBudgetItem,
  type TravelerPace,
  type TravelerPackingItem,
  type TripRequestInput,
} from "@tripweave/shared";
import type { PackageView, Trip } from "@/features/trips/types";

export interface TripDestinationInput {
  title: string;
  parseResult?: { parsed?: { destinations?: string[] } } | null;
  itinerary?: { stops: { destination: string }[] } | null;
}

/** First meaningful place name for a trip cover, never an empty string. */
export function tripDestination(input: TripDestinationInput): string {
  const parsed = input.parseResult?.parsed?.destinations?.find((value) => value.trim().length > 0);
  if (parsed) return parsed.trim();
  const stop = input.itinerary?.stops.find((value) => value.destination.trim().length > 0);
  if (stop) return stop.destination.trim();
  return input.title.trim() || "Your trip";
}

/** Calendar-day countdown, rendered in UTC so a date never shifts with the viewer's timezone. */
export function daysUntil(date: string | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const target = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(target)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

export interface BudgetTotals {
  totalMinor: number;
  paidMinor: number;
  unpaidMinor: number;
  remainingMinor: number | null;
  mixedCurrency: boolean;
}

/** Sums the trip currency only. Other currencies are reported, never silently added. */
export function budgetTotals(items: TravelerBudgetItem[], currency: string, budgetMinor?: number | null): BudgetTotals {
  const matching = items.filter((item) => item.currency === currency);
  const totalMinor = matching.reduce((sum, item) => sum + item.amountMinor, 0);
  const paidMinor = matching.filter((item) => item.isPaid).reduce((sum, item) => sum + item.amountMinor, 0);
  return {
    totalMinor,
    paidMinor,
    unpaidMinor: totalMinor - paidMinor,
    remainingMinor: budgetMinor === null || budgetMinor === undefined ? null : budgetMinor - totalMinor,
    mixedCurrency: items.some((item) => item.currency !== currency),
  };
}

export function packingProgress(items: TravelerPackingItem[]): { checked: number; total: number; percent: number } {
  const checked = items.filter((item) => item.isChecked).length;
  return { checked, total: items.length, percent: items.length === 0 ? 0 : Math.min(100, Math.max(0, Math.round((checked / items.length) * 100))) };
}

/** Two adults per room, with children attached to the first room. */
export function allocateTravelerRooms(adults: number, children: number, childAges: number[]): RoomAllocation[] {
  const rooms: RoomAllocation[] = [];
  let remaining = Math.max(1, Math.trunc(adults));
  while (remaining > 0) {
    const inRoom = Math.min(2, remaining);
    rooms.push({ adults: inRoom, children: 0, childAges: [] });
    remaining -= inRoom;
  }
  if (children > 0) {
    const first = rooms[0]!;
    first.children = Math.min(10, Math.trunc(children));
    first.childAges = childAges.slice(0, first.children);
  }
  return rooms;
}

export interface TravelerTripInput {
  title: string;
  idea: string;
  destinations?: string[];
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  childAges: number[];
  budgetMinor: number | null;
  budgetCurrency: string;
  category: string | null;
  pace: TravelerPace;
  interests: string[];
}

/** Shapes the consumer wizard into the existing trip-request contract. */
export function travelerTripPayload(input: TravelerTripInput): TripRequestInput {
  const interests = input.interests.map((interest) => interest.trim()).filter(Boolean);
  const preferenceNote = [interests.length ? `Interests: ${interests.join(", ")}` : null, `Pace: ${TRAVELER_PACE_LABELS[input.pace]}`].filter(Boolean).join(" · ");
  return {
    title: input.title.trim(),
    description: input.idea.trim(),
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    party: { adults: input.adults, children: input.children, childAges: input.childAges, rooms: allocateTravelerRooms(input.adults, input.children, input.childAges) },
    budgetAmountMinor: input.budgetMinor,
    budgetCurrency: input.budgetCurrency as TripRequestInput["budgetCurrency"],
    budgetScope: "all_inclusive_trip",
    preferredHotelCategory: (input.category || null) as TripRequestInput["preferredHotelCategory"],
    specialRequirements: {
      requiredAmenities: [],
      preferredAmenities: [],
      accessibility: [],
      maxLegDurationMinutes: null,
      requiredMealPlans: [],
      requireFreeCancellation: false,
      other: preferenceNote,
    },
  };
}

export interface WizardApi {
  post(path: string, body?: unknown): Promise<unknown>;
  put(path: string, body?: unknown): Promise<unknown>;
}

export interface WizardResult {
  tripId: string;
  warnings: string[];
  parsed: boolean;
  itineraryCreated: boolean;
}

/**
 * Creates the trip first, then tries the non-essential steps. Once the trip exists the caller
 * always gets its id: an unavailable model or a failed route draft becomes a warning, not a
 * half-created trip the traveller cannot recover.
 */
export type WizardStage = "creating" | "parsing" | "routing" | "opening";

export async function createTripFromWizard(input: TravelerTripInput, api: WizardApi, onStage?: (stage: WizardStage) => void): Promise<WizardResult> {
  onStage?.("creating");
  const trip = (await api.post("/trips", travelerTripPayload(input))) as { id: string };
  const warnings: string[] = [];
  let parsed = false;
  let itineraryCreated = false;
  const destinations = input.destinations ?? [];

  const idea = input.idea.trim();
  if (idea.length >= 10) {
    onStage?.("parsing");
    try {
      const result = (await api.post(`/trips/${trip.id}/parse`, { text: idea, apply: true })) as { itinerary?: { id?: string } | null; warnings?: string[] };
      parsed = true;
      if (result.warnings?.length) warnings.push(...result.warnings);
      itineraryCreated = !!result.itinerary;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "The trip idea could not be read automatically.");
    }
  }

  if (!itineraryCreated && destinations.length > 0) {
    onStage?.("routing");
    try {
      const start = Date.parse(`${input.arrivalDate}T00:00:00Z`);
      const end = Date.parse(`${input.departureDate}T00:00:00Z`);
      const nights = Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 86_400_000) : 1;
      const suggestion = (await api.post(`/trips/${trip.id}/itinerary/suggest`, {
        destinations,
        nights,
        arrivalDate: input.arrivalDate,
      })) as { stops: unknown[]; suggestion?: { question?: string } };
      if (suggestion.stops.length > 0) {
        await api.put(`/trips/${trip.id}/itinerary`, {
          title: "Suggested route",
          summary: suggestion.suggestion?.question ?? "",
          stops: suggestion.stops,
        });
        itineraryCreated = true;
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "We could not draft a route from those places yet.");
    }
  }

  onStage?.("opening");
  return { tripId: trip.id, warnings, parsed, itineraryCreated };
}

export interface StayEstimate {
  label: string;
  amountMinor: number;
  currency: string;
}

/** A package's selling price as a budget line. No price means no estimate, never an invented one. */
export function packageStayEstimate(pkg: PackageView): StayEstimate | null {
  if (!pkg.pricing || typeof pkg.pricing.sellingPriceMinor !== "number") return null;
  const names = pkg.package.selections.map((selection) => selection.offer.property.name).filter(Boolean);
  return { label: names.length > 0 ? `Stay: ${names.join(" · ")}` : "Stay", amountMinor: pkg.pricing.sellingPriceMinor, currency: pkg.pricing.currency };
}

export type { Trip };
