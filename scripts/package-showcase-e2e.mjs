/**
 * Browser end-to-end check for the AI package story on the trip packages page.
 *
 * Start the two servers first:
 *   1. API:  pnpm --filter @tripweave/api exec tsx test/e2e/serve.ts          (port 8787)
 *   2. Web:  API_BASE_URL=http://localhost:8787 pnpm --filter @tripweave/web dev   (port 3000)
 *
 * Then run:  node scripts/package-showcase-e2e.mjs <screenshot-directory>
 *
 * Seeds an organisation, hotel inventory, a trip and an itinerary through the real API, runs an optimisation
 * and then drives the packages page. Every price shown in the story is checked against the packages the API
 * returned, so the run fails if the page ever shows a number the server did not supply.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const WEB = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const API = process.env.E2E_API_URL ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? join(process.cwd(), "package-showcase-e2e-screenshots");
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  — ${detail}` : ""}`);
}

async function api(method, path, body, cookie) {
  const response = await fetch(`${API}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", "x-requested-with": "tripweave", origin: WEB, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json, cookies: response.headers.getSetCookie() };
}

const HOTELS = [
  { name: "Lakeside Heritage Kandy", city: "Kandy", lat: 7.2906, lng: 80.6437, price: 150, category: "boutique", review: 9.1, amenities: ["wifi", "pool", "spa", "view"], preferred: true },
  { name: "Kandy City Comfort", city: "Kandy", lat: 7.2936, lng: 80.6413, price: 110, category: "comfort", review: 8.1 },
  { name: "Kandy Budget Stay", city: "Kandy", lat: 7.2851, lng: 80.6229, price: 60, category: "budget", review: 6.8, amenities: ["wifi"], refundable: false },
  { name: "Nine Arches View Ella", city: "Ella", lat: 6.8764, lng: 81.0599, price: 100, category: "comfort", review: 8.4, amenities: ["wifi", "view"] },
  { name: "Cloud Ridge Retreat Ella", city: "Ella", lat: 6.8601, lng: 81.0399, price: 140, category: "boutique", review: 9.3, amenities: ["wifi", "pool", "view", "spa"] },
  { name: "Ella Backpackers", city: "Ella", lat: 6.8667, lng: 81.0466, price: 55, category: "budget", review: 7.4, amenities: ["wifi"] },
];

async function createHotel(cookie, h) {
  const property = (await api("POST", "/hotels", { name: h.name, city: h.city, latitude: h.lat, longitude: h.lng, category: h.category, reviewScore: h.review, amenities: h.amenities ?? ["wifi", "pool"], preferredPartner: h.preferred ?? false }, cookie)).json.data;
  const room = (await api("POST", `/hotels/${property.id}/rooms`, { name: "Deluxe Double", maximumAdults: 2, maximumOccupancy: 3 }, cookie)).json.data;
  const plan = (await api("POST", `/hotels/${property.id}/rates`, {
    roomTypeId: room.id,
    name: "BB contract",
    mealPlan: "BB",
    currency: "USD",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-12-31",
    cancellationPolicy: { refundable: h.refundable ?? true, freeCancellationDaysBeforeArrival: 7 },
  }, cookie)).json.data;
  await api("POST", `/rate-plans/${plan.id}/rules`, { applicableStartDate: "2026-01-01", applicableEndDate: "2027-12-31", amountMinor: Math.round(h.price * 100) }, cookie);
}

async function seed() {
  const email = `package-e2e-${Date.now()}@tripweave.test`;
  const registered = await api("POST", "/auth/register", {
    email,
    password: "Passw0rd-Test1",
    displayName: "Package E2E",
    organizationName: "E2E Package Tours",
    organizationType: "tour_operator",
    country: "LK",
    defaultCurrency: "USD",
  });
  if (registered.status !== 201) throw new Error(`register failed: ${registered.status} ${JSON.stringify(registered.json).slice(0, 200)}`);
  const session = registered.cookies.map((cookie) => cookie.split(";")[0]).find((pair) => pair.startsWith("tw_session="));
  if (!session) throw new Error("no session cookie returned");
  await api("PUT", "/organization/integrations", { externalProviders: { hotelbeds: false } }, session);
  for (const hotel of HOTELS) await createHotel(session, hotel);
  const trip = await api("POST", "/trips", {
    title: "Kandy and Ella",
    party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0, childAges: [] }] },
    budgetCurrency: "USD",
    budgetAmountMinor: 150_000,
    budgetScope: "accommodation_only",
    arrivalDate: "2027-03-05",
    departureDate: "2027-03-11",
  }, session);
  if (trip.status !== 201) throw new Error(`trip create failed: ${trip.status} ${JSON.stringify(trip.json).slice(0, 200)}`);
  const tripId = trip.json.data.id;
  const itinerary = await api("PUT", `/trips/${tripId}/itinerary`, {
    confirm: true,
    stops: [
      { destination: "Kandy", arrivalDate: "2027-03-05", departureDate: "2027-03-08" },
      { destination: "Ella", arrivalDate: "2027-03-08", departureDate: "2027-03-11" },
    ],
  }, session);
  if (itinerary.status >= 300) throw new Error(`itinerary save failed: ${itinerary.status} ${JSON.stringify(itinerary.json).slice(0, 200)}`);
  const job = await api("POST", `/trips/${tripId}/optimisations`, { constraints: { includeExternalProviders: false } }, session);
  if (job.status >= 300) throw new Error(`optimisation failed to start: ${job.status} ${JSON.stringify(job.json).slice(0, 200)}`);
  const deadline = Date.now() + 60_000;
  let packages = [];
  while (Date.now() < deadline) {
    packages = (await api("GET", `/trips/${tripId}/packages`, undefined, session)).json.data.packages;
    if (packages.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (packages.length === 0) throw new Error("the optimisation produced no packages");
  return { tripId, session: session.slice("tw_session=".length), packages };
}

/** The en-US figure the packages page renders for a minor-unit amount, so the check reads the same text. */
function formatted(minor) {
  return (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function openPackages(browser, seeded, viewport) {
  const context = await browser.newContext({ viewport, colorScheme: "light" });
  await context.addCookies([{ name: "tw_session", value: seeded.session, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource: the server responded with a status of (404|403)/.test(message.text())) errors.push(message.text());
  });
  await page.goto(`${WEB}/trips/${seeded.tripId}/packages`, { waitUntil: "domcontentloaded" });
  return { context, page, errors };
}

async function desktopRun(browser, seeded) {
  const { context, page, errors } = await openPackages(browser, seeded, { width: 1280, height: 900 });
  try {
    const story = page.getByRole("heading", { name: "The packages, explained" });
    check("the AI package story renders on the packages page", await story.waitFor({ timeout: 60_000 }).then(() => true, () => false));
    check("the composed headline comes from the generated presentation", await page.getByText("Your Kandy and Ella packages").isVisible());
    const lead = seeded.packages[0];
    check("the recommended package is marked and carries its server selling price", await page.getByText("Recommended").first().isVisible());
    const price = lead.pricing?.sellingPriceMinor;
    check("the selling price on screen equals the server's price", price !== undefined && (await page.getByText(formatted(price), { exact: false }).count()) > 0, `expected ${formatted(price)}`);
    const hotelName = lead.package.selections[0].offer.property.name;
    check("hotel names come from the server offers", (await page.getByText(hotelName).count()) > 0, `missing ${hotelName}`);
    check("the live status is stated from the server verification", (await page.getByText(/Live checked until|Not live checked yet|The live check expired/).count()) > 0);
    check("the package comparison is interactive", await page.getByRole("button", { name: "Per traveller" }).first().isVisible());
    await page.getByRole("button", { name: "Per traveller" }).first().click();
    check("switching to per traveller keeps the page consistent", (await page.getByText("Per traveller").count()) > 0);
    await page.getByRole("button", { name: "Show in packages" }).first().click();
    await page.waitForTimeout(800);
    check("Show in packages scrolls to the package card in the standard list", await page.evaluate(() => {
      const card = document.querySelector('[id^="pkgcard-"]');
      if (!card) return false;
      const top = card.getBoundingClientRect().top;
      return top < window.innerHeight && top > -card.getBoundingClientRect().height;
    }));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS, "1-packages-desktop.png"), fullPage: true });
    check("no uncaught errors or console errors on the desktop run", errors.length === 0, errors.slice(0, 3).join(" | "));
  } finally {
    await context.close();
  }
}

async function mobileRun(browser, seeded) {
  const { context, page, errors } = await openPackages(browser, seeded, { width: 390, height: 844 });
  try {
    await page.getByRole("heading", { name: "The packages, explained" }).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no horizontal page scroll at 390px", overflow <= 1, `overflow ${overflow}px`);
    await page.screenshot({ path: join(SHOTS, "2-packages-mobile.png"), fullPage: true });
    check("no uncaught errors on the mobile run", errors.length === 0, errors.slice(0, 3).join(" | "));
  } finally {
    await context.close();
  }
}

async function main() {
  const seeded = await seed();
  const executablePath = process.env.E2E_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium-1243/chrome-linux64/chrome") ? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome" : undefined);
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  try {
    await desktopRun(browser, seeded);
    await mobileRun(browser, seeded);
  } finally {
    await browser.close();
  }
  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`Screenshots: ${SHOTS}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
