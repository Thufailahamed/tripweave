import { beforeAll, describe, expect, it } from "vitest";
import { createHotel, Harness } from "./harness";

const ENQUIRY =
  "Family of 4 (kids 8 and 11), 10 nights in Sri Lanka from 5 March 2027, Kandy, Ella and the south coast, around USD 4,000 for hotels, breakfast included.";

describe("family enquiry workflow", () => {
  let h: Harness;
  let operator: Awaited<ReturnType<Harness["register"]>>;

  beforeAll(async () => {
    h = new Harness();
    operator = await h.register("South Coast Tours", "tour_operator");
    const stays = [
      { name: "Kandy Family Rooms (Demo)", city: "Kandy", lat: 7.2906, lng: 80.6337, price: 90 },
      { name: "Ella Family Rooms (Demo)", city: "Ella", lat: 6.8667, lng: 81.0466, price: 85 },
      { name: "Galle Fort Family Rooms (Demo)", city: "Galle", lat: 6.0535, lng: 80.221, price: 95 },
    ];
    for (const stay of stays) await createHotel(operator, { ...stay, category: "comfort", amenities: ["wifi", "pool"] });
  });

  it("extracts the family, allocates two rooms, maps the south coast to Galle, and produces packages", async () => {
    // This mirrors the web form: the trip is created first, then the enquiry is parsed and applied.
    const created = await operator.ok("POST", "/trips", { title: "Family south coast", description: ENQUIRY });
    const parsed = await operator.ok("POST", `/trips/${created.id}/parse`, { text: ENQUIRY, apply: true });

    expect(parsed.parsed.adults).toBe(2);
    expect(parsed.parsed.children).toBe(2);
    expect(parsed.parsed.childAges).toEqual([8, 11]);
    expect(parsed.parsed.destinations).toEqual(["Kandy", "Ella", "Galle"]);
    expect(parsed.parsed.budgetScope).toBe("accommodation_only");
    expect(parsed.trip.party).toMatchObject({ adults: 2, children: 2, childAges: [8, 11] });
    expect(parsed.trip.party.rooms).toHaveLength(2);
    expect(parsed.trip.party.rooms.reduce((sum: number, room: any) => sum + room.adults, 0)).toBe(2);
    expect(parsed.trip.party.rooms.reduce((sum: number, room: any) => sum + room.children, 0)).toBe(2);
    expect(parsed.trip.budgetAmountMinor).toBe(400_000);
    expect(parsed.itinerary.stops.map((stop: any) => stop.destination)).toEqual(["Kandy", "Ella", "Galle"]);

    await operator.ok("PUT", `/trips/${created.id}/itinerary`, {
      title: "South coast family route",
      confirm: true,
      stops: parsed.itinerary.stops.map((stop: any) => ({
        destination: stop.destination,
        arrivalDate: stop.arrivalDate,
        departureDate: stop.departureDate,
        latitude: stop.latitude,
        longitude: stop.longitude,
        activities: [],
      })),
    });

    const start = await operator.post(`/trips/${created.id}/optimisations`, { constraints: { includeExternalProviders: false } });
    expect(start.status).toBe(202);
    await h.settle();

    const job = await operator.ok("GET", `/optimisations/${start.body.data.jobId}`);
    expect(job.status).toBe("succeeded");
    const { packages } = await operator.ok("GET", `/trips/${created.id}/packages`);
    expect(packages.length).toBeGreaterThan(0);
    for (const pkg of packages) expect(pkg.package.selections).toHaveLength(3);
  });
});
