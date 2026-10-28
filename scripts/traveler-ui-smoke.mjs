#!/usr/bin/env node
/**
 * Browser smoke for the individual traveller surface against a RUNNING web app + API.
 * It registers a disposable traveller, creates a trip, checks the dossier, adds budget,
 * packing, notes, creates and opens a share link, visits the planner and signs back in.
 *
 * Usage: node scripts/traveler-ui-smoke.mjs [webUrl] [screenshotDir]
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const WEB = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const SHOTS = process.argv[3];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const problems = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
let where = "";

page.on("console", (message) => {
  if (message.type() === "error" && !/favicon|Failed to load resource.*(401|404)/.test(message.text())) problems.push(`[console] ${where}: ${message.text().slice(0, 220)}`);
});
page.on("pageerror", (error) => problems.push(`[pageerror] ${where}: ${error.message.slice(0, 220)}`));
page.on("response", (response) => {
  const url = new URL(response.url());
  if (url.pathname.startsWith("/api/") && response.status() >= 500) problems.push(`[api ${response.status()}] ${where}: ${response.request().method()} ${url.pathname}`);
});

const step = (message) => console.log(`• ${message}`);
async function visit(path, text) {
  where = path;
  const response = await page.goto(`${WEB}${path}`, { waitUntil: "networkidle", timeout: 45_000 });
  if (!response || response.status() >= 400) problems.push(`[http ${response?.status()}] ${path}`);
  if (text) {
    try {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 20_000 });
    } catch {
      problems.push(`[missing text] ${path}: "${text}"`);
    }
  }
  if (await page.getByText("Something went wrong", { exact: false }).count()) problems.push(`[error boundary] ${path}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${path.replace(/[^\w]+/g, "_") || "home"}.png`, fullPage: false });
}

const email = `traveler-ui-${Date.now()}@example.com`;
const password = "Travel-Pass1";
const title = "UI smoke trip";

where = "/travel";
await visit("/travel", "Your next trip");
step("public traveller landing renders");

await page.getByRole("link", { name: "Start planning" }).first().click();
await page.waitForURL("**/travel/join", { timeout: 20_000 });
await page.getByLabel("Your name").fill("Maya UI");
await page.getByLabel("Home city").fill("Colombo");
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Create my account" }).click();
await page.waitForURL("**/travel/trips/new?welcome=1", { timeout: 30_000 });
step("registered a personal workspace");

await page.getByLabel("The trip in your head").fill("Ten days in Sri Lanka in December. Two of us, tea country, a temple, a little hiking, and a quiet coast at the end.");
await page.getByLabel("Trip title").fill(title);
await page.getByLabel("Arrival").fill("2026-12-10");
await page.getByLabel("Departure").fill("2026-12-14");
const destinations = page.getByLabel("Places you have in mind");
await destinations.fill("Kandy");
await destinations.press("Enter");
await destinations.fill("Ella");
await destinations.press("Enter");
await page.getByRole("button", { name: "Create the trip" }).click();
await page.waitForURL(/\/travel\/trips\/[0-9a-f-]+/, { timeout: 90_000 });
await page.getByRole("heading", { name: title }).first().waitFor({ timeout: 30_000 });
step("created a trip and opened the dossier");

await page.getByRole("link", { name: "Budget", exact: true }).click();
await page.waitForURL(/\/travel\/trips\/[0-9a-f-]+\/budget/, { timeout: 20_000 });
await page.getByLabel("What is it?").fill("Train to Kandy");
await page.getByLabel("Amount", { exact: true }).fill("45.00");
await page.getByRole("button", { name: "Add" }).click();
await page.getByText("Train to Kandy").first().waitFor({ timeout: 15_000 });
step("added a budget line");

await page.getByRole("link", { name: "Packing", exact: true }).click();
await page.waitForURL(/\/packing/, { timeout: 20_000 });
await page.getByRole("button", { name: "Generate suggestions" }).first().click();
await page.getByText("Passport / ID").first().waitFor({ timeout: 20_000 });
step("generated a packing list");

await page.getByRole("link", { name: "Notes", exact: true }).click();
await page.waitForURL(/\/notes/, { timeout: 20_000 });
await page.getByLabel("New note").fill("The 9:45 train from Kandy has the open windows.");
await page.getByRole("button", { name: "Save note" }).click();
await page.getByText("The 9:45 train from Kandy").first().waitFor({ timeout: 15_000 });
step("saved a private note");

await page.getByRole("link", { name: "Share", exact: true }).click();
await page.waitForURL(/\/share/, { timeout: 20_000 });
await page.getByRole("button", { name: "Create share link" }).click();
await page.getByText("This link is ready").waitFor({ timeout: 20_000 });
const link = (await page.locator("code").first().textContent())?.trim();
if (!link || !link.includes("/t/")) problems.push("[share] no share URL was rendered");
else {
  const publicPage = await context.newPage();
  await publicPage.goto(link, { waitUntil: "networkidle", timeout: 45_000 });
  await publicPage.getByText("Read-only share").waitFor({ timeout: 20_000 });
  await publicPage.getByRole("heading", { name: title }).waitFor({ timeout: 20_000 });
  await publicPage.getByRole("button", { name: /Print/ }).waitFor({ timeout: 10_000 });
  if (SHOTS) await publicPage.screenshot({ path: `${SHOTS}/public-trip.png`, fullPage: true });
  await publicPage.close();
  step("opened the public read-only trip");
}

await page.getByRole("link", { name: "Plan", exact: true }).click();
await page.waitForURL(/\/plan/, { timeout: 20_000 });
await page.getByRole("heading", { name: "What shall we plan next?" }).waitFor({ timeout: 30_000 });
step("opened the OpenUI planner");

await page.getByRole("link", { name: "Stays", exact: true }).click();
await page.waitForURL(/\/stays/, { timeout: 20_000 });
await page.getByText("Somewhere to come back to.").waitFor({ timeout: 20_000 });

await page.getByRole("link", { name: "Itinerary", exact: true }).click();
await page.waitForURL(/\/itinerary/, { timeout: 20_000 });
await page.getByText(/Shape the days|Build the route/).first().waitFor({ timeout: 20_000 });
step("checked stays and itinerary pages");

await visit("/travel/discover", "Borrow a place");
await visit("/travel/profile", "A little about you.");

where = "sign-out";
await page.getByRole("button", { name: "Sign out" }).first().click();
await page.waitForURL("**/travel/signin", { timeout: 20_000 });
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/travel/trips", { timeout: 30_000 });
await page.getByText("Hello,", { exact: false }).waitFor({ timeout: 20_000 });
step("signed out and back in");

if (SHOTS) await page.screenshot({ path: `${SHOTS}/traveller-dashboard.png`, fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
where = "mobile";
await page.goto(`${WEB}/travel/trips`, { waitUntil: "networkidle", timeout: 45_000 });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (overflow > 2) problems.push(`[mobile overflow] /travel/trips is ${overflow}px wider than the viewport`);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/traveller-dashboard-mobile.png`, fullPage: true });
step("checked the mobile dashboard");

await browser.close();

if (problems.length) {
  console.error(`\nTraveller UI smoke found ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`\nTraveller UI smoke passed for ${email}.`);
