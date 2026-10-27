#!/usr/bin/env node
/**
 * Browser smoke test (headless Chromium) against a RUNNING web app + API with the dev seed applied.
 *   npm i -D playwright-core && npx playwright-core install chromium
 *   node scripts/ui-smoke.mjs [webUrl] [screenshotDir]
 * It signs in as the seeded demo user, visits every major page, fails on console errors / failed API calls /
 * error boundaries, and exercises real flows (trip list, packages, quote, public client page).
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
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|Failed to load resource.*(401|404)/.test(m.text())) problems.push(`[console] ${where}: ${m.text().slice(0, 200)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${where}: ${e.message.slice(0, 200)}`));
page.on("response", (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith("/api/") && r.status() >= 500) problems.push(`[api ${r.status()}] ${where}: ${r.request().method()} ${u.pathname}`);
});

const step = (m) => console.log(`• ${m}`);
async function visit(path, expectText, opts = {}) {
  where = path;
  const res = await page.goto(`${WEB}${path}`, { waitUntil: "networkidle", timeout: 45_000 });
  if (!res || res.status() >= 400) problems.push(`[http ${res?.status()}] ${path}`);
  if (expectText) {
    try {
      await page.getByText(expectText, { exact: false }).first().waitFor({ timeout: opts.timeout ?? 15_000 });
    } catch {
      problems.push(`[missing text] ${path}: "${expectText}"`);
    }
  }
  if (await page.getByText("Something went wrong", { exact: false }).count()) problems.push(`[error boundary] ${path}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${path.replace(/[^\w]+/g, "_") || "home"}.png`, fullPage: false });
}

// public + auth pages
await visit("/", "Turn one tourist enquiry");
await visit("/features");
await visit("/terms");
await visit("/privacy");
await visit("/login", "Welcome back");
await visit("/register", "Create your organisation");
await visit("/forgot-password", "Reset your password");

// invalid credentials show an error, valid ones land on the dashboard
where = "login";
await page.goto(`${WEB}/login`);
await page.getByLabel("Email").fill("demo@tripweave.example");
await page.getByLabel("Password").fill("wrong-Password1");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("alert").first().waitFor({ timeout: 10_000 }).catch(() => problems.push("[login] no error shown for bad password"));
await page.getByLabel("Password").fill("Demo-Passw0rd1");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/dashboard", { timeout: 20_000 }).catch(() => problems.push("[login] did not reach dashboard"));
step("signed in as demo operator");

await visit("/dashboard", "Dashboard");
await visit("/trips", "Hill country escape");
await visit("/trips/new", "New");
await visit("/customers", "Jane Traveller");
await visit("/hotels", "Lakeside Heritage");
await visit("/hotels/new");
await visit("/hotels/rates");
await visit("/hotels/agreements", "Hill Hotels Direct");
await page.getByRole("tab", { name: "Agreements" }).click();
await page.getByText("DEMO-2026-A").first().waitFor({ timeout: 10_000 }).catch(() => problems.push("[agreements] seeded agreement not listed"));
await visit("/quotes", "Q-2026-0001");
await visit("/reports");
await visit("/settings", "Organisation");
await visit("/settings/team");
await visit("/settings/pricing", "Illustration only");
await visit("/settings/branding");
await visit("/settings/integrations");
await visit("/settings/audit");
await visit("/settings/account");
await visit("/hotel-workspace/partners");
await visit("/hotel-workspace/enquiries");
step("visited all primary pages");

// trip flow
where = "trip flow";
await page.goto(`${WEB}/trips`, { waitUntil: "networkidle" });
await page.getByText("Hill country escape (Demo)").first().click();
await page.waitForURL(/\/trips\/[\w-]+$/, { timeout: 15_000 });
const tripUrl = page.url();
await visit(new URL(tripUrl).pathname, "Hill country escape");
await visit(`${new URL(tripUrl).pathname}/itinerary`, "Kandy");
await visit(`${new URL(tripUrl).pathname}/optimise`, "Generate packages");
await visit(`${new URL(tripUrl).pathname}/packages`, "Budget Explorer");
const cards = await page.getByText("Budget Explorer").count();
if (cards === 0) problems.push("[packages] no Budget Explorer package rendered");
step("trip → itinerary → optimise → packages render real data");

// quote flow
await visit("/quotes", "Q-2026-0001");
await page.getByText("Q-2026-0001").first().click();
await page.waitForURL(/\/quotes\/[\w-]+$/, { timeout: 15_000 });
const quoteId = new URL(page.url()).pathname.split("/").pop();
await visit(`/quotes/${quoteId}`, "Q-2026-0001");

// issue a client link through the API (same session cookies) and open the public page logged-out
const send = await context.request.post(`${WEB}/api/v1/quotes/${quoteId}/send`, { data: { expiresInDays: 7, email: false }, headers: { "x-requested-with": "tripweave", origin: WEB } });
if (!send.ok()) problems.push(`[quote send] ${send.status()} ${(await send.text()).slice(0, 200)}`);
else {
  const { token } = (await send.json()).data;
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } }); // phone-sized client view
  const p2 = await anon.newPage();
  p2.on("pageerror", (e) => problems.push(`[public pageerror] ${e.message.slice(0, 200)}`));
  await p2.goto(`${WEB}/q/${token}`, { waitUntil: "networkidle" });
  await p2.getByText("Q-2026-0001").first().waitFor({ timeout: 15_000 }).catch(() => problems.push("[public] quote number not shown"));
  const body = (await p2.content()).toLowerCase();
  for (const f of ["grossmargin", "unitcostminor", "totalcostminor", "suppliername", "contractreference", "internalnotes"]) if (body.includes(f)) problems.push(`[public] leaked "${f}"`);
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) problems.push("[public] horizontal scroll at 390px");
  if (SHOTS) await p2.screenshot({ path: `${SHOTS}/public_quote_mobile.png`, fullPage: true });
  await p2.goto(`${WEB}/q/not-a-real-token-0000000000000000000000`, { waitUntil: "networkidle" });
  await p2.getByText("invalid or has expired").first().waitFor({ timeout: 10_000 }).catch(() => problems.push("[public] invalid-link state missing"));
  await anon.close();
  step("public client page works on a phone viewport and hides internals");
}

// signed-out access is redirected
const out = await browser.newContext();
const p3 = await out.newPage();
await p3.goto(`${WEB}/trips`, { waitUntil: "networkidle" });
await p3.waitForURL(/\/login/, { timeout: 15_000 }).catch(() => problems.push("[auth] /trips did not redirect when signed out"));
await out.close();

await browser.close();
if (problems.length) {
  console.error(`\nUI SMOKE FAILED (${problems.length}):\n` + [...new Set(problems)].map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}
console.log("\nUI SMOKE PASSED");
