import { describe, expect, it } from "vitest";
import type { TravelerBudgetItem, TravelerNote, TravelerPackingItem, TravelerProfile, TravelerShare } from "@tripweave/shared";
import { Harness, type Client } from "./harness";

async function travelerWithTrip(h: Harness, name = "Maya"): Promise<{ c: Client; tripId: string }> {
  const c = await h.registerTraveler(name);
  const trip = await c.ok<{ id: string }>("POST", "/trips", {
    title: "Hill country in December",
    description: "Tea country and a little coast.",
    arrivalDate: "2026-12-10",
    departureDate: "2026-12-14",
    party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
    budgetAmountMinor: 180_000,
    budgetCurrency: "USD",
    budgetScope: "all_inclusive_trip",
  });
  await c.ok("PUT", `/trips/${trip.id}/itinerary`, {
    title: "Tea country",
    stops: [
      { destination: "Kandy", latitude: 7.2906, longitude: 80.6437, arrivalDate: "2026-12-10", departureDate: "2026-12-12", activities: ["Temple of the Tooth", "Market walk"] },
      { destination: "Ella", latitude: 6.8667, longitude: 81.0466, arrivalDate: "2026-12-12", departureDate: "2026-12-14", activities: ["Little Adam's Peak hike"] },
    ],
  });
  return { c, tripId: trip.id };
}

describe("traveller workspaces", () => {
  it("creates a personal workspace with a restricted role and an individual session", async () => {
    const h = new Harness();
    const c = await h.registerTraveler("Maya");
    const me = await c.ok<{ organization: { accountKind: string; role: string }; permissions: string[] }>("GET", "/auth/me");
    expect(me.organization.accountKind).toBe("individual");
    expect(me.organization.role).toBe("staff");
    expect(me.permissions).not.toContain("margins:view");
    const trips = await c.ok<unknown[]>("GET", "/trips");
    expect(trips).toEqual([]);
  });

  it("keeps business accounts out of traveller-only routes", async () => {
    const h = new Harness();
    const business = await h.register("Acme", "tour_operator");
    const res = await business.get("/traveler/profile");
    expect(res.status).toBe(403);
  });

  it("keeps personal accounts out of the operator customer and quotation APIs", async () => {
    const h = new Harness();
    const { c } = await travelerWithTrip(h);
    expect((await c.get("/customers")).status).toBe(403);
    expect((await c.get("/quotes")).status).toBe(403);
  });
});

describe("traveller profile", () => {
  it("reads and updates the traveller profile and account currency", async () => {
    const h = new Harness();
    const c = await h.registerTraveler("Maya");
    const initial = await c.ok<{ user: { displayName: string }; profile: TravelerProfile }>("GET", "/traveler/profile");
    expect(initial.user.displayName).toBe("Maya Traveller");
    expect(initial.profile.currency).toBe("USD");

    const updated = await c.ok<{ user: { displayName: string }; profile: TravelerProfile }>("PATCH", "/traveler/profile", {
      displayName: "Maya Perera",
      homeCity: "Colombo",
      currency: "EUR",
      interests: ["food", "hiking"],
      pace: "slow",
      dietary: "Vegetarian",
      notes: "Window seat, please.",
    });
    expect(updated.user.displayName).toBe("Maya Perera");
    expect(updated.profile.homeCity).toBe("Colombo");
    expect(updated.profile.currency).toBe("EUR");
    expect(updated.profile.interests).toEqual(["food", "hiking"]);

    const me = await c.ok<{ user: { displayName: string }; organization: { defaultCurrency: string } }>("GET", "/auth/me");
    expect(me.user.displayName).toBe("Maya Perera");
    expect(me.organization.defaultCurrency).toBe("EUR");
  });
});

describe("traveller itinerary boundaries", () => {
  it("saves a single stop that touches both trip boundaries", async () => {
    const h = new Harness();
    const c = await h.registerTraveler("Maya");
    const trip = await c.ok<{ id: string }>("POST", "/trips", {
      title: "One stop",
      arrivalDate: "2026-12-10",
      departureDate: "2026-12-12",
      party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
      budgetCurrency: "USD",
    });
    await c.ok("PUT", `/trips/${trip.id}/itinerary`, {
      title: "Kandy",
      confirm: true,
      stops: [{ destination: "Kandy", latitude: 7.2906, longitude: 80.6437, arrivalDate: "2026-12-10", departureDate: "2026-12-12", activities: ["Temple"] }],
    });
    const view = await c.ok<{ itinerary: { stops: unknown[]; status: string } }>("GET", `/trips/${trip.id}/itinerary`);
    expect(view.itinerary.stops).toHaveLength(1);
    expect(view.itinerary.status).toBe("confirmed");
  });
});

describe("applying a planner day", () => {
  it("merges activities into the chosen stop without duplicates and preserves the route status", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h);
    const before = await c.ok<{ itinerary: { id: string; status: string; stops: { id: string; destination: string; activities: string[] }[] } }>("GET", `/trips/${tripId}/itinerary`);
    const stop = before.itinerary.stops[1]!;
    const applied = await c.ok<{ itinerary: { id: string; status: string; stops: { id: string; destination: string; activities: string[] }[] } }>("POST", `/trips/${tripId}/itinerary/activities`, {
      stopId: stop.id,
      activities: ["Little Adam's Peak hike", "Tea factory visit", "tea factory visit"],
    });
    const updated = applied.itinerary.stops.find((entry) => entry.destination === "Ella")!;
    expect(updated.activities).toContain("Little Adam's Peak hike");
    expect(updated.activities).toContain("Tea factory visit");
    expect(updated.activities.filter((activity) => activity.toLowerCase() === "tea factory visit")).toHaveLength(1);
    expect(applied.itinerary.status).toBe(before.itinerary.status);
    expect(applied.itinerary.id).not.toBe(before.itinerary.id);

    const again = await c.ok<{ itinerary: { stops: { id: string; destination: string; activities: string[] }[] } }>("POST", `/trips/${tripId}/itinerary/activities`, { stopId: updated.id, activities: ["Tea factory visit"] });
    expect(again.itinerary.stops.find((entry) => entry.destination === "Ella")!.activities.filter((activity) => activity.toLowerCase() === "tea factory visit")).toHaveLength(1);

    const invalid = await c.post(`/trips/${tripId}/itinerary/activities`, { stopId: "not-a-stop", activities: ["Nope"] });
    expect(invalid.status).toBe(404);
    const tooMany = await c.post(`/trips/${tripId}/itinerary/activities`, { stopId: updated.id, activities: Array.from({ length: 13 }, (_, index) => `Activity ${index}`) });
    expect(tooMany.status).toBe(422);
  });
});

describe("traveller planning context", () => {
  it("never exposes quote refs, quote actions or quote permission", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h);
    const context = await c.ok<{ snapshot: { quotes: unknown[]; allowedActions: string[]; permissions: { canCreateQuotes: boolean } } }>("GET", `/trips/${tripId}/planning`);
    expect(context.snapshot.quotes).toEqual([]);
    expect(context.snapshot.allowedActions).not.toContain("open_quote");
    expect(context.snapshot.permissions.canCreateQuotes).toBe(false);
  });
});

describe("traveller budget", () => {
  it("creates, lists, updates and deletes budget items and scopes them to the traveller", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h);
    const created = await c.ok<TravelerBudgetItem>("POST", `/traveler/trips/${tripId}/budget`, { label: "Train to Kandy", category: "transport", amountMinor: 4_500 });
    expect(created.label).toBe("Train to Kandy");
    expect(created.amountMinor).toBe(4_500);
    expect(created.currency).toBe("USD");
    expect(created.isPaid).toBe(false);

    const list = await c.ok<{ items: TravelerBudgetItem[] }>("GET", `/traveler/trips/${tripId}/budget`);
    expect(list.items).toHaveLength(1);

    const paid = await c.ok<TravelerBudgetItem>("PATCH", `/traveler/trips/${tripId}/budget/${created.id}`, { isPaid: true });
    expect(paid.isPaid).toBe(true);

    const negative = await c.post(`/traveler/trips/${tripId}/budget`, { label: "Bad", category: "other", amountMinor: -1 });
    expect(negative.status).toBe(422);
    const wrongCurrency = await c.post(`/traveler/trips/${tripId}/budget`, { label: "Euro line", category: "other", amountMinor: 1_000, currency: "EUR" });
    expect(wrongCurrency.status).toBe(422);

    const other = await h.registerTraveler("Noah");
    const hidden = await other.get(`/traveler/trips/${tripId}/budget`);
    expect(hidden.status).toBe(404);

    await c.ok("DELETE", `/traveler/trips/${tripId}/budget/${created.id}`);
    const empty = await c.ok<{ items: TravelerBudgetItem[] }>("GET", `/traveler/trips/${tripId}/budget`);
    expect(empty.items).toEqual([]);
  });
});

describe("traveller tenancy", () => {
  it("scopes packing, notes, shares and the trip itself to the owner", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h, "Maya");
    await c.ok("POST", `/traveler/trips/${tripId}/packing`, { label: "Passport", category: "documents" });
    await c.ok("POST", `/traveler/trips/${tripId}/notes`, { body: "Private note" });
    await c.ok("POST", `/traveler/trips/${tripId}/shares`, { expiresInDays: 7, includeBudget: false });
    const other = await h.registerTraveler("Noah");
    expect((await other.get(`/traveler/trips/${tripId}/packing`)).status).toBe(404);
    expect((await other.get(`/traveler/trips/${tripId}/notes`)).status).toBe(404);
    expect((await other.get(`/traveler/trips/${tripId}/shares`)).status).toBe(404);
    expect((await other.get(`/trips/${tripId}`)).status).toBe(404);
  });
});

describe("traveller packing", () => {
  it("creates, checks and deletes packing items", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h);
    const item = await c.ok<TravelerPackingItem>("POST", `/traveler/trips/${tripId}/packing`, { label: "Passport", category: "documents" });
    expect(item.isChecked).toBe(false);
    const checked = await c.ok<TravelerPackingItem>("PATCH", `/traveler/trips/${tripId}/packing/${item.id}`, { isChecked: true });
    expect(checked.isChecked).toBe(true);
    const list = await c.ok<{ items: TravelerPackingItem[] }>("GET", `/traveler/trips/${tripId}/packing`);
    expect(list.items).toHaveLength(1);
    await c.ok("DELETE", `/traveler/trips/${tripId}/packing/${item.id}`);
    const empty = await c.ok<{ items: TravelerPackingItem[] }>("GET", `/traveler/trips/${tripId}/packing`);
    expect(empty.items).toEqual([]);
  });

  it("generates an activity-aware list once and preserves checked items", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h);
    const first = await c.ok<{ added: number; items: TravelerPackingItem[] }>("POST", `/traveler/trips/${tripId}/packing/generate`, {});
    expect(first.added).toBeGreaterThan(10);
    const labels = first.items.map((item) => item.label.toLowerCase());
    expect(labels).toContain("walking shoes");
    expect(labels).toContain("modest clothing");

    const checked = first.items.find((item) => item.label === "Passport / ID")!;
    await c.ok("PATCH", `/traveler/trips/${tripId}/packing/${checked.id}`, { isChecked: true });
    const second = await c.ok<{ added: number; items: TravelerPackingItem[] }>("POST", `/traveler/trips/${tripId}/packing/generate`, {});
    expect(second.added).toBe(0);
    expect(second.items).toHaveLength(first.items.length);
    expect(second.items.find((item) => item.id === checked.id)?.isChecked).toBe(true);
  });
});

describe("traveller notes", () => {
  it("creates, updates and deletes notes", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h);
    const note = await c.ok<TravelerNote>("POST", `/traveler/trips/${tripId}/notes`, { body: "Buy train tickets on Tuesday." });
    expect(note.body).toContain("train tickets");
    const edited = await c.ok<TravelerNote>("PATCH", `/traveler/trips/${tripId}/notes/${note.id}`, { body: "Buy train tickets on Monday." });
    expect(edited.body).toContain("Monday");
    const list = await c.ok<{ items: TravelerNote[] }>("GET", `/traveler/trips/${tripId}/notes`);
    expect(list.items).toHaveLength(1);
    await c.ok("DELETE", `/traveler/trips/${tripId}/notes/${note.id}`);
    const empty = await c.ok<{ items: TravelerNote[] }>("GET", `/traveler/trips/${tripId}/notes`);
    expect(empty.items).toEqual([]);
  });
});

describe("traveller share links", () => {
  it("creates one active link at a time and reveals the token only once", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h);
    const first = await c.ok<{ share: TravelerShare; url: string }>("POST", `/traveler/trips/${tripId}/shares`, { expiresInDays: 30, includeBudget: true });
    expect(first.url).toContain("/t/");
    expect(first.share.includeBudget).toBe(true);
    expect(first.url).not.toContain(first.share.id);

    const list = await c.ok<{ shares: TravelerShare[] }>("GET", `/traveler/trips/${tripId}/shares`);
    expect(list.shares).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain(first.url.split("/t/")[1]!);

    const second = await c.ok<{ share: TravelerShare; url: string }>("POST", `/traveler/trips/${tripId}/shares`, { expiresInDays: 7, includeBudget: false });
    expect(second.url).not.toBe(first.url);
    const after = await c.ok<{ shares: TravelerShare[] }>("GET", `/traveler/trips/${tripId}/shares`);
    expect(after.shares).toHaveLength(1);
    expect(after.shares[0]!.includeBudget).toBe(false);

    await c.ok("DELETE", `/traveler/trips/${tripId}/shares/${second.share.id}`);
    const revoked = await c.ok<{ shares: TravelerShare[] }>("GET", `/traveler/trips/${tripId}/shares`);
    expect(revoked.shares).toEqual([]);
  });
});

describe("public trip sharing", () => {
  it("serves a read-only trip with an optional budget summary and no private data", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h);
    await c.ok("POST", `/traveler/trips/${tripId}/budget`, { label: "Train", category: "transport", amountMinor: 4_500 });
    await c.ok("POST", `/traveler/trips/${tripId}/budget`, { label: "Guesthouse", category: "stay", amountMinor: 12_000 });
    const created = await c.ok<{ url: string }>("POST", `/traveler/trips/${tripId}/shares`, { expiresInDays: 30, includeBudget: true });
    const token = created.url.split("/t/")[1]!;

    const anon = h.client();
    const view = await anon.ok<{
      trip: { title: string; party: { adults: number } };
      itinerary: { stops: { destination: string; activities: string[] }[] } | null;
      budget: { currency: string; totalMinor: number; categories: { category: string; totalMinor: number }[] } | null;
    }>("GET", `/public/trips/${token}`);
    expect(view.trip.title).toBe("Hill country in December");
    expect(view.trip.party.adults).toBe(2);
    expect(view.itinerary?.stops[0]?.destination).toBe("Kandy");
    expect(view.itinerary?.stops[0]?.activities).toContain("Temple of the Tooth");
    expect(view.budget?.totalMinor).toBe(16_500);
    expect(view.budget?.categories).toContainEqual({ category: "stay", totalMinor: 12_000 });

    const serialised = JSON.stringify(view).toLowerCase();
    for (const forbidden of ["organizationid", "supplier", "margin", "costminor", "packing", "\"notes\"", "tokenhash"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("honours the budget opt-out, revocation and expiry", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h);
    const hiddenBudget = await c.ok<{ url: string }>("POST", `/traveler/trips/${tripId}/shares`, { expiresInDays: 1, includeBudget: false });
    const anon = h.client();
    const view = await anon.ok<{ budget: unknown }>("GET", `/public/trips/${hiddenBudget.url.split("/t/")[1]!}`);
    expect(view.budget).toBeNull();

    const active = await c.ok<{ shares: TravelerShare[] }>("GET", `/traveler/trips/${tripId}/shares`);
    await c.ok("DELETE", `/traveler/trips/${tripId}/shares/${active.shares[0]!.id}`);
    expect((await anon.get(`/public/trips/${hiddenBudget.url.split("/t/")[1]!}`)).status).toBe(404);

    const expiring = await c.ok<{ url: string }>("POST", `/traveler/trips/${tripId}/shares`, { expiresInDays: 1, includeBudget: false });
    h.now = new Date("2026-10-29T10:00:00Z");
    expect((await anon.get(`/public/trips/${expiring.url.split("/t/")[1]!}`)).status).toBe(404);
  });

  it("does not silently add unlike currencies to the public budget total", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h);
    await c.ok("POST", `/traveler/trips/${tripId}/budget`, { label: "Old USD line", category: "other", amountMinor: 4_500 });
    await c.ok("PATCH", `/trips/${tripId}`, { budgetCurrency: "EUR" });
    await c.ok("POST", `/traveler/trips/${tripId}/budget`, { label: "New EUR line", category: "other", amountMinor: 1_200 });
    const created = await c.ok<{ url: string }>("POST", `/traveler/trips/${tripId}/shares`, { expiresInDays: 30, includeBudget: true });
    const view = await h.client().ok<{ budget: { currency: string; totalMinor: number; excludedCurrencies: string[] } }>("GET", `/public/trips/${created.url.split("/t/")[1]!}`);
    expect(view.budget.currency).toBe("EUR");
    expect(view.budget.totalMinor).toBe(1_200);
    expect(view.budget.excludedCurrencies).toEqual(["USD"]);
  });

  it("returns the same not-found response for unknown tokens", async () => {
    const h = new Harness();
    const anon = h.client();
    const missing = await anon.get(`/public/trips/${"x".repeat(40)}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe("This link is invalid or has expired");
  });

  it("serves each trip's own share without mixing data", async () => {
    const h = new Harness();
    const { c, tripId } = await travelerWithTrip(h);
    const secondTrip = await c.ok<{ id: string }>("POST", "/trips", {
      title: "Coast and calm",
      arrivalDate: "2027-01-05",
      departureDate: "2027-01-09",
      party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
      budgetCurrency: "USD",
    });
    await c.ok("PUT", `/trips/${secondTrip.id}/itinerary`, {
      title: "South coast",
      stops: [{ destination: "Galle", latitude: 6.0535, longitude: 80.221, arrivalDate: "2027-01-05", departureDate: "2027-01-09", activities: ["Fort walk"] }],
    });
    const first = await c.ok<{ url: string }>("POST", `/traveler/trips/${tripId}/shares`, { expiresInDays: 30, includeBudget: false });
    const second = await c.ok<{ url: string }>("POST", `/traveler/trips/${secondTrip.id}/shares`, { expiresInDays: 30, includeBudget: false });
    const anon = h.client();
    const firstView = await anon.ok<{ trip: { title: string }; itinerary: { stops: { destination: string }[] } | null }>("GET", `/public/trips/${first.url.split("/t/")[1]!}`);
    const secondView = await anon.ok<{ trip: { title: string }; itinerary: { stops: { destination: string }[] } | null }>("GET", `/public/trips/${second.url.split("/t/")[1]!}`);
    expect(firstView.trip.title).toBe("Hill country in December");
    expect(firstView.itinerary?.stops[0]?.destination).toBe("Kandy");
    expect(secondView.trip.title).toBe("Coast and calm");
    expect(secondView.itinerary?.stops[0]?.destination).toBe("Galle");
  });
});
