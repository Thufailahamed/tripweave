import { describe, expect, it, vi } from "vitest";
import { Client, Harness, NOW } from "./harness";

const HOUR = 60 * 60 * 1000;

function article(overrides: Record<string, unknown> = {}) {
  return {
    title: "Ella",
    fullurl: "https://en.wikipedia.org/wiki/Ella",
    extract: "Ella is a small town in the hill country of Sri Lanka.",
    thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Ella.jpg" },
    coordinates: [{ lat: 6.8667, lon: 81.0466 }],
    ...overrides,
  };
}

function wikipediaReply(page: Record<string, unknown> | null) {
  return new Response(JSON.stringify({ query: page ? { pages: [page] } : { pages: [] } }), { status: 200, headers: { "content-type": "application/json" } });
}

/** A scripted Wikipedia: the responder receives the requested search term and returns a Response. */
function fakeWikipedia(responder: (term: string) => Response) {
  const calls: { term: string; userAgent: string | null }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const term = url.searchParams.get("gsrsearch") ?? "";
    calls.push({ term, userAgent: new Headers(init?.headers).get("user-agent") });
    return responder(term);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function lookup(client: Client, names: string[]) {
  return client.post("/planning/places", { names });
}

describe("place lookups", () => {
  it("resolves a place once, shares the result with every organisation and identifies the app to Wikimedia", async () => {
    const wiki = fakeWikipedia(() => wikipediaReply(article()));
    const h = new Harness({ fetch: wiki.fetch });
    const first = await h.register("Places One", "tour_operator");
    const second = await h.register("Places Two", "hotel_management");

    const response = await lookup(first, ["Ella, Sri Lanka", "ella, sri lanka"]);
    expect(response.status).toBe(200);
    const places = response.body.data.places;
    expect(places["Ella, Sri Lanka"]).toMatchObject({
      articleTitle: "Ella",
      articleUrl: "https://en.wikipedia.org/wiki/Ella",
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Ella.jpg",
      latitude: 6.8667,
      longitude: 81.0466,
    });
    expect(places["ella, sri lanka"]).toEqual(places["Ella, Sri Lanka"]);
    expect(wiki.calls).toHaveLength(1);
    expect(wiki.calls[0]!.term).toBe("Ella, Sri Lanka");
    expect(wiki.calls[0]!.userAgent).toMatch(/^TripWeave\/1\.0 \(planning; /);

    const shared = await lookup(second, ["Ella, Sri Lanka"]);
    expect(shared.body.data.places["Ella, Sri Lanka"]).toMatchObject({ articleTitle: "Ella" });
    expect(wiki.calls).toHaveLength(1);
  });

  it("caches a missing article for a day, then searches again", async () => {
    const wiki = fakeWikipedia(() => wikipediaReply(null));
    const h = new Harness({ fetch: wiki.fetch });
    const owner = await h.register("Places Miss", "tour_operator");
    expect((await lookup(owner, ["Atlantis, Sri Lanka"])).body.data.places).toEqual({ "Atlantis, Sri Lanka": null });
    expect((await lookup(owner, ["Atlantis, Sri Lanka"])).body.data.places).toEqual({ "Atlantis, Sri Lanka": null });
    expect(wiki.calls).toHaveLength(1);
    h.now = new Date(NOW.getTime() + 25 * HOUR);
    await lookup(owner, ["Atlantis, Sri Lanka"]);
    expect(wiki.calls).toHaveLength(2);
  });

  it("omits a place that was rate limited, so the failure is retried and never cached", async () => {
    let busy = true;
    const wiki = fakeWikipedia(() => (busy ? new Response("You are making too many requests", { status: 429 }) : wikipediaReply(article({ title: "Galle", fullurl: "https://en.wikipedia.org/wiki/Galle" }))));
    const h = new Harness({ fetch: wiki.fetch });
    const owner = await h.register("Places Busy", "tour_operator");
    const first = await lookup(owner, ["Galle, Sri Lanka"]);
    expect(first.status).toBe(200);
    expect(first.body.data.places).toEqual({});
    busy = false;
    const second = await lookup(owner, ["Galle, Sri Lanka"]);
    expect(second.body.data.places["Galle, Sri Lanka"]).toMatchObject({ articleTitle: "Galle" });
    expect(wiki.calls).toHaveLength(2);
  });

  it("returns only Wikimedia-hosted HTTPS images and sane coordinates", async () => {
    const wiki = fakeWikipedia(() =>
      wikipediaReply(article({ title: "Nowhere", thumbnail: { source: "https://tracker.example/pixel.jpg" }, coordinates: [{ lat: 200, lon: 80 }] })),
    );
    const h = new Harness({ fetch: wiki.fetch });
    const owner = await h.register("Places Safety", "tour_operator");
    const info = (await lookup(owner, ["Nowhere, Sri Lanka"])).body.data.places["Nowhere, Sri Lanka"];
    expect(info.imageUrl).toBeNull();
    expect(info.latitude).toBeNull();
    expect(info.longitude).toBe(80);
  });

  it("trims long article extracts to the stored limit", async () => {
    const wiki = fakeWikipedia(() => wikipediaReply(article({ extract: "x".repeat(2_000) })));
    const h = new Harness({ fetch: wiki.fetch });
    const owner = await h.register("Places Long", "tour_operator");
    const info = (await lookup(owner, ["Long, Sri Lanka"])).body.data.places["Long, Sri Lanka"];
    expect(info.extract).toHaveLength(600);
  });

  it("rejects malformed batches and anonymous callers", async () => {
    const wiki = fakeWikipedia(() => wikipediaReply(article()));
    const h = new Harness({ fetch: wiki.fetch });
    const owner = await h.register("Places Validation", "tour_operator");
    expect((await lookup(owner, [])).status).toBe(422);
    expect((await lookup(owner, ["x"])).status).toBe(422);
    expect((await lookup(owner, Array.from({ length: 13 }, (_, index) => `Place ${index}`))).status).toBe(422);
    expect((await lookup(owner, ["Line\u0000break"])).status).toBe(422);
    expect((await lookup(h.client(), ["Ella, Sri Lanka"])).status).toBe(401);
    expect(wiki.calls).toHaveLength(0);
  });
});
