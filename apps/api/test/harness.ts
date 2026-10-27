import { setClock } from "@tripweave/database";
import { createTestDb, type TestD1 } from "@tripweave/database/testing";
import { createApp } from "../src/app";
import type { Deps, Env } from "../src/env";

export const NOW = new Date("2026-10-27T10:00:00Z");
export const PASSWORD = "Passw0rd-Test1";

export interface ApiResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
  text: string;
}

export class Client {
  cookie = "";
  constructor(private readonly h: Harness) {}

  async call<T = any>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { "x-requested-with": "tripweave", origin: "http://localhost:3000", ...extra };
    if (this.cookie) headers.cookie = this.cookie;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await this.h.app.request(`/api/v1${path}`, { method, headers, body: payload }, this.h.env);
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const pair = setCookie.split(";")[0]!;
      this.cookie = pair.endsWith("=") || /max-age=0/i.test(setCookie) || /expires=Thu, 01 Jan 1970/i.test(setCookie) ? "" : pair;
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* binary or text body */
    }
    return { status: res.status, body: parsed as T, headers: res.headers, text };
  }
  get = <T = any>(p: string, h?: Record<string, string>) => this.call<T>("GET", p, undefined, h);
  post = <T = any>(p: string, b?: unknown, h?: Record<string, string>) => this.call<T>("POST", p, b ?? {}, h);
  put = <T = any>(p: string, b?: unknown) => this.call<T>("PUT", p, b ?? {});
  patch = <T = any>(p: string, b?: unknown) => this.call<T>("PATCH", p, b ?? {});
  del = <T = any>(p: string) => this.call<T>("DELETE", p);

  /** Calls and asserts a 2xx, returning `data`. */
  async ok<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await this.call(method, path, body);
    if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status}: ${r.text.slice(0, 400)}`);
    return (r.body as { data: T }).data;
  }
}

export class Harness {
  readonly db: TestD1;
  readonly env: Env;
  readonly app: ReturnType<typeof createApp>;
  readonly pending: Promise<unknown>[] = [];
  now = NOW;

  constructor(overrides: Partial<Deps> = {}, envOverrides: Partial<Env> = {}) {
    this.db = createTestDb();
    setClock(() => this.now);
    this.env = {
      DB: this.db as unknown as D1Database,
      ENVIRONMENT: "test",
      APP_BASE_URL: "http://localhost:3000",
      COOKIE_SECURE: "false",
      ENABLE_MOCK_PROVIDER: "true",
      ROUTING_PROVIDER: "estimate",
      ...envOverrides,
    } as Env;
    this.app = createApp({ now: () => this.now, schedule: (p) => this.pending.push(p), sleep: async () => {}, pbkdf2Iterations: 1_000, ...overrides });
  }

  client(): Client {
    return new Client(this);
  }

  /** Waits for background work (the inline optimisation pipeline) to finish. */
  async settle(): Promise<void> {
    while (this.pending.length) await Promise.all(this.pending.splice(0));
  }

  async register(name: string, type: "tour_operator" | "hotel_management", email?: string): Promise<Client> {
    const c = this.client();
    const r = await c.post("/auth/register", { email: email ?? `${name.toLowerCase().replace(/\W+/g, "")}@example.com`, password: PASSWORD, displayName: `${name} Owner`, organizationName: name, organizationType: type, country: "LK", defaultCurrency: "USD" });
    if (r.status !== 201) throw new Error(`register failed: ${r.status} ${r.text}`);
    return c;
  }
}

export interface HotelSpec {
  name: string;
  city: string;
  lat: number;
  lng: number;
  price: number;
  category?: string;
  meal?: "RO" | "BB" | "HB" | "FB" | "AI";
  currency?: string;
  review?: number | null;
  amenities?: string[];
  refundable?: boolean;
  preferred?: boolean;
  maxAdults?: number;
}

export async function createHotel(c: Client, h: HotelSpec) {
  const property = await c.ok("POST", "/hotels", { name: h.name, city: h.city, latitude: h.lat, longitude: h.lng, category: h.category ?? "comfort", reviewScore: h.review === undefined ? 8 : h.review, amenities: h.amenities ?? ["wifi", "pool"], preferredPartner: h.preferred ?? false });
  const room = await c.ok("POST", `/hotels/${property.id}/rooms`, { name: "Deluxe Double", maximumAdults: h.maxAdults ?? 2, maximumOccupancy: 3 });
  const currency = h.currency ?? "USD";
  const plan = await c.ok("POST", `/hotels/${property.id}/rates`, {
    roomTypeId: room.id, name: `${h.meal ?? "BB"} contract`, mealPlan: h.meal ?? "BB", currency, effectiveFrom: "2026-01-01", effectiveTo: "2027-12-31",
    cancellationPolicy: { refundable: h.refundable ?? true, freeCancellationDaysBeforeArrival: 7 },
  });
  await c.ok("POST", `/rate-plans/${plan.id}/rules`, { applicableStartDate: "2026-01-01", applicableEndDate: "2027-12-31", amountMinor: Math.round(h.price * 100) });
  return { propertyId: property.id as string, roomId: room.id as string, planId: plan.id as string };
}

export const HILL_COUNTRY: HotelSpec[] = [
  { name: "Kandy Budget Stay", city: "Kandy", lat: 7.2851, lng: 80.6229, price: 60, category: "budget", review: 6.8, amenities: ["wifi"], refundable: false },
  { name: "Kandy City Comfort", city: "Kandy", lat: 7.2936, lng: 80.6413, price: 110, category: "comfort", review: 8.1 },
  { name: "Lakeside Heritage Kandy", city: "Kandy", lat: 7.2906, lng: 80.6437, price: 150, category: "boutique", review: 9.1, amenities: ["wifi", "pool", "spa", "view"], preferred: true },
  { name: "Kandy Royal Palace", city: "Kandy", lat: 7.3, lng: 80.65, price: 280, category: "luxury", review: 9.5, amenities: ["wifi", "pool", "spa", "view", "gym"] },
  { name: "Kandy Room Only Inn", city: "Kandy", lat: 7.29, lng: 80.63, price: 40, category: "budget", review: 6, meal: "RO" },
  { name: "Nuwara Eliya Hostel", city: "Nuwara Eliya", lat: 6.95, lng: 80.79, price: 70, category: "standard", review: 7.2, amenities: ["wifi"] },
  { name: "Tea Estate Bungalow", city: "Nuwara Eliya", lat: 6.9702, lng: 80.7642, price: 160, category: "boutique", review: 9.2, amenities: ["wifi", "view", "fireplace"] },
  { name: "Colonial Grand Nuwara Eliya", city: "Nuwara Eliya", lat: 6.9497, lng: 80.7891, price: 300, category: "luxury", review: 9.0, amenities: ["wifi", "pool", "spa", "gym", "view"] },
  { name: "Highland Comfort Lodge", city: "Nuwara Eliya", lat: 6.96, lng: 80.78, price: 120, category: "comfort", review: 8.0 },
  { name: "Ella Backpackers", city: "Ella", lat: 6.8667, lng: 81.0466, price: 55, category: "budget", review: 7.4, amenities: ["wifi"] },
  { name: "Nine Arches View Ella", city: "Ella", lat: 6.8764, lng: 81.0599, price: 100, category: "comfort", review: 8.4, amenities: ["wifi", "view"] },
  { name: "Cloud Ridge Retreat Ella", city: "Ella", lat: 6.8601, lng: 81.0399, price: 140, category: "boutique", review: 9.3, amenities: ["wifi", "pool", "view", "spa"] },
  { name: "Ella Grand Premium", city: "Ella", lat: 6.87, lng: 81.05, price: 260, category: "premium", review: 8.9, amenities: ["wifi", "pool", "spa", "gym"] },
];

export async function seedHillCountry(c: Client) {
  const ids: Record<string, Awaited<ReturnType<typeof createHotel>>> = {};
  for (const h of HILL_COUNTRY) ids[h.name] = await createHotel(c, h);
  return ids;
}

export const ENQUIRY =
  "We are two adults visiting Sri Lanka for four days from 10 December 2026. We want to visit Sigiriya, Kandy, Nuwara Eliya, and Ella. We prefer comfortable boutique hotels with breakfast included. Our accommodation budget is approximately USD 450 for three nights. We prefer scenic properties, good reviews, and reasonable driving times.";
