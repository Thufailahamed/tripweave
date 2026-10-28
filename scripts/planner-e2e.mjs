#!/usr/bin/env node
/**
 * Browser end-to-end check for the AI planner on a trip page.
 *
 * Start the two servers first (see the usage line printed when this script fails to connect):
 *   1. API:  pnpm --filter @tripweave/api exec tsx test/e2e/serve.ts          (port 8787)
 *   2. Web:  API_BASE_URL=http://localhost:8787 pnpm --filter @tripweave/web dev   (port 3000)
 * Then run:  node scripts/planner-e2e.mjs <screenshot-directory>
 *
 * Seeds an organisation, a trip and an itinerary through the real API, then drives the trip page in
 * Chromium and checks every block the planner can generate, the photographs, the maps and each
 * interaction. Exits non-zero if any check fails.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const WEB = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const API = process.env.E2E_API_URL ?? "http://localhost:8787";
const SHOTS = process.argv[2] ?? join(process.cwd(), "planner-e2e-screenshots");
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
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
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  const cookies = response.headers.getSetCookie();
  return { status: response.status, json, cookies };
}

async function seed() {
  const email = `planner-e2e-${Date.now()}@tripweave.test`;
  const registered = await api("POST", "/auth/register", {
    email,
    password: "Passw0rd-Test1",
    displayName: "Planner E2E",
    organizationName: "E2E Island Tours",
    organizationType: "tour_operator",
    country: "LK",
    defaultCurrency: "USD",
  });
  if (registered.status !== 201) throw new Error(`register failed: ${registered.status} ${JSON.stringify(registered.json).slice(0, 200)}`);
  const session = registered.cookies.map((cookie) => cookie.split(";")[0]).find((pair) => pair.startsWith("tw_session="));
  if (!session) throw new Error("no session cookie returned");
  const trip = await api(
    "POST",
    "/trips",
    {
      title: "Kandy and Ella",
      party: { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0, childAges: [] }] },
      budgetCurrency: "USD",
      budgetAmountMinor: 400000,
      budgetScope: "accommodation_only",
      arrivalDate: "2027-03-05",
      departureDate: "2027-03-15",
    },
    session,
  );
  if (trip.status !== 201) throw new Error(`trip create failed: ${trip.status} ${JSON.stringify(trip.json).slice(0, 200)}`);
  const tripId = trip.json.data.id;
  const itinerary = await api(
    "PUT",
    `/trips/${tripId}/itinerary`,
    {
      confirm: true,
      stops: [
        { destination: "Kandy", arrivalDate: "2027-03-05", departureDate: "2027-03-08" },
        { destination: "Ella", arrivalDate: "2027-03-08", departureDate: "2027-03-15" },
      ],
    },
    session,
  );
  if (itinerary.status >= 300) throw new Error(`itinerary save failed: ${itinerary.status} ${JSON.stringify(itinerary.json).slice(0, 200)}`);
  return { tripId, session: session.slice("tw_session=".length) };
}

/** Waits briefly for an element to appear; resolves to a boolean so the check can report it. */
async function shows(locator, timeout = 15_000) {
  return locator.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
}

async function waitForCount(locator, count, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await locator.count()) >= count) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

/** Cards inside the planner whose content is wider than their box (horizontal scroll areas excluded). */
async function overflowingCards(page) {
  return page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll(".tw-planner article, .tw-planner section"));
    return boxes
      // Boxes that hold a horizontal scroller bleed by design (shadows stay unclipped); only their content is checked.
      .filter((element) => !element.closest(".pl-scroll, .overflow-x-auto") && !element.querySelector(".pl-scroll, .overflow-x-auto") && element.scrollWidth > element.clientWidth + 2)
      .map((element) => (element.getAttribute("aria-label") || element.className || element.tagName).toString().slice(0, 60));
  });
}

/** True once the image has decoded real pixels (not a broken or missing file). */
async function imageLoaded(locator) {
  return locator.evaluate((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0).catch(() => false);
}

async function waitForImages(page, selector, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const loaded = await page.$$eval(selector, (nodes) => nodes.filter((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0).length).catch(() => 0);
    if (loaded > 0) return loaded;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return 0;
}

async function main() {
  let seeded;
  try {
    seeded = await seed();
  } catch (error) {
    console.error(`Could not seed through ${API}. Is the API server running? ${error.message}`);
    process.exit(2);
  }
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
  if (failed.length > 0) process.exit(1);
}

async function openPlanner(browser, seeded, viewport, scheme = "light") {
  const context = await browser.newContext({ viewport, colorScheme: scheme });
  await context.addCookies([{ name: "tw_session", value: seeded.session, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  const posts = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource: the server responded with a status of (404|403)/.test(message.text())) errors.push(message.text());
  });
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/planning")) posts.push(request.postData() ?? "");
  });
  await page.goto(`${WEB}/trips/${seeded.tripId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Kandy and Ella" }).first().waitFor({ timeout: 60_000 });
  await page.getByRole("tab", { name: "AI planner" }).click();
  await page.getByText("What shall we plan next?").waitFor({ timeout: 30_000 });
  return { context, page, errors, posts };
}

async function ask(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function sendMessage(page, text) {
  await page.getByLabel("Message the planning assistant").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}

async function desktopRun(browser, seeded) {
  const { context, page, errors, posts } = await openPlanner(browser, seeded, { width: 1280, height: 900 });
  check("trip page loads the saved trip and the AI planner tab", await shows(page.getByText("Kandy and Ella").first()));
  const starterLabels = ["Show the trip at a glance", "What next?", "Best time for Kandy", "A relaxed day in Kandy", "Map the places to see", "Things to see and do", "What should we pack?"];
  const starterCount = await page.getByRole("button", { name: /^(Show the trip at a glance|What next\?|Best time for Kandy|A relaxed day in Kandy|Map the places to see|Things to see and do|What should we pack\?)$/ }).count();
  check("welcome offers six starters", starterCount === 6, `found ${starterCount} of ${starterLabels.length} starter labels`);

  const welcomePhotos = await waitForImages(page, "img[src*='wikimedia']", 30_000);
  check("stop photographs load as real Wikimedia images on the welcome screen", welcomePhotos >= 1, `loaded ${welcomePhotos}`);
  await page.screenshot({ path: join(SHOTS, "1-welcome-desktop.png"), fullPage: true });

  // Map reply: PlaceMap plots located places, numbered markers, chips and a selectable detail card.
  await ask(page, "Map the places to see");
  check("map question renders a PlaceMap with a map region", await page.getByRole("region", { name: "Map of the places" }).waitFor({ timeout: 30_000 }).then(() => true, () => false));
  check("map reports the three located places out of four", await shows(page.getByText("3 of 4 located")));
  check("map draws numbered markers for the located places", (await waitForCount(page.locator(".leaflet-marker-icon"), 3)));
  check("map loads real OpenStreetMap tiles", await waitForCount(page.locator(".leaflet-tile-loaded"), 1, 25_000));
  check("unlocated places are listed honestly", await shows(page.getByText("Not on the map: Atlantis, Sri Lanka")));
  const jump = page.getByRole("group", { name: "Jump to a place on the map" });
  await jump.getByRole("button", { name: /Ella, Sri Lanka/ }).click();
  check("selecting a place chip marks it active", (await jump.getByRole("button", { name: /Ella, Sri Lanka/ }).getAttribute("aria-pressed")) === "true");
  check("the selected place shows its Wikipedia description", await shows(page.getByText("Ella is a small town in the Badulla District")));
  const mapPlaces = await waitForImages(page, "article img[src*='wikimedia']", 20_000);
  check("the selected place shows a real photograph", mapPlaces >= 1, `loaded ${mapPlaces}`);
  check("header chips render as a summary list", await shows(page.getByRole("list", { name: "Summary" }).getByText("Walking + transit")));
  check("route renders as a numbered stop-by-stop timeline", await shows(page.getByText("Your route, stop by stop")));
  const stopPhotos = await waitForImages(page, "ol img[src*='wikimedia']", 20_000);
  check("route stop photographs load as real images", stopPhotos >= 2, `loaded ${stopPhotos}`);
  await page.getByRole("button", { name: "Mark as visited" }).first().click();
  check("marking a route stop visited toggles it", await shows(page.getByRole("button", { name: "Visited" })));
  const beforeDirections = posts.length;
  await page.getByRole("button", { name: "Directions" }).first().click();
  await page.waitForTimeout(400);
  check("route stop directions send a question", posts.length > beforeDirections && posts.at(-1).includes("How do I get to Kandy, Sri Lanka from the previous stop?"));
  await page.getByRole("button", { name: "Fit route" }).first().click();
  await page.getByRole("button", { name: "Expand map" }).first().click();
  const fullScreen = page.getByRole("dialog", { name: /full screen/ });
  check("expanded map opens full screen", await shows(fullScreen));
  check("full-screen map keeps its numbered markers", await waitForCount(fullScreen.locator(".leaflet-marker-icon"), 3));
  check("markers show their place names on wide screens", await waitForCount(page.locator(".leaflet-tooltip.tw-map-label"), 3));
  await page.keyboard.press("Escape");
  check("Escape closes the full-screen map", (await page.getByRole("dialog", { name: /full screen/ }).count()) === 0);
  const overflowDesktop = await overflowingCards(page);
  check("no card content overflows its box on desktop", overflowDesktop.length === 0, overflowDesktop.slice(0, 3).join(" | "));
  await page.screenshot({ path: join(SHOTS, "2-map-desktop.png"), fullPage: true });

  const postsBefore = posts.length;
  await page.getByRole("button", { name: "Route to next stop" }).click();
  await page.waitForTimeout(400);
  check("route-to-next-stop sends a follow-up question to the assistant", posts.length > postsBefore && posts.at(-1).includes("How do I get from Ella, Sri Lanka to Kandy"));

  // Best-time reply: photo gallery, facts, comparison, caution and follow-ups.
  await sendMessage(page, "Best time to visit Kandy");
  check("best-time question renders the travel guide headline", await page.getByText("Kandy in the cool season").waitFor({ timeout: 30_000 }).then(() => true, () => false));
  check("PlaceGallery shows three places", (await page.getByRole("button", { name: /Sigiriya, Sri Lanka/ }).count()) >= 1);
  const galleryPhotos = await waitForImages(page, "button img[src*='wikimedia']", 20_000);
  check("gallery photographs load as real images", galleryPhotos >= 1, `loaded ${galleryPhotos}`);
  await page.getByRole("button", { name: /Galle, Sri Lanka/ }).click();
  check("selecting a gallery place shows its description", await shows(page.getByText("Galle is a historic port city")));
  check("KeyFacts renders label and value pairs", await shows(page.getByText("Best season").first()));
  check("ComparisonTable renders its columns", await shows(page.getByRole("columnheader", { name: "Nuwara Eliya" })));
  check("caution callout is announced as a note", await shows(page.getByRole("note").filter({ hasText: "Check entry and health advice" })));
  await page.screenshot({ path: join(SHOTS, "3-guide-desktop.png"), fullPage: true });

  // Relaxed-day reply: placeCard without a photograph falls back to generated artwork; day plan ticks.
  await sendMessage(page, "A relaxed day in Kandy");
  check("day plan renders with its activities", await page.getByText("Start the climb before sunrise").waitFor({ timeout: 30_000 }).then(() => true, () => false));
  check("place without a free photograph shows generated artwork", await shows(page.getByRole("img", { name: "Little Adam's Peak, Sri Lanka illustration" })));
  await page.getByRole("button", { name: /Start the climb before sunrise/ }).click();
  check("ticking an activity marks it done", (await page.getByRole("button", { name: /Start the climb before sunrise/ }).getAttribute("aria-pressed")) === "true");
  check("day progress updates after ticking", await shows(page.getByText("1 of 2 ticked off")));
  const beforeAdjust = posts.length;
  await page.getByRole("button", { name: "Adjust this day" }).last().click();
  check("adjust-this-day asks the assistant to rework the day", posts.length > beforeAdjust && posts.at(-1).includes("Rework Afternoon (Tea and rest)"));

  // Packing reply: tickable checklist and caution.
  await sendMessage(page, "What should we pack?");
  const packing = page.getByRole("checkbox", { name: "Light layers and a rain jacket" });
  check("packing checklist renders", await packing.waitFor({ timeout: 30_000 }).then(() => true, () => false));
  await packing.check();
  check("ticking a packing item checks it", await packing.isChecked());
  check("checklist progress updates", await shows(page.getByText("1 of 3", { exact: true })));

  // Follow-up chips send the question back to the assistant.
  const beforeFollowUp = posts.length;
  await page.getByRole("button", { name: "How do I get from Nuwara Eliya to Ella?" }).last().click();
  check("follow-up chip sends the question", posts.length > beforeFollowUp && posts.at(-1).includes("How do I get from Nuwara Eliya to Ella?"));

  // Trip-grounded overview: TripHero, TripMap and timeline use the saved itinerary.
  await sendMessage(page, "Show the trip at a glance");
  check("trip overview renders the saved itinerary map", await waitForCount(page.locator(".leaflet-container"), 1, 25_000));
  check("trip overview renders the trip hero", await page.getByText("Kandy and Ella at a glance").waitFor({ timeout: 20_000 }).then(() => true, () => false));
  await page.screenshot({ path: join(SHOTS, "4-trip-overview-desktop.png"), fullPage: true });

  // Repair: an invalid first reply is replaced by a valid one without a fallback notice.
  await sendMessage(page, "[fail-once] best time to visit Galle");
  check("an invalid first reply is repaired into the travel guide", await page.getByText("Kandy in the cool season").last().waitFor({ timeout: 30_000 }).then(() => true, () => false));
  check("a repaired reply shows no fallback notice", (await page.getByText("Generated interface rejected").count()) <= 1);

  // Fallback: two invalid replies end in the standard view with a clear notice.
  await sendMessage(page, "[fail-always] show me everything");
  check("two invalid replies show the standard-view fallback", await page.getByText("Generated interface rejected").last().waitFor({ timeout: 30_000 }).then(() => true, () => false));

  // Off-topic: the assistant declines politely and offers travel questions.
  await sendMessage(page, "Write me a python script");
  check("off-topic questions get a travel-focused reply", await page.getByText("That question is outside travel planning").waitFor({ timeout: 30_000 }).then(() => true, () => false));

  // Theme: dark palette keeps the generated document legible.
  await page.emulateMedia({ colorScheme: "dark" });
  await sendMessage(page, "Map the route between the hill towns");
  check("dark mode renders the map reply", await shows(page.getByRole("region", { name: "Map of the places" }).last()));
  await page.screenshot({ path: join(SHOTS, "5-map-dark-desktop.png"), fullPage: true });

  check("no uncaught errors or console errors on the desktop run", errors.length === 0, errors.slice(0, 3).join(" | "));
  await context.close();
}

async function mobileRun(browser, seeded) {
  const { context, page, errors } = await openPlanner(browser, seeded, { width: 390, height: 844 });
  await ask(page, "Map the places to see");
  await page.getByRole("region", { name: "Map of the places" }).waitFor({ timeout: 30_000 });
  await sendMessage(page, "Best time to visit Kandy");
  await page.getByText("Kandy in the cool season").first().waitFor({ timeout: 30_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("mobile layout has no horizontal page overflow", overflow <= 1, `overflow ${overflow}px`);
  const overflowMobile = await overflowingCards(page);
  check("no card content overflows its box on mobile", overflowMobile.length === 0, overflowMobile.slice(0, 3).join(" | "));
  await page.screenshot({ path: join(SHOTS, "6-guide-mobile.png"), fullPage: true });
  check("no uncaught errors on the mobile run", errors.length === 0, errors.slice(0, 3).join(" | "));
  await context.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
