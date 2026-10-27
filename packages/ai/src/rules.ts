import { findPlacesInText } from "@tripweave/itinerary-engine";
import { addDays, isIsoDate, type ParsedTrip } from "@tripweave/shared";

/**
 * Deterministic requirement extractor. It only reports what the text states; anything it cannot
 * establish is returned as null / empty so callers can ask a clarifying question instead of guessing.
 */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
const NUM = "(\\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)";
const toNum = (s: string): number => (/^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s.toLowerCase()] ?? NaN);

const CHILD_WORDS = "children|child|kids?|infants?|toddlers?";
/** Ages or child age lists, e.g. "kids (8, 11)", "children aged 8 and 11", "two adults and two kids 8, 11". */
const AGE_CONTEXT_RE = new RegExp(
  `\\b(?:${CHILD_WORDS}|ages?|aged?)\\b(?:\\s+(?:are|is|of|ages?|aged?)\\b)*[\\s:(\\[]*((?:\\d{1,2}(?:\\s*(?:years?|yrs?|y\\.?o\\.?))?\\s*(?:(?:,|\\/|&|\\band\\b)\\s*)?)+)`,
  "gi",
);

/** Numbers that are actually durations/other party sizes must not become child ages. */
function extractChildAges(text: string): number[] {
  const ages: number[] = [];
  for (const match of text.matchAll(AGE_CONTEXT_RE)) {
    const list = match[1];
    if (!list) continue;
    const listStart = (match.index ?? 0) + match[0].length - list.length;
    for (const number of list.matchAll(/\d{1,2}/g)) {
      const age = Number(number[0]);
      if (age > 17) continue;
      const following = text.slice(listStart + (number.index ?? 0) + number[0].length);
      if (/^\s*(?:nights?|days?|hours?|weeks?|months?|adults?|rooms?|guests?|people)\b/i.test(following)) continue;
      ages.push(age);
    }
  }
  return ages;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthIndex = (m: string): number => MONTHS.findIndex((x) => x.startsWith(m.toLowerCase().slice(0, 3)));
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

function iso(y: number, m: number, d: number): string | null {
  const s = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(s) ? s : null;
}

/** Extracts explicit calendar dates only; dates without a year are deliberately NOT guessed. */
export function extractDates(text: string): string[] {
  const out: { i: number; d: string }[] = [];
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) if (isIsoDate(m[0])) out.push({ i: m.index ?? 0, d: m[0] });
  // "10 December 2026", "10th Dec 2026"
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, "gi"))) {
    const d = iso(Number(m[3]), monthIndex(m[2]!), Number(m[1]));
    if (d) out.push({ i: m.index ?? 0, d });
  }
  // "December 10, 2026"
  for (const m of text.matchAll(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"))) {
    const d = iso(Number(m[3]), monthIndex(m[1]!), Number(m[2]));
    if (d) out.push({ i: m.index ?? 0, d });
  }
  // "10-14 December 2026" ranges
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|to)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, "gi"))) {
    const a = iso(Number(m[4]), monthIndex(m[3]!), Number(m[1]));
    const b = iso(Number(m[4]), monthIndex(m[3]!), Number(m[2]));
    if (a) out.push({ i: m.index ?? 0, d: a });
    if (b) out.push({ i: (m.index ?? 0) + 1, d: b });
  }
  const seen = new Set<string>();
  return out.sort((a, b) => a.i - b.i).map((x) => x.d).filter((d) => (seen.has(d) ? false : (seen.add(d), true)));
}

const CURRENCY_SYMBOLS: Record<string, "USD" | "EUR" | "GBP" | "LKR"> = { $: "USD", "€": "EUR", "£": "GBP", rs: "LKR", "rs.": "LKR", lkr: "LKR", usd: "USD", eur: "EUR", gbp: "GBP" };

function extractBudget(text: string): { amount: number | null; currency: ParsedTrip["budgetCurrency"] } {
  const pre = /(?:budget|spend|afford|up to|around|approximately|about|max(?:imum)?)[^.\n]{0,60}?(usd|eur|gbp|lkr|rs\.?|\$|€|£)\s?([\d,]+(?:\.\d+)?)/i.exec(text) ?? /(usd|eur|gbp|lkr|rs\.?|\$|€|£)\s?([\d,]+(?:\.\d+)?)/i.exec(text);
  if (pre) return { amount: Number(pre[2]!.replace(/,/g, "")), currency: CURRENCY_SYMBOLS[pre[1]!.toLowerCase()] ?? null };
  const post = /([\d,]+(?:\.\d+)?)\s?(usd|eur|gbp|lkr|dollars|euros|pounds|rupees)\b/i.exec(text);
  if (post) {
    const c = post[2]!.toLowerCase();
    const cur = c === "dollars" ? "USD" : c === "euros" ? "EUR" : c === "pounds" ? "GBP" : c === "rupees" ? "LKR" : (c.toUpperCase() as "USD");
    return { amount: Number(post[1]!.replace(/,/g, "")), currency: cur };
  }
  return { amount: null, currency: null };
}

const AMENITY_KEYWORDS: [RegExp, string][] = [
  [/\b(swimming )?pool\b/i, "pool"], [/\bspa\b/i, "spa"], [/\bwi-?fi\b|\binternet\b/i, "wifi"], [/\bgym\b|\bfitness\b/i, "gym"],
  [/\bair[- ]?con(ditioning)?\b|\bA\/?C\b/, "air_conditioning"], [/\bparking\b/i, "parking"], [/\bscenic\b|\b(mountain|lake|garden|valley|sea|ocean) views?\b|\bviews?\b/i, "view"],
  [/\brestaurant\b/i, "restaurant"], [/\bbar\b/i, "bar"], [/\bairport (transfer|shuttle)\b/i, "airport_transfer"], [/\bfireplace\b/i, "fireplace"],
];
const REQUIRE_RE = /\b(must|need|needs|required|require|essential|mandatory|has to|have to)\b/i;

const ACTIVITY_KEYWORDS: [RegExp, string][] = [
  [/\bsafari\b/i, "Safari"], [/\bhik(e|ing)\b/i, "Hiking"], [/\btea (plantation|factory|estate)s?\b/i, "Tea plantation visit"], [/\btemple( of the tooth)?\b/i, "Temple visit"],
  [/\b(scenic )?train (ride|journey)\b/i, "Scenic train ride"], [/\bwhale watching\b/i, "Whale watching"], [/\bwaterfalls?\b/i, "Waterfalls"], [/\bsnorkel(l?ing)?\b/i, "Snorkelling"],
  [/\bsigiriya rock\b|\bclimb(ing)? sigiriya\b/i, "Sigiriya Rock climb"], [/\bcooking class\b/i, "Cooking class"], [/\belephant\b/i, "Elephant experience"],
];

export function extractWithRules(text: string): ParsedTrip {
  const lower = text.toLowerCase();
  const dates = extractDates(text);
  const arrival = dates[0] ?? null;
  const departure = dates.length > 1 ? dates[dates.length - 1]! : null;

  let nights: number | null = null;
  let days: number | null = null;
  // "N nights in <known town>" is an overnight stop; "10 nights in Sri Lanka" is the trip length.
  const nightsM = [...text.matchAll(new RegExp(`${NUM}[- ]nights?\\b(?:\\s+in\\s+([^,.;\\n]{1,40}))?`, "gi"))].find((m) => !(m[2] && findPlacesInText(m[2]).length > 0));
  const daysM = new RegExp(`${NUM}[- ]days?\\b`, "i").exec(text);
  if (nightsM && Number.isFinite(toNum(nightsM[1]!))) nights = toNum(nightsM[1]!);
  if (daysM && Number.isFinite(toNum(daysM[1]!))) days = toNum(daysM[1]!);
  if (nights === null && days !== null && days > 1) nights = days - 1;
  if (days === null && nights !== null) days = nights + 1;
  if (nights === null && arrival && departure) nights = Math.max(1, Math.round((Date.parse(departure) - Date.parse(arrival)) / 86_400_000));

  let adults: number | null = null;
  const adultsM = new RegExp(`${NUM}\\s+adults?\\b`, "i").exec(text);
  if (adultsM && Number.isFinite(toNum(adultsM[1]!))) adults = toNum(adultsM[1]!);
  else if (/\b(couple|honeymoon)\b/.test(lower)) adults = 2;
  else if (/\b(solo|alone|myself|by myself)\b/.test(lower)) adults = 1;

  let children: number | null = null;
  const childM = new RegExp(`${NUM}\\s+(?:${CHILD_WORDS})\\b`, "i").exec(text);
  if (childM && Number.isFinite(toNum(childM[1]!))) children = toNum(childM[1]!);
  const childAges = extractChildAges(text);
  if (children === null && childAges.length > 0) children = childAges.length;
  if (children !== null && childAges.length > children) childAges.length = children;
  // "Family of 4 with 2 kids": the party size includes the children. Never guessed when the split is unknown.
  const familyM = new RegExp(`\\b(?:family|party|group)\\s+of\\s+${NUM}\\b`, "i").exec(text);
  if (adults === null && familyM && children !== null && Number.isFinite(toNum(familyM[1]!))) adults = Math.max(1, toNum(familyM[1]!) - children);

  let roomCount: number | null = null;
  const roomM = new RegExp(`${NUM}\\s+(?:rooms?|bedrooms?)\\b`, "i").exec(text);
  if (roomM && Number.isFinite(toNum(roomM[1]!))) roomCount = toNum(roomM[1]!);

  const { amount, currency } = extractBudget(text);
  let budgetScope: ParsedTrip["budgetScope"] = null;
  if (amount !== null) {
    if (/\b(total|overall|whole|entire|all[- ]inclusive)\s+(trip\s+)?budget\b|\bbudget\s+(for|of)\s+the\s+(whole|entire)\s+trip\b/i.test(text)) budgetScope = "all_inclusive_trip";
    else if (
      /\b(accommodation|hotel|stay|room)s?\s+budget\b|\bbudget\s+(for|of)\s+(the\s+)?(accommodation|hotels?|rooms?)\b|\baccommodation budget\b|\b(?:around|approximately|about|up to|max(?:imum)?|budget|spend|afford)\b[^.\n]{0,80}?\b(?:for|on)\s+(?:the\s+)?(?:accommodation|hotels?|stays?|rooms?)\b/i.test(
        text,
      )
    )
      budgetScope = "accommodation_only";
  }

  let category: ParsedTrip["preferredHotelCategory"] = null;
  if (/\bboutique\b/i.test(text)) category = "boutique";
  else if (/\bluxur(y|ious)\b|\b5[- ]star\b/i.test(text)) category = "luxury";
  else if (/\bpremium\b|\bupscale\b|\b4[- ]star\b/i.test(text)) category = "premium";
  else if (/\bcomfortable\b|\bmid[- ]range\b|\b3[- ]star\b/i.test(text)) category = "comfort";
  else if (/\bbudget (hotels?|accommodation|stays?|friendly)\b|\bcheap\b|\bbackpacker\b/i.test(text)) category = "budget";
  else if (/\bstandard\b/i.test(text)) category = "standard";

  const mealPlans: ParsedTrip["mealPlans"] = [];
  if (/breakfast|\bbed (and|&) breakfast\b|\bB&B\b|\bBB\b/i.test(text)) mealPlans.push("BB");
  if (/half[- ]board|\bHB\b/i.test(text)) mealPlans.push("HB");
  if (/full[- ]board|\bFB\b/i.test(text)) mealPlans.push("FB");
  if (/all[- ]inclusive\b(?!\s+(trip\s+)?budget)/i.test(text) && !/all[- ]inclusive\s+(trip\s+)?budget/i.test(text)) mealPlans.push("AI");
  if (/room[- ]only/i.test(text)) mealPlans.push("RO");

  const requiredAmenities: string[] = [];
  const preferredAmenities: string[] = [];
  for (const sentence of text.split(/(?<=[.!?\n])\s+/)) {
    for (const [re, name] of AMENITY_KEYWORDS) {
      if (!re.test(sentence)) continue;
      const list = REQUIRE_RE.test(sentence) ? requiredAmenities : preferredAmenities;
      if (!requiredAmenities.includes(name) && !preferredAmenities.includes(name)) list.push(name);
    }
  }

  const accessibility: string[] = [];
  if (/wheelchair/i.test(text)) accessibility.push("Wheelchair access");
  if (/step[- ]free|no stairs|ground floor/i.test(text)) accessibility.push("Step-free / ground-floor rooms");
  if (/elderly|mobility|limited mobility/i.test(text)) accessibility.push("Limited mobility");

  let maxLeg: number | null = null;
  const legM = new RegExp(`(?:no more than|max(?:imum)?(?: of)?|under|less than|within|not more than)\\s+${NUM}\\s*(?:hours?|hrs?|h)\\b(?:\\s+(?:of\\s+)?(?:driving|drive|travel))?`, "i").exec(text);
  if (legM && Number.isFinite(toNum(legM[1]!))) maxLeg = toNum(legM[1]!) * 60;

  const places = findPlacesInText(text).map((p) => p.name);
  const overnightStops: ParsedTrip["overnightStops"] = [];
  for (const m of text.matchAll(new RegExp(`${NUM}\\s+nights?\\s+in\\s+([A-Z][A-Za-z' ]+?)(?=[,.;]|\\s+and\\b|\\s+then\\b|$)`, "g"))) {
    const n = toNum(m[1]!);
    const place = findPlacesInText(m[2]!)[0];
    if (Number.isFinite(n) && place) overnightStops.push({ destination: place.name, nights: n });
  }

  const activities: string[] = [];
  for (const [re, label] of ACTIVITY_KEYWORDS) if (re.test(text) && !activities.includes(label)) activities.push(label);

  const other: string[] = [];
  if (/honeymoon/i.test(text)) other.push("Honeymoon");
  if (/anniversary/i.test(text)) other.push("Anniversary");
  if (/vegetarian|vegan|halal|gluten/i.test(text)) other.push("Dietary requirements mentioned");

  const parsed: ParsedTrip = {
    arrivalDate: arrival,
    departureDate: departure ?? (arrival && nights ? addDays(arrival, nights) : null),
    nights,
    durationDays: days,
    destinations: places,
    overnightStops,
    activities,
    adults,
    children,
    childAges,
    roomCount,
    budgetAmount: amount,
    budgetCurrency: currency,
    budgetScope,
    preferredHotelCategory: category,
    mealPlans: [...new Set(mealPlans)],
    requiredAmenities,
    preferredAmenities,
    accessibility,
    maxLegDurationMinutes: maxLeg,
    cancellationPreference: /free cancel|flexible (booking|cancel)|refundable/i.test(text) ? "free_cancellation" : null,
    otherRequirements: other,
    clarifyingQuestions: [],
  };
  return parsed;
}
