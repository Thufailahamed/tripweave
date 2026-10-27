import type { Permission, Role, OrganizationType } from "@tripweave/shared";
import type { Db, identity } from "@tripweave/database";
import type { AiBinding, LlmClient } from "@tripweave/ai";
import type { HotelProvider } from "@tripweave/provider-contracts";

export interface JobMessage {
  type: "optimise";
  jobId: string;
  organizationId: string;
}

/** Cloudflare bindings and configuration. Secrets come from `wrangler secret put`, never from vars. */
export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  CACHE?: KVNamespace;
  AI?: AiBinding;
  JOBS?: Queue<JobMessage>;
  OPTIMISATION_WORKFLOW?: Workflow<JobMessage>;

  ENVIRONMENT: string;
  APP_BASE_URL: string;
  SESSION_COOKIE_NAME?: string;
  COOKIE_SECURE?: string;
  AI_MODEL?: string;
  ROUTING_PROVIDER?: string;
  /** Minutes a live supplier price check remains quotable; defaults to 15. */
  PRICE_VALIDITY_MINUTES?: string;
  /** Comma-separated external suppliers the platform allows, e.g. "hotelbeds,amadeus"; "none" disables all. */
  HOTEL_EXTERNAL_PROVIDER?: string;
  ENABLE_MOCK_PROVIDER?: string;
  /** "true" blocks the API (except /auth) for accounts whose email address is not verified yet. */
  REQUIRE_EMAIL_VERIFICATION?: string;
  EMAIL_PROVIDER?: string;
  EMAIL_FROM_ADDRESS?: string;
  HOTELBEDS_BASE_URL?: string;
  AMADEUS_BASE_URL?: string;
  OSRM_BASE_URL?: string;
  /** "true" enables keyless OpenStreetMap hotel discovery (estimated prices). */
  HOTEL_DISCOVERY?: string;
  OSM_OVERPASS_URL?: string;
  OSM_NOMINATIM_URL?: string;
  OSM_CONTACT_EMAIL?: string;
  SERPAPI_BASE_URL?: string;

  // secrets
  HOTELBEDS_API_KEY?: string;
  HOTELBEDS_SECRET?: string;
  AMADEUS_CLIENT_ID?: string;
  AMADEUS_CLIENT_SECRET?: string;
  /** SerpApi key; enables Google Hotels (Booking.com, Expedia, Agoda, Hotels.com…). */
  SERPAPI_API_KEY?: string;
  GOOGLE_MAPS_API_KEY?: string;
  LLM_PROVIDER?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_BASE_URL?: string;
  EMAIL_PROVIDER_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Secret used to encrypt TOTP seeds at rest. Multi-factor enrolment is unavailable without it. */
  MFA_ENCRYPTION_KEY?: string;
}

export interface AuthContext {
  userId: string;
  email: string;
  displayName: string;
  platformAdmin: boolean;
  emailVerified: boolean;
  sessionId: string;
  organizationId: string | null;
  organizationType: OrganizationType | null;
  organizationName: string | null;
  role: Role | null;
  permissions: ReadonlySet<Permission>;
  memberships: identity.MembershipRow[];
  /** Set when a platform admin acts inside a tenant under an explicit, audited access grant. */
  impersonating?: boolean;
}

export interface Vars {
  requestId: string;
  db: Db;
  auth: AuthContext | null;
  deps: Deps;
}

/** Overridable collaborators so tests (and local dev) never need live services. */
export interface Deps {
  now: () => Date;
  /** Runs background work (Worker waitUntil in production, awaited collection in tests). */
  schedule: (task: Promise<unknown>) => void;
  buildProviders: (env: Env, db: Db, organizationId: string, opts: { includeExternal: boolean; includeMock: boolean; /** External supplier keys the organisation enabled; omitted means every configured one. */ externalProviders?: string[]; /** Pilot: entity-page verification of the cheapest Google Hotels results. */ googleHotelsDirect?: boolean }) => HotelProvider[];
  buildLlm: (env: Env) => LlmClient | null;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  pbkdf2Iterations: number;
}
