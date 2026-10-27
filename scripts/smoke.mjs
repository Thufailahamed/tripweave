#!/usr/bin/env node
/**
 * End-to-end smoke test against a RUNNING API (local `wrangler dev` or a deployed Worker).
 *   node scripts/smoke.mjs [baseUrl]        (default http://localhost:8787)
 * It registers a throw-away organisation, creates hotels + rates, runs the optimisation pipeline
 * (Queue -> Workflow -> D1 when bound), builds a quotation and opens the public client link.
 */
const BASE = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
let cookie = "";

async function call(method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", "x-requested-with": "tripweave", origin: process.env.SMOKE_ORIGIN ?? "http://localhost:3000", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}
async function ok(method, path, body) {
  const r = await call(method, path, body);
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${r.text.slice(0, 300)}`);
  return r.json.data;
}
const step = (m) => console.log(`• ${m}`);
const assert = (c, m) => { if (!c) throw new Error(`ASSERTION FAILED: ${m}`); };

const suffix = Math.random().toString(36).slice(2, 8);
step(`registering smoke-${suffix}`);
await ok("POST", "/auth/register", { email: `smoke-${suffix}@example.com`, password: "Smoke-Passw0rd1", displayName: "Smoke", organizationName: `Smoke ${suffix}`, organizationType: "tour_operator", country: "LK", defaultCurrency: "USD" });

const hotels = [
  ["Smoke Kandy Budget", "Kandy", 7.2851, 80.6229, 60, "budget"], ["Smoke Kandy Boutique", "Kandy", 7.2906, 80.6437, 150, "boutique"], ["Smoke Kandy Luxury", "Kandy", 7.3, 80.65, 280, "luxury"],
  ["Smoke Ella Budget", "Ella", 6.8667, 81.0466, 55, "budget"], ["Smoke Ella Boutique", "Ella", 6.8601, 81.0399, 140, "boutique"], ["Smoke Ella Luxury", "Ella", 6.87, 81.05, 260, "luxury"],
];
for (const [name, city, lat, lng, price, category] of hotels) {
  const p = await ok("POST", "/hotels", { name, city, latitude: lat, longitude: lng, category, reviewScore: category === "luxury" ? 9.4 : category === "boutique" ? 9 : 7, amenities: ["wifi", "pool"] });
  const r = await ok("POST", `/hotels/${p.id}/rooms`, { name: "Double", maximumAdults: 2, maximumOccupancy: 3 });
  const plan = await ok("POST", `/hotels/${p.id}/rates`, { roomTypeId: r.id, name: "BB", mealPlan: "BB", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31" });
  await ok("POST", `/rate-plans/${plan.id}/rules`, { applicableStartDate: "2026-01-01", applicableEndDate: "2027-12-31", amountMinor: price * 100 });
}
step(`created ${hotels.length} hotels with contract rates`);

const customer = await ok("POST", "/customers", { name: "Smoke Traveller", email: "traveller@example.com" });
const trip = await ok("POST", "/trips", { customerId: customer.id, title: "Smoke trip", arrivalDate: "2026-12-10", departureDate: "2026-12-12", budgetAmountMinor: 90000, budgetCurrency: "USD", party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] } });
await ok("PUT", `/trips/${trip.id}/itinerary`, { confirm: true, stops: [{ destination: "Kandy", arrivalDate: "2026-12-10", departureDate: "2026-12-11" }, { destination: "Ella", arrivalDate: "2026-12-11", departureDate: "2026-12-12" }] });
step("itinerary confirmed");

const { jobId } = await ok("POST", `/trips/${trip.id}/optimisations`, { constraints: { includeExternalProviders: false } });
step(`optimisation job ${jobId} queued`);
let job;
for (let i = 0; i < 60; i++) {
  job = await ok("GET", `/optimisations/${jobId}`);
  if (["succeeded", "failed", "infeasible", "cancelled"].includes(job.status)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert(job.status === "succeeded", `job finished as ${job.status}: ${job.errorSummary ?? ""}`);
step(`job succeeded (${job.stage})`);

const { packages } = await ok("GET", `/trips/${trip.id}/packages`);
assert(packages.length >= 2, "expected at least two packages");
step(`${packages.length} packages: ${packages.map((p) => `${p.objective}=${p.pricing.sellingPriceMinor / 100}`).join(", ")}`);

const quote = await ok("POST", "/quotes", { tripRequestId: trip.id, packageId: packages[0].id });
const sent = await ok("POST", `/quotes/${quote.id}/send`, { expiresInDays: 7, email: false });
step(`quote ${quote.quoteNumber} sent`);
const token = sent.token;
const page = await call("GET", `/public/quotes/${token}`);
assert(page.status === 200, "public link should open");
const lower = page.text.toLowerCase();
for (const f of ["margin", "unitcost", "totalcost", "supplier", "contract", "internalnotes"]) assert(!lower.includes(f), `public view leaked "${f}"`);
step("public client link works and hides internal data");

const pdf = await fetch(`${BASE}/api/v1/public/quotes/${token}/pdf`);
const bytes = new Uint8Array(await pdf.arrayBuffer());
assert(pdf.status === 200 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-", "PDF should render under the Workers runtime");
step(`PDF rendered (${bytes.length} bytes)`);

const accept = await call("POST", `/public/quotes/${token}/respond`, { decision: "accept", acceptedByName: "Smoke Traveller", acceptedByEmail: "traveller@example.com" });
assert(accept.status === 200, "client acceptance should succeed");
step("client accepted the quotation");
console.log("\nSMOKE TEST PASSED");
