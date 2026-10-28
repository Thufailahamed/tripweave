#!/usr/bin/env node
/**
 * End-to-end smoke for the individual traveller surface against a running API.
 * It registers a disposable traveller, creates a trip, saves an itinerary, adds a
 * budget line, generates packing, writes a note, shares the trip, opens the public
 * page and revokes the share. No live supplier or model is needed.
 *
 * Usage: API_BASE_URL=http://localhost:8787 node scripts/traveler-smoke.mjs
 */
const base = (process.env.API_BASE_URL ?? "http://localhost:8787").replace(/\/$/, "");
let cookie = "";

async function request(method, path, body) {
  const headers = { accept: "application/json", "x-requested-with": "tripweave", origin: "http://localhost:3000" };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${base}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function ok(method, path, body) {
  const result = await request(method, path, body);
  if (result.status >= 300) throw new Error(`${method} ${path} -> ${result.status}: ${JSON.stringify(result.json).slice(0, 500)}`);
  return result.json.data;
}

const email = `traveler-smoke-${Date.now()}@example.com`;
const password = "Travel-Pass1";
const session = await ok("POST", "/auth/register-traveler", {
  email,
  password,
  displayName: "Smoke Traveller",
  country: "LK",
  defaultCurrency: "USD",
  timezone: "Asia/Colombo",
  homeCity: "Colombo",
  interests: ["tea", "trains"],
  pace: "balanced",
});
assert(session.organization?.accountKind === "individual", "expected a personal workspace");
assert(session.organization?.role === "staff", "expected the restricted staff role");
console.log("✓ registered a personal workspace");

const trip = await ok("POST", "/trips", {
  title: "Smoke test: hills and coast",
  description: "A short trip made by the traveller smoke script.",
  arrivalDate: "2026-12-10",
  departureDate: "2026-12-14",
  party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] },
  budgetAmountMinor: 180_000,
  budgetCurrency: "USD",
  budgetScope: "all_inclusive_trip",
});
await ok("PUT", `/trips/${trip.id}/itinerary`, {
  title: "Hills and coast",
  confirm: true,
  stops: [
    { destination: "Kandy", latitude: 7.2906, longitude: 80.6437, arrivalDate: "2026-12-10", departureDate: "2026-12-12", activities: ["Temple of the Tooth", "Market walk"] },
    { destination: "Ella", latitude: 6.8667, longitude: 81.0466, arrivalDate: "2026-12-12", departureDate: "2026-12-14", activities: ["Little Adam's Peak hike"] },
  ],
});
console.log("✓ created a trip and confirmed an itinerary");

const budget = await ok("POST", `/traveler/trips/${trip.id}/budget`, { label: "Train to Kandy", category: "transport", amountMinor: 4_500, isPaid: true });
assert(budget.amountMinor === 4_500, "budget amount did not round-trip");
const packing = await ok("POST", `/traveler/trips/${trip.id}/packing/generate`, {});
assert(packing.items.some((item) => item.label === "Walking shoes"), "activity-aware packing item missing");
const note = await ok("POST", `/traveler/trips/${trip.id}/notes`, { body: "The 9:45 train is the one with the open windows." });
assert(note.body.includes("9:45"), "note did not save");
console.log("✓ added budget, packing and a note");

const share = await ok("POST", `/traveler/trips/${trip.id}/shares`, { expiresInDays: 30, includeBudget: true });
const token = share.url.split("/t/")[1];
assert(token && token.length >= 30, "share URL did not contain a token");
const publicTrip = await ok("GET", `/public/trips/${token}`);
assert(publicTrip.trip.title === "Smoke test: hills and coast", "public trip title mismatch");
assert(publicTrip.budget?.totalMinor === 4_500, "public budget summary mismatch");
assert(!("organizationId" in publicTrip), "public view leaked an organization id");
console.log("✓ shared the trip read-only and opened it anonymously");

const shares = await ok("GET", `/traveler/trips/${trip.id}/shares`);
assert(shares.shares.length === 1, "expected one active share");
await ok("DELETE", `/traveler/trips/${trip.id}/shares/${shares.shares[0].id}`);
const revoked = await request("GET", `/public/trips/${token}`);
assert(revoked.status === 404, "revoked share should return 404");
console.log("✓ revoked the share; the public link now returns 404");
console.log(`\nTraveller smoke passed for ${email} (trip ${trip.id}).`);
