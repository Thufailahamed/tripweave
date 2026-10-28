import type { TravelerPackingCategory } from "@tripweave/shared";

export interface SuggestedPackingItem {
  label: string;
  category: TravelerPackingCategory;
}

const BASE: SuggestedPackingItem[] = [
  { label: "Passport / ID", category: "documents" },
  { label: "Travel insurance", category: "documents" },
  { label: "Booking confirmations", category: "documents" },
  { label: "Payment cards", category: "documents" },
  { label: "Emergency contacts", category: "documents" },
  { label: "Underwear", category: "clothing" },
  { label: "Socks", category: "clothing" },
  { label: "Tops", category: "clothing" },
  { label: "Trousers / shorts", category: "clothing" },
  { label: "Sleepwear", category: "clothing" },
  { label: "Comfortable shoes", category: "clothing" },
  { label: "Light jacket", category: "clothing" },
  { label: "Sunglasses", category: "clothing" },
  { label: "Sun hat", category: "clothing" },
  { label: "Toothbrush", category: "toiletries" },
  { label: "Toothpaste", category: "toiletries" },
  { label: "Deodorant", category: "toiletries" },
  { label: "Shampoo", category: "toiletries" },
  { label: "Sunscreen", category: "toiletries" },
  { label: "Insect repellent", category: "toiletries" },
  { label: "Phone", category: "tech" },
  { label: "Phone charger", category: "tech" },
  { label: "Power bank", category: "tech" },
  { label: "Travel adapter", category: "tech" },
  { label: "Camera", category: "tech" },
  { label: "Headphones", category: "tech" },
  { label: "Medication", category: "health" },
  { label: "First aid kit", category: "health" },
  { label: "Hand sanitiser", category: "health" },
  { label: "Reusable water bottle", category: "other" },
  { label: "Day bag", category: "other" },
];

function nightsBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 86_400_000);
}

/**
 * Deterministic, seasonal-claim-free packing list. It reacts to the words in the itinerary
 * (hike, beach, temple, safari) and the trip length, and never asks a model for weather.
 */
export function suggestPackingItems(input: {
  arrivalDate: string | null;
  departureDate: string | null;
  destinations: string[];
  activities: string[];
}): SuggestedPackingItem[] {
  const items: SuggestedPackingItem[] = [...BASE];
  const text = [...input.destinations, ...input.activities].join(" ").toLowerCase();

  if (/hike|trail|walk/.test(text)) items.push({ label: "Walking shoes", category: "clothing" });
  if (/beach|swim|snorkel|dive|coast|island/.test(text)) {
    items.push({ label: "Swimwear", category: "clothing" }, { label: "Flip-flops", category: "clothing" }, { label: "Dry bag", category: "other" });
  }
  if (/temple|shrine/.test(text)) items.push({ label: "Modest clothing", category: "clothing" });
  if (/safari|wildlife/.test(text)) items.push({ label: "Neutral-coloured clothing", category: "clothing" }, { label: "Binoculars", category: "other" });

  const nights = nightsBetween(input.arrivalDate, input.departureDate);
  if (nights !== null && nights > 7) items.push({ label: "Laundry bag", category: "other" });

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
