#!/usr/bin/env node
/**
 * Development seed. Creates ILLUSTRATIVE demo data through the public API (so every validation,
 * tenant boundary and audit trail applies exactly as in production).
 *
 *   node scripts/seed.mjs [baseUrl]          (default http://localhost:8787, refuses non-local URLs without --force)
 *
 * Everything created here is fictional: hotel names carry "(Demo)", prices are invented, review scores
 * are placeholders. None of it is verified live supplier information.
 */
const BASE = (process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:8787").replace(/\/$/, "");
if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE) && !process.argv.includes("--force")) {
  console.error("Refusing to seed a non-local API without --force.");
  process.exit(1);
}
const PASSWORD = "Demo-Passw0rd1";

function client() {
  let cookie = "";
  const call = async (method, path, body) => {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", "x-requested-with": "tripweave", origin: "http://localhost:3000", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    return { status: res.status, json };
  };
  const ok = async (method, path, body) => {
    const r = await call(method, path, body);
    if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.json)}`);
    return r.json.data;
  };
  return { call, ok };
}

async function signIn(c, email, org, type) {
  const r = await c.call("POST", "/auth/login", { email, password: PASSWORD });
  if (r.status === 200) return false; // already seeded
  await c.ok("POST", "/auth/register", { email, password: PASSWORD, displayName: org.owner, organizationName: org.name, organizationType: type, country: "LK", defaultCurrency: org.currency });
  return true;
}

async function hotel(c, h) {
  const p = await c.ok("POST", "/hotels", { name: h.name, city: h.city, region: h.region, latitude: h.lat, longitude: h.lng, category: h.category, starClassification: h.stars, reviewScore: h.review, amenities: h.amenities, description: `${h.name} is an ILLUSTRATIVE demo property used for development.`, preferredPartner: !!h.preferred });
  const rooms = {};
  for (const r of h.rooms) rooms[r.name] = await c.ok("POST", `/hotels/${p.id}/rooms`, { name: r.name, maximumAdults: r.adults, maximumChildren: 1, maximumOccupancy: r.adults + 1, bedConfiguration: r.beds, amenities: ["air_conditioning"] });
  for (const plan of h.plans) {
    const room = rooms[plan.room];
    const created = await c.ok("POST", `/hotels/${p.id}/rates`, { roomTypeId: room.id, name: plan.name, mealPlan: plan.meal, currency: plan.currency ?? "USD", effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31", cancellationPolicy: { refundable: plan.refundable ?? true, freeCancellationDaysBeforeArrival: plan.freeDays ?? 7 }, paymentTerms: { type: "credit", description: "30 days" } });
    // Low season base rate + a peak-season rule (higher priority wins on overlap) + a special New Year date rate
    await c.ok("POST", `/rate-plans/${created.id}/rules`, { applicableStartDate: "2026-01-01", applicableEndDate: "2027-12-31", amountMinor: plan.price * 100, label: "Base", taxTreatment: { included: false, taxBp: 0, serviceChargeBp: 1000 } });
    await c.ok("POST", `/rate-plans/${created.id}/rules`, { applicableStartDate: "2026-12-15", applicableEndDate: "2027-02-28", amountMinor: Math.round(plan.price * 1.25) * 100, label: "Peak season", priority: 5, taxTreatment: { included: false, taxBp: 0, serviceChargeBp: 1000 } });
    await c.ok("POST", `/rate-plans/${created.id}/rules`, { applicableStartDate: "2026-12-31", applicableEndDate: "2026-12-31", amountMinor: Math.round(plan.price * 1.6) * 100, label: "New Year's Eve", priority: 9, taxTreatment: { included: false, taxBp: 0, serviceChargeBp: 1000 } });
    // Rough stock for the next season so some offers are "confirmed" and others stay "unknown"
    if (h.stock) {
      const entries = Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10), availableQuantity: h.stock }));
      await c.ok("PUT", `/hotels/${p.id}/inventory`, { roomTypeId: room.id, entries });
    }
  }
  return p;
}

const HOTELS = [
  { name: "Lakeside Heritage Kandy (Demo)", city: "Kandy", lat: 7.2906, lng: 80.6437, category: "boutique", stars: 4, review: 9.1, amenities: ["wifi", "pool", "spa", "view", "restaurant"], preferred: true, stock: 6, rooms: [{ name: "Heritage Double", adults: 2, beds: ["1 king"] }], plans: [{ room: "Heritage Double", name: "Contract B&B", meal: "BB", price: 140 }] },
  { name: "Hanthana Budget Inn (Demo)", city: "Kandy", lat: 7.2851, lng: 80.6229, category: "budget", stars: 2, review: 7.0, amenities: ["wifi"], rooms: [{ name: "Standard Twin", adults: 2, beds: ["2 single"] }], plans: [{ room: "Standard Twin", name: "Net B&B", meal: "BB", price: 55, refundable: false }] },
  { name: "Kandy City Comfort (Demo)", city: "Kandy", lat: 7.2936, lng: 80.6413, category: "comfort", stars: 3, review: 8.1, amenities: ["wifi", "pool", "restaurant"], stock: 3, rooms: [{ name: "Deluxe Double", adults: 2, beds: ["1 queen"] }], plans: [{ room: "Deluxe Double", name: "Contract B&B", meal: "BB", price: 105 }, { room: "Deluxe Double", name: "Contract HB", meal: "HB", price: 135 }] },
  { name: "Mist Valley Bungalow (Demo)", city: "Nuwara Eliya", lat: 6.9702, lng: 80.7642, category: "boutique", stars: 4, review: 9.2, amenities: ["wifi", "view", "fireplace", "restaurant"], stock: 4, rooms: [{ name: "Tea Estate Suite", adults: 2, beds: ["1 king"] }], plans: [{ room: "Tea Estate Suite", name: "Contract B&B", meal: "BB", price: 150 }] },
  { name: "Highland Comfort Lodge (Demo)", city: "Nuwara Eliya", lat: 6.96, lng: 80.78, category: "comfort", stars: 3, review: 8.0, amenities: ["wifi", "restaurant"], rooms: [{ name: "Garden Room", adults: 2, beds: ["1 queen"] }], plans: [{ room: "Garden Room", name: "Contract B&B", meal: "BB", price: 110 }] },
  { name: "Grand Colonial Nuwara Eliya (Demo)", city: "Nuwara Eliya", lat: 6.9497, lng: 80.7891, category: "luxury", stars: 5, review: 9.0, amenities: ["wifi", "pool", "spa", "gym", "view", "restaurant"], preferred: true, rooms: [{ name: "Colonial Suite", adults: 2, beds: ["1 king"] }], plans: [{ room: "Colonial Suite", name: "Contract HB", meal: "HB", price: 290 }] },
  { name: "Nine Arches View Ella (Demo)", city: "Ella", lat: 6.8764, lng: 81.0599, category: "comfort", stars: 3, review: 8.4, amenities: ["wifi", "view", "restaurant"], stock: 5, rooms: [{ name: "View Double", adults: 2, beds: ["1 queen"] }], plans: [{ room: "View Double", name: "Contract B&B", meal: "BB", price: 95 }] },
  { name: "Cloud Ridge Retreat Ella (Demo)", city: "Ella", lat: 6.8601, lng: 81.0399, category: "boutique", stars: 4, review: 9.3, amenities: ["wifi", "pool", "view", "spa"], rooms: [{ name: "Ridge Villa", adults: 2, beds: ["1 king"] }], plans: [{ room: "Ridge Villa", name: "Contract B&B", meal: "BB", price: 135 }] },
  { name: "Ella Gap LKR Lodge (Demo)", city: "Ella", lat: 6.87, lng: 81.05, category: "standard", stars: 3, review: 7.6, amenities: ["wifi"], rooms: [{ name: "Twin Room", adults: 2, beds: ["2 single"] }], plans: [{ room: "Twin Room", name: "LKR rate B&B", meal: "BB", price: 24000, currency: "LKR" }] },
  { name: "Galle Fort Courtyard (Demo)", city: "Galle", region: "Southern Province", lat: 6.0269, lng: 80.217, category: "boutique", stars: 4, review: 9.0, amenities: ["wifi", "pool", "spa", "view", "restaurant"], preferred: true, stock: 5, rooms: [{ name: "Fort Double", adults: 2, beds: ["1 king"] }], plans: [{ room: "Fort Double", name: "Contract B&B", meal: "BB", price: 125 }] },
  { name: "Unawatuna Bay Comfort (Demo)", city: "Galle", region: "Southern Province", lat: 6.0106, lng: 80.249, category: "comfort", stars: 3, review: 8.2, amenities: ["wifi", "pool", "view", "restaurant"], stock: 4, rooms: [{ name: "Bay Double", adults: 2, beds: ["1 queen"] }], plans: [{ room: "Bay Double", name: "Contract B&B", meal: "BB", price: 95 }] },
  { name: "South Coast Budget Stay (Demo)", city: "Galle", region: "Southern Province", lat: 6.0535, lng: 80.221, category: "budget", stars: 2, review: 7.4, amenities: ["wifi"], rooms: [{ name: "Standard Double", adults: 2, beds: ["1 double"] }], plans: [{ room: "Standard Double", name: "Net B&B", meal: "BB", price: 60, refundable: false }] },
  { name: "Rock View Sigiriya (Demo)", city: "Sigiriya", lat: 7.9523, lng: 80.7569, category: "comfort", stars: 4, review: 8.2, amenities: ["wifi", "pool", "restaurant"], stock: 4, rooms: [{ name: "Garden Double", adults: 2, beds: ["1 queen"] }], plans: [{ room: "Garden Double", name: "Contract B&B", meal: "BB", price: 100 }] },
];

const c = client();
const fresh = await signIn(c, "demo@tripweave.example", { owner: "Demo Operator", name: "Demo Island Tours", currency: "USD" }, "tour_operator");
if (!fresh) {
  // Keep existing demo data intact, but add newly introduced demo hotels (e.g. South Coast inventory).
  const existing = await c.ok("GET", "/hotels?scope=own&pageSize=100");
  const existingNames = new Set(existing.map((h) => h.name));
  const missing = HOTELS.filter((h) => !existingNames.has(h.name));
  if (missing.length === 0) {
    console.log("Demo organisation already exists – nothing to do. (Delete .wrangler/state to reseed from scratch.)");
    process.exit(0);
  }
  for (const h of missing) await hotel(c, h);
  console.log(`• added ${missing.length} missing demo hotel(s) to the existing organisation`);
  process.exit(0);
}
console.log("• created tour operator 'Demo Island Tours'  (demo@tripweave.example / " + PASSWORD + ")");

await c.ok("PUT", "/organization/fx", { pivot: "USD", rates: { LKR: "300.00", EUR: "0.92", GBP: "0.79" }, source: "demo seed (illustrative)" });
await c.ok("PUT", "/organization/pricing", { mode: "target_margin", targetMarginBp: 2000, maxDiscountBp: 500, approvalMarginFloorBp: 1000, sellingTaxBp: 0, paymentFeeBp: 0, roundTo: "unit" });
await c.ok("PATCH", "/organization", { branding: { productName: "Demo Island Tours", primaryColor: "#14443c", accentColor: "#b8943f", contactEmail: "hello@demo-island-tours.example", contactPhone: "+94 11 000 0000", website: "demo-island-tours.example", address: "1 Demo Street, Colombo", quoteFooter: "Illustrative demo quotation – not a real offer." } });

const supplier = await c.ok("POST", "/suppliers", { name: "Hill Hotels Direct (Demo)", providerKey: "direct_demo", supplierType: "direct_hotel" });
await c.ok("POST", "/agreements", { supplierId: supplier.id, contractReference: "DEMO-2026-A", currency: "USD", effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31", commissionBp: 0, termsReference: "Illustrative agreement" });
for (const h of HOTELS) await hotel(c, h);
console.log(`• created ${HOTELS.length} demo hotels with room types, B&B/HB contract rate plans, peak-season and date-specific rules, and stock`);

const hotelCo = client();
await signIn(hotelCo, "hotels@tripweave.example", { owner: "Demo Hotelier", name: "Demo Hill Hotels", currency: "USD" }, "hotel_management");
const shared = await hotel(hotelCo, { name: "Demo Hill Hotels Flagship (Demo)", city: "Nuwara Eliya", lat: 6.9532, lng: 80.7733, category: "premium", stars: 5, review: 8.8, amenities: ["wifi", "pool", "spa", "gym", "view"], rooms: [{ name: "Premier Room", adults: 2, beds: ["1 king"] }], plans: [{ room: "Premier Room", name: "Partner net B&B", meal: "BB", price: 170 }] });
const demoOrg = await c.ok("GET", "/organization");
await hotelCo.ok("POST", "/partners/shared", { receivingOrganizationId: demoOrg.id, resourceType: "property", resourceId: shared.id, permittedRateScope: "net_rates", validFrom: "2026-01-01", validUntil: "2027-12-31" });
console.log("• created hotel company 'Demo Hill Hotels' (hotels@tripweave.example) and shared one property with the tour operator");

const customer = await c.ok("POST", "/customers", { name: "Jane Traveller (Demo)", email: "jane.traveller@example.com", country: "GB", notes: "Illustrative customer" });
await c.ok("POST", "/customers", { name: "Kenji Sato (Demo)", email: "kenji.sato@example.com", country: "JP" });
const enquiry = "We are two adults visiting Sri Lanka for four days from 10 December 2026. We want to visit Sigiriya, Kandy, Nuwara Eliya, and Ella. We prefer comfortable boutique hotels with breakfast included. Our accommodation budget is approximately USD 450 for three nights. We prefer scenic properties, good reviews, and reasonable driving times.";
const trip = await c.ok("POST", "/trips", { customerId: customer.id, title: "Hill country escape (Demo)", description: enquiry, party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] }, budgetCurrency: "USD" });
const parsed = await c.ok("POST", `/trips/${trip.id}/parse`, { text: enquiry, apply: true });
console.log(`• parsed the sample enquiry (${parsed.engine}); open questions: ${parsed.questions.length}`);
const it = await c.ok("GET", `/trips/${trip.id}/itinerary`);
await c.ok("PUT", `/trips/${trip.id}/itinerary`, { title: "Hill country (confirmed overnight plan)", confirm: true, stops: it.itinerary.stops.map((s) => ({ destination: s.destination, arrivalDate: s.arrivalDate, departureDate: s.departureDate, latitude: s.latitude, longitude: s.longitude, activities: [] })) });
await c.ok("PATCH", `/trips/${trip.id}`, { budgetAmountMinor: 90000, budgetScope: "accommodation_only" });
const { jobId } = await c.ok("POST", `/trips/${trip.id}/optimisations`, { constraints: { includeExternalProviders: false } });
let job;
for (let i = 0; i < 60; i++) {
  job = await c.ok("GET", `/optimisations/${jobId}`);
  if (["succeeded", "failed", "infeasible"].includes(job.status)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(`• optimisation ${job.status}`);
if (job.status === "succeeded") {
  const { packages } = await c.ok("GET", `/trips/${trip.id}/packages`);
  const q = await c.ok("POST", "/quotes", { tripRequestId: trip.id, packageId: packages.find((p) => p.objective === "best_value")?.id ?? packages[0].id });
  console.log(`• drafted sample quotation ${q.quoteNumber} from the Best Value package`);
}
console.log("\nSeed complete. Sign in at http://localhost:3000/login as demo@tripweave.example (password: " + PASSWORD + ").");
