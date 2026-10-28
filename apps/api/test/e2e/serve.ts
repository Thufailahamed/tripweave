/**
 * End-to-end server for the planner. It runs the real Hono application over HTTP with an in-memory
 * database and migrations. Two collaborators are scripted so the run is repeatable:
 *
 *  - the language model writes OpenUI Lang for each request, streaming it in small chunks; messages
 *    tagged [fail-once] get one invalid reply (exercising the repair path) and [fail-always] gets two
 *    (exercising the standard-view fallback);
 *  - Wikipedia answers from a fixture table, using real Wikimedia Commons photographs.
 *
 * Everything else (authentication, tenancy, trips, the planning snapshot, SSE, the place cache and the
 * validator) is the production code. Run with: pnpm --filter @tripweave/api exec tsx test/e2e/serve.ts
 */
import { createServer } from "node:http";
import { Readable } from "node:stream";
import type { LlmClient, LlmTextArgs } from "@tripweave/ai";
import { Harness } from "../harness";

const PORT = Number(process.env.E2E_API_PORT ?? 8787);

interface PlaceFixture {
  title: string;
  extract: string;
  image: string | null;
  latitude: number;
  longitude: number;
}

/** Real Wikimedia Commons photographs (thumbnail URLs), verified reachable for this run. */
const FIXTURES: Record<string, PlaceFixture> = {
  "kandy, sri lanka": {
    title: "Kandy",
    extract: "Kandy is a city in the Central Province of Sri Lanka, set around a lake in the hill country.",
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/SL_Kandy_asv2020-01_img11_Arthurs_Seat_view.jpg/1280px-SL_Kandy_asv2020-01_img11_Arthurs_Seat_view.jpg",
    latitude: 7.2906,
    longitude: 80.6337,
  },
  "ella, sri lanka": {
    title: "Ella, Sri Lanka",
    extract: "Ella is a small town in the Badulla District, known for its walks, tea estates and viewpoints.",
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8a/Nine_Arch_Bridge%2C_Demodara_Ella.jpg/1280px-Nine_Arch_Bridge%2C_Demodara_Ella.jpg",
    latitude: 6.8667,
    longitude: 81.0466,
  },
  "nuwara eliya, sri lanka": {
    title: "Nuwara Eliya",
    extract: "Nuwara Eliya is a city in the central hills, surrounded by tea plantations and cool weather.",
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/22/Sri_Lanka%2C_Tea_plantations_near_Nuwara_Eliya%2C_Tea_estate.jpg/1280px-Sri_Lanka%2C_Tea_plantations_near_Nuwara_Eliya%2C_Tea_estate.jpg",
    latitude: 6.9497,
    longitude: 80.7891,
  },
  "sigiriya, sri lanka": {
    title: "Sigiriya",
    extract: "Sigiriya is an ancient rock fortress rising above the central plains.",
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c7/Sigiriya.jpg/1280px-Sigiriya.jpg",
    latitude: 7.957,
    longitude: 80.7603,
  },
  "galle, sri lanka": {
    title: "Galle",
    extract: "Galle is a historic port city on the south-west coast, home to a Dutch-era fort.",
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fd/Lighthouse_Galle%2C_Sri_Lanka.jpg/1280px-Lighthouse_Galle%2C_Sri_Lanka.jpg",
    latitude: 6.0535,
    longitude: 80.221,
  },
  "little adam's peak, sri lanka": {
    title: "Little Adam's Peak",
    extract: "Little Adam's Peak is a short walk near Ella with wide views over the valley.",
    image: null,
    latitude: 6.8661,
    longitude: 80.9888,
  },
};

/** Set E2E_LIVE_PLACES=1 to look up places without a fixture on the real Wikipedia, for a visual review. */
const LIVE_PLACES = process.env.E2E_LIVE_PLACES === "1";

/** Serves Wikipedia search responses from the fixture table; every other request goes to the network. */
const fixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.hostname !== "en.wikipedia.org") return fetch(input, init);
  const term = (url.searchParams.get("gsrsearch") ?? "").trim().toLowerCase();
  const fixture = FIXTURES[term];
  if (!fixture && LIVE_PLACES && !term.startsWith("atlantis")) return fetch(input, init);
  const pages = fixture
    ? [
        {
          title: fixture.title,
          fullurl: `https://en.wikipedia.org/wiki/${encodeURIComponent(fixture.title.replace(/ /g, "_"))}`,
          extract: fixture.extract,
          ...(fixture.image ? { thumbnail: { source: fixture.image } } : {}),
          coordinates: [{ lat: fixture.latitude, lon: fixture.longitude }],
        },
      ]
    : [];
  return new Response(JSON.stringify({ query: { pages } }), { status: 200, headers: { "content-type": "application/json" } });
};

interface Payload {
  context: { trip: { id: string }; itinerary: { id: string } | null };
  userRequest: string;
  repairNote?: unknown;
}


/** Programs the scripted model writes. Each one uses only the approved components and snapshot refs. */
function programFor(request: string, context: Payload["context"]): string {
  const text = request.toLowerCase();
  const trip = context.trip.id;
  const itinerary = context.itinerary?.id;
  if (/bitcoin|python|javascript|code/.test(text)) {
    return `root = PlanningCanvas("I can help with travel", [intro, next], "Trip planning, destinations and packing.")
intro = Lead("That question is outside travel planning. Ask me about destinations, routes, packing or your saved trip.")
next = FollowUps("Try one of these", ["Where should I go for a week in autumn?", "What should I pack for a monsoon trip?"])`;
  }
  if (/overview|glance/.test(text) && itinerary) {
    return `root = PlanningCanvas("Kandy and Ella at a glance", [hero, map, timeline, summary, next], "Your saved route and requirements.")
hero = TripHero("${trip}", "${itinerary}")
map = TripMap("${itinerary}")
timeline = DestinationTimeline("${itinerary}")
summary = TripRequirementSummary("${trip}")
next = QuickActions()`;
  }
  if (/things to see|see and do|what to eat|days in kandy/.test(text)) {
    return `root = PlanningCanvas("Four days of tea, temples and trains in Kandy", [sights, board, food, when, next], "Kandy rewards slow mornings by the lake and long afternoons in the hills.", ["4 days", "Easy pace", "Hill country"], "walk early, wander late", "Kandy")
h1 = Highlight("Temple of the Tooth, Kandy", "Lakeside", "The relic temple glows at the evening puja.")
h2 = Highlight("Sigiriya, Sri Lanka", "Cultural Triangle", "A rock fortress worth the early climb.")
h3 = Highlight("Nine Arch Bridge, Ella", "Demodara", "Time it for a passing train.")
sights = Highlights("Do not miss", [h1, h2, h3])
d1 = BoardDay("Day 1", ["Kandy, Sri Lanka", "Temple of the Tooth, Kandy"], "Lake and temple")
d2 = BoardDay("Day 2", ["Sigiriya, Sri Lanka"], "The rock")
d3 = BoardDay("Day 3", ["Nuwara Eliya, Sri Lanka", "Ella, Sri Lanka", "Little Adam's Peak, Sri Lanka"], "Into the hills")
board = DayBoard("Four days around Kandy", [d1, d2, d3], "mapped your stops into a relaxed loop")
food = LocalFlavours("Kandy specialties", ["Kottu roti", "Hoppers", "Ceylon tea"], "hoppers are best at breakfast")
c1 = Choice("Perahera season", "July to August", "the great procession lights up the town", "Plan it for the Perahera festival in August.")
c2 = Choice("Cool and dry", "January to March", "clear mornings in the hills", "Plan it for February, when it is cool and dry.")
c3 = Choice("Quiet months", "May to June", "fewer crowds and green hills", "Plan it for June, when it is quiet.")
when = Choices("When would you like to go?", [c1, c2, c3], "Pick your own dates")
next = FollowUps("keep planning", ["Find hotels near the lake in Kandy", "Where should we eat near the temple?", "Add a tea factory visit"])`;
  }
  if (/where|map|route|near|how far|between|get from/.test(text)) {
    return `root = PlanningCanvas("Kandy to Ella by the hills", [lead, route, stops, days, next], "Locations come from public coordinates; travel times are estimates.", ["Walking + transit", "Hill country"])
lead = Lead("The hill-country route runs from Kandy through Nuwara Eliya to Ella, with cool weather and short walks between the stops.")
route = PlaceMap("The hill-country route", ["Kandy, Sri Lanka", "Nuwara Eliya, Sri Lanka", "Ella, Sri Lanka", "Atlantis, Sri Lanka"])
kandy = RouteStop("Kandy, Sri Lanka", "9:00 AM", "60-75 min", "Start at the lake and walk the shoreline.")
nuwara = RouteStop("Nuwara Eliya, Sri Lanka", "1:30 PM", "3 hours", "Lunch and a tea estate visit.")
ella = RouteStop("Ella, Sri Lanka", "5:00 PM", "Overnight", "Sunset from the ridge above the town.")
stops = RouteStops("Your route, stop by stop", [kandy, nuwara, ella])
days = DayPlan("Day 1", "Kandy to Nuwara Eliya", ["Morning train through the tea country", "Afternoon at a tea estate"])
next = FollowUps("Keep planning", ["How do I get from Nuwara Eliya to Ella?", "Which stop suits a slow pace?"])`;
  }
  if (/pack/.test(text)) {
    return `root = PlanningCanvas("Packing for the hills", [list, note, facts], "A checklist for cool evenings and steep paths.")
list = TipList("Pack for the hills", ["Light layers and a rain jacket", "Sturdy shoes for steep paths", "Reusable water bottle"])
note = Callout("caution", "Check entry and health advice", "Confirm visa and health guidance with your government's official travel service.")
facts = KeyFacts("Quick reference", ["Best season: December to March", "Getting around: Trains climb into the hills from Kandy"])`;
  }
  if (/relaxed|day in|day plan/.test(text)) {
    return `root = PlanningCanvas("A slow day in Ella", [lead, card, morning, afternoon], "Ideas to adapt, not bookings.")
lead = Lead("Ella rewards a slow start: a walk before the heat, then tea and a long lunch.")
card = PlaceCard("Little Adam's Peak, Sri Lanka", "A short climb with wide views over the valley.")
morning = DayPlan("Morning", "Walk and breakfast", ["Start the climb before sunrise", "Breakfast with valley views"])
afternoon = DayPlan("Afternoon", "Tea and rest", ["Tea estate visit", "Quiet hour at the guesthouse"])`;
  }
  if (/best time|season|when/.test(text)) {
    return `root = PlanningCanvas("Kandy in the cool season", [lead, gallery, facts, table, note, next], "Ideas to adapt, not bookings.")
lead = Lead("Kandy is at its best from December to March, when the hills are dry and the lake mornings are calm.")
gallery = PlaceGallery("Where to go", ["Kandy, Sri Lanka", "Sigiriya, Sri Lanka", "Galle, Sri Lanka"])
facts = KeyFacts("Quick reference", ["Best season: December to March", "Climate: Cool at elevation, warm in the lowlands"])
table = ComparisonTable("Kandy or Nuwara Eliya", ["Kandy", "Nuwara Eliya"], [["Weather", "Warm, humid and green", "Cool and misty"], ["Pace", "Temples and lake walks", "Tea estates and gardens"]])
note = Callout("caution", "Check entry and health advice", "Confirm visa and health guidance before you go.")
next = FollowUps("Keep planning", ["Which hotel style suits Kandy?", "How many days should we spend in Ella?"])`;
  }
  return `root = PlanningCanvas("Ideas for this trip", [lead, gallery, next], "Places worth a visit.")
lead = Lead("Start with the lake in Kandy, then head into the hills for walks and tea country.")
gallery = PlaceGallery("Places to see", ["Kandy, Sri Lanka", "Ella, Sri Lanka", "Nuwara Eliya, Sri Lanka"])
next = FollowUps("Keep exploring", ["Where should we go first?", "What should we pack?"])`;
}

const scriptedModel: LlmClient = {
  engine: "workers_ai",
  model: "scripted-e2e",
  extract: async () => ({}),
  async *stream(args: LlmTextArgs) {
    const payload = JSON.parse(args.user) as Payload;
    const request = payload.userRequest;
    if (/\[fail-always\]/i.test(request) || (/\[fail-once\]/i.test(request) && !payload.repairNote)) {
      yield `root = PlanningCanvas("Broken", [block])\nblock = Evil("unknown component")`;
      return;
    }
    const program = programFor(request, payload.context);
    for (const line of program.split("\n")) {
      yield `${line}\n`;
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
  },
};

export const harness = new Harness({ buildLlm: () => scriptedModel, fetch: fixtureFetch }, { APP_BASE_URL: process.env.E2E_APP_BASE_URL ?? "http://localhost:3000", COOKIE_SECURE: "false" });

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks);
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers, body });
  const response = await harness.app.fetch(request, harness.env, { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext);
  const outgoing: Record<string, string | string[]> = {};
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") outgoing[name] = value;
  });
  const cookies = (response.headers as unknown as { getSetCookie(): string[] }).getSetCookie();
  if (cookies.length > 0) outgoing["set-cookie"] = cookies;
  res.writeHead(response.status, outgoing);
  if (response.body) Readable.fromWeb(response.body as never).pipe(res);
  else res.end();
});

server.listen(PORT, () => console.log(`planner e2e API listening on http://localhost:${PORT}`));
