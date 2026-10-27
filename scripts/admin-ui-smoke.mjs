#!/usr/bin/env node
/**
 * Platform-admin browser smoke test. Requires a running web app + API, the demo seed, and the demo user
 * promoted to platform admin:
 *
 *   wrangler d1 execute tripweave --local --persist-to ../../.wrangler/state \
 *     --command "UPDATE users SET platform_role='platform_admin' WHERE email='demo@tripweave.example'"
 *   node scripts/admin-ui-smoke.mjs [webUrl]
 *
 * It signs in, visits every admin section, exercises an organisation support grant, and fails on console
 * errors, page errors, missing text, or 5xx API responses.
 */
import { chromium } from "playwright-core";

const WEB = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const problems = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
let where = "";

page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|Failed to load resource.*(401|403|404)/.test(m.text())) problems.push(`[console] ${where}: ${m.text().slice(0, 240)}`);
});
page.on("pageerror", (e) => problems.push(`[pageerror] ${where}: ${e.message.slice(0, 240)}`));
page.on("response", (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith("/api/") && r.status() >= 500) problems.push(`[api ${r.status()}] ${where}: ${r.request().method()} ${u.pathname}`);
});

async function visit(path, text) {
  where = path;
  await page.goto(`${WEB}${path}`, { waitUntil: "networkidle", timeout: 45_000 });
  if (text) await page.getByText(text, { exact: false }).first().waitFor({ timeout: 15_000 }).catch(() => problems.push(`[missing] ${path}: "${text}"`));
  if (await page.getByText("Something went wrong", { exact: false }).count()) problems.push(`[error boundary] ${path}`);
  if (await page.getByText("Could not load", { exact: false }).count()) problems.push(`[load error] ${path}`);
}

where = "login";
await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
await page.getByLabel("Email").fill("demo@tripweave.example");
await page.getByLabel("Password").fill("Demo-Passw0rd1");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/dashboard", { timeout: 20_000 }).catch(async () => {
  // A platform admin without a tenant lands on /admin instead.
  await page.waitForURL("**/admin", { timeout: 5_000 }).catch(() => problems.push("[login] did not reach dashboard or admin"));
});
console.log("• signed in");

await visit("/admin", "Platform overview");
await visit("/admin/organizations", "Organisations");
await page.getByRole("row", { name: /Demo Island Tours/ }).click();
await page.waitForURL(/\/admin\/organizations\/[\w-]+$/, { timeout: 15_000 }).catch(() => problems.push("[org] row click did not open detail"));
where = "organisation detail";
await page.getByText("Organisation profile", { exact: false }).first().waitFor({ timeout: 15_000 }).catch(() => problems.push("[org] profile card missing"));
await page.getByRole("tab", { name: "Team" }).click();
await page.getByText("Team members", { exact: false }).first().waitFor({ timeout: 10_000 }).catch(() => problems.push("[org] team tab missing"));
await page.getByRole("tab", { name: /Support/ }).click();
await page.getByLabel("Reason for access").fill("Admin portal smoke test — safe to revoke");
await page.getByRole("button", { name: /Grant support access/ }).click();
await page.getByText("Recent trip requests", { exact: false }).first().waitFor({ timeout: 20_000 }).catch(() => problems.push("[org] tenant data did not load after grant"));
const revoke = page.getByRole("button", { name: "Revoke" }).first();
if (await revoke.count()) await revoke.click();
else problems.push("[org] no revoke button after granting access");
console.log("• organisation detail + support grant exercised");

await visit("/admin/users", "Users");
await page.getByPlaceholder("Search name or email…").fill("demo@tripweave.example");
await page.waitForTimeout(600);
await page.getByRole("row", { name: /Demo Operator/ }).click();
await page.waitForURL(/\/admin\/users\/[\w-]+$/, { timeout: 15_000 }).catch(() => problems.push("[users] row click did not open detail"));
where = "user detail";
await page.getByText("Account", { exact: true }).first().waitFor({ timeout: 10_000 }).catch(() => problems.push("[user] account tab missing"));
await page.getByRole("tab", { name: "Sessions" }).click();
await page.getByText("Sessions", { exact: false }).first().waitFor({ timeout: 10_000 }).catch(() => problems.push("[user] sessions tab missing"));
console.log("• user detail exercised");

await visit("/admin/jobs", "Optimisation jobs");
await visit("/admin/audit", "Audit log");
await visit("/admin/providers", "Providers & usage");
await visit("/admin/communications", "Communications");
await page.getByRole("tab", { name: "Email outbox" }).click();
await page.getByText("Pending", { exact: false }).first().waitFor({ timeout: 10_000 }).catch(() => problems.push("[communications] email outbox tab missing"));
await visit("/admin/support", "Support access");
await visit("/admin/settings", "Global switches");
console.log("• visited every admin section");

await browser.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log("\nAll admin UI checks passed.");
