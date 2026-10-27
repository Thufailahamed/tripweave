export interface Place {
  name: string;
  aliases: string[];
  latitude: number;
  longitude: number;
  country: string;
}

/**
 * Small built-in gazetteer for Sri Lankan destinations so stops can be positioned without a
 * geocoding provider. Coordinates are approximate town centres. Unknown places must be positioned
 * manually (or by a geocoding adapter) rather than guessed.
 */
export const GAZETTEER: Place[] = [
  { name: "Colombo", aliases: [], latitude: 6.9271, longitude: 79.8612, country: "LK" },
  { name: "Negombo", aliases: [], latitude: 7.2008, longitude: 79.8737, country: "LK" },
  { name: "Bandaranaike International Airport", aliases: ["cmb", "colombo airport", "katunayake", "airport"], latitude: 7.1808, longitude: 79.8841, country: "LK" },
  { name: "Sigiriya", aliases: ["sigiriya rock", "lion rock"], latitude: 7.957, longitude: 80.7603, country: "LK" },
  { name: "Dambulla", aliases: [], latitude: 7.8742, longitude: 80.6511, country: "LK" },
  { name: "Habarana", aliases: [], latitude: 8.0386, longitude: 80.7482, country: "LK" },
  { name: "Polonnaruwa", aliases: [], latitude: 7.9403, longitude: 81.0188, country: "LK" },
  { name: "Anuradhapura", aliases: [], latitude: 8.3114, longitude: 80.4037, country: "LK" },
  { name: "Kandy", aliases: ["mahanuwara"], latitude: 7.2906, longitude: 80.6337, country: "LK" },
  { name: "Nuwara Eliya", aliases: ["nuwaraeliya", "little england"], latitude: 6.9497, longitude: 80.7891, country: "LK" },
  { name: "Ella", aliases: [], latitude: 6.8667, longitude: 81.0466, country: "LK" },
  { name: "Haputale", aliases: [], latitude: 6.7667, longitude: 80.95, country: "LK" },
  { name: "Yala", aliases: ["yala national park", "tissamaharama"], latitude: 6.3725, longitude: 81.5185, country: "LK" },
  { name: "Udawalawe", aliases: ["udawalawe national park"], latitude: 6.4367, longitude: 80.8886, country: "LK" },
  { name: "Galle", aliases: ["galle fort", "south coast", "southern coast"], latitude: 6.0535, longitude: 80.221, country: "LK" },
  { name: "Mirissa", aliases: [], latitude: 5.9483, longitude: 80.4716, country: "LK" },
  { name: "Bentota", aliases: [], latitude: 6.4258, longitude: 79.9956, country: "LK" },
  { name: "Hikkaduwa", aliases: [], latitude: 6.1395, longitude: 80.1063, country: "LK" },
  { name: "Unawatuna", aliases: [], latitude: 6.0174, longitude: 80.2489, country: "LK" },
  { name: "Trincomalee", aliases: ["trinco"], latitude: 8.5874, longitude: 81.2152, country: "LK" },
  { name: "Arugam Bay", aliases: [], latitude: 6.8402, longitude: 81.8353, country: "LK" },
  { name: "Jaffna", aliases: [], latitude: 9.6615, longitude: 80.0255, country: "LK" },
  { name: "Pinnawala", aliases: [], latitude: 7.3004, longitude: 80.3879, country: "LK" },
  { name: "Adam's Peak", aliases: ["dalhousie", "sri pada"], latitude: 6.8096, longitude: 80.4994, country: "LK" },
  { name: "Bandarawela", aliases: [], latitude: 6.8329, longitude: 80.9877, country: "LK" },
];

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export function findPlace(query: string): Place | null {
  const q = normalise(query);
  if (!q) return null;
  for (const p of GAZETTEER) {
    if (normalise(p.name) === q || p.aliases.some((a) => normalise(a) === q)) return p;
  }
  for (const p of GAZETTEER) {
    const n = normalise(p.name);
    if (q.includes(n) || n.includes(q)) return p;
  }
  return null;
}

/** Finds known places mentioned inside free text, in order of appearance, without duplicates. */
export function findPlacesInText(text: string): Place[] {
  const hay = ` ${normalise(text)} `;
  const hits: { place: Place; index: number }[] = [];
  for (const p of GAZETTEER) {
    if (p.name === "Bandaranaike International Airport") continue;
    for (const term of [p.name, ...p.aliases]) {
      const n = normalise(term);
      if (n.length < 3) continue;
      const idx = hay.indexOf(` ${n} `);
      if (idx >= 0) {
        hits.push({ place: p, index: idx });
        break;
      }
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits.map((h) => h.place);
}
