import { describe, expect, it } from "vitest";
import { defaultBuildProviders } from "../src/services/providers";
import { enabledExternalProviders } from "../src/services/settings";
import type { Env } from "../src/env";

const build = (env: Partial<Env>, opts: { includeExternal?: boolean; externalProviders?: string[] } = {}) =>
  defaultBuildProviders(env as Env, {} as never, "org", { includeExternal: opts.includeExternal ?? true, includeMock: false, externalProviders: opts.externalProviders }).map((p) => p.key);

const creds = { HOTELBEDS_API_KEY: "k", HOTELBEDS_SECRET: "s", AMADEUS_CLIENT_ID: "i", AMADEUS_CLIENT_SECRET: "s" };

describe("external supplier selection", () => {
  it("only builds suppliers the platform allows AND has credentials for", () => {
    expect(build({ ...creds, HOTEL_EXTERNAL_PROVIDER: "none" })).toEqual(["internal"]);
    expect(build({ ...creds, HOTEL_EXTERNAL_PROVIDER: "hotelbeds,amadeus" })).toEqual(["internal", "hotelbeds", "amadeus"]);
    expect(build({ ...creds, HOTEL_EXTERNAL_PROVIDER: "Amadeus" })).toEqual(["internal", "amadeus"]);
    expect(build({ HOTEL_EXTERNAL_PROVIDER: "hotelbeds,amadeus", AMADEUS_CLIENT_ID: "i" })).toEqual(["internal"]); // half a credential pair is not a credential
  });

  it("honours the organisation's per-supplier switches and the request's includeExternal flag", () => {
    const env = { ...creds, HOTEL_EXTERNAL_PROVIDER: "hotelbeds,amadeus" };
    expect(build(env, { externalProviders: ["amadeus"] })).toEqual(["internal", "amadeus"]);
    expect(build(env, { externalProviders: [] })).toEqual(["internal"]);
    expect(build(env, { includeExternal: false })).toEqual(["internal"]);
  });

  it("reads switches from settings saved before a supplier existed", () => {
    expect(enabledExternalProviders({ externalProviders: { hotelbeds: true } as never })).toEqual(["hotelbeds"]);
    expect(enabledExternalProviders({ externalProviders: { hotelbeds: false, amadeus: true } })).toEqual(["amadeus"]);
    expect(enabledExternalProviders({})).toEqual([]);
  });
});
