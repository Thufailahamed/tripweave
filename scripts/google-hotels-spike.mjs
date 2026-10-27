import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.join("=")];
  }),
);

const destination = args.destination ?? "Kandy";
const checkIn = args.checkin ?? "2027-03-05";
const checkOut = args.checkout ?? "2027-03-09";
const adults = args.adults ?? "2";
const children = args.children ?? "2";
const ages = args.ages ?? "8,11";
const rooms = args.rooms ?? "2";
const currency = args.currency ?? "USD";

const url = new URL("https://www.google.com/travel/hotels");
url.searchParams.set("q", `Hotels in ${destination}`);
url.searchParams.set("checkin", checkIn);
url.searchParams.set("checkout", checkOut);
url.searchParams.set("adults", adults);
url.searchParams.set("children", children);
url.searchParams.set("ages", ages);
url.searchParams.set("rooms", rooms);
url.searchParams.set("hl", "en");
url.searchParams.set("gl", "us");
url.searchParams.set("curr", currency);

const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  executablePath,
  headless: args.headless !== "false",
  args: ["--disable-blink-features=AutomationControlled"],
});
const context = await browser.newContext({
  locale: "en-US",
  timezoneId: "UTC",
  viewport: { width: 1440, height: 1000 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});
const page = await context.newPage();
console.log("goto", url.toString());
const res = await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
console.log("status", res?.status(), "final", page.url());

for (const label of ["Accept all", "I agree", "Reject all"]) {
  const button = page.getByRole("button", { name: label, exact: false }).first();
  if (await button.isVisible().catch(() => false)) {
    console.log("consent", label);
    await button.click().catch(() => {});
    await page.waitForTimeout(2_000);
  }
}

await page.waitForTimeout(8_000);
console.log("title", await page.title());
console.log("h2 count", await page.locator("h2").count());
const body = await page.locator("body").innerText();
console.log("body sample", body.slice(0, 1500).replace(/\n{2,}/g, "\n"));

await page.screenshot({ path: "/tmp/google-hotels-spike.png", fullPage: false });
await writeFile("/tmp/google-hotels-spike.html", await page.content());
await browser.close();
