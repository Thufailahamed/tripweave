/**
 * Destination photography for generated planning interfaces.
 *
 * These are presentation assets only: the model never sees or emits a URL, and the server's snapshot
 * remains the sole source of business facts. Images come from Wikimedia Commons under the licences
 * recorded below; every card shows the credit, and unknown destinations fall back to generated
 * postcard artwork instead of a broken image. Hotel photos uploaded by the organisation take
 * precedence whenever an offer has a cover image.
 */
export interface DestinationImage {
  src: string;
  alt: string;
  credit: string;
  licence: string;
  sourceUrl: string;
}

const image = (src: string, alt: string, credit: string, licence: string, sourceUrl: string): DestinationImage => ({ src, alt, credit, licence, sourceUrl });

const IMAGES: Record<string, DestinationImage> = {
  kandy: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/SL_Kandy_asv2020-01_img11_Arthurs_Seat_view.jpg/1280px-SL_Kandy_asv2020-01_img11_Arthurs_Seat_view.jpg",
    "Kandy lake and the city below the hills",
    "A.Savin",
    "FAL",
    "https://commons.wikimedia.org/wiki/File:SL_Kandy_asv2020-01_img11_Arthurs_Seat_view.jpg",
  ),
  ella: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8a/Nine_Arch_Bridge%2C_Demodara_Ella.jpg/1280px-Nine_Arch_Bridge%2C_Demodara_Ella.jpg",
    "The Nine Arch Bridge near Ella",
    "Dr.S.Rajivraja",
    "CC BY-SA 4.0",
    "https://commons.wikimedia.org/wiki/File:Nine_Arch_Bridge,_Demodara_Ella.jpg",
  ),
  galle: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fd/Lighthouse_Galle%2C_Sri_Lanka.jpg/1280px-Lighthouse_Galle%2C_Sri_Lanka.jpg",
    "The white lighthouse on Galle Fort",
    "Samal Nadeeshan",
    "CC BY-SA 4.0",
    "https://commons.wikimedia.org/wiki/File:Lighthouse_Galle,_Sri_Lanka.jpg",
  ),
  colombo: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0b/SL_Colombo_asv2020-01_img25_Cargills_Building.jpg/1280px-SL_Colombo_asv2020-01_img25_Cargills_Building.jpg",
    "The Cargills building in Colombo",
    "A.Savin",
    "FAL",
    "https://commons.wikimedia.org/wiki/File:SL_Colombo_asv2020-01_img25_Cargills_Building.jpg",
  ),
  "nuwara eliya": image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/22/Sri_Lanka%2C_Tea_plantations_near_Nuwara_Eliya%2C_Tea_estate.jpg/1280px-Sri_Lanka%2C_Tea_plantations_near_Nuwara_Eliya%2C_Tea_estate.jpg",
    "Tea country around Nuwara Eliya",
    "Vyacheslav Argenberg",
    "CC BY 4.0",
    "https://commons.wikimedia.org/wiki/File:Sri_Lanka,_Tea_plantations_near_Nuwara_Eliya,_Tea_estate.jpg",
  ),
  sigiriya: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c7/Sigiriya.jpg/1280px-Sigiriya.jpg",
    "Sigiriya rock rising above the plain",
    "Bernard Gagnon",
    "CC BY-SA 3.0",
    "https://commons.wikimedia.org/wiki/File:Sigiriya.jpg",
  ),
  mirissa: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/80/Secret_beach_-_Mirissa_Sri_Lanka.jpg/1280px-Secret_beach_-_Mirissa_Sri_Lanka.jpg",
    "Turquoise water at Secret Beach, Mirissa",
    "Praveenshashika",
    "CC BY-SA 4.0",
    "https://commons.wikimedia.org/wiki/File:Secret_beach_-_Mirissa_Sri_Lanka.jpg",
  ),
  bentota: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/Sri_Lanka%2C_Bentota%2C_beach_%281%29.JPG/1280px-Sri_Lanka%2C_Bentota%2C_beach_%281%29.JPG",
    "Bentota beach",
    "Vincent van Zeijst",
    "CC BY-SA 3.0",
    "https://commons.wikimedia.org/wiki/File:Sri_Lanka,_Bentota,_beach_(1).JPG",
  ),
  trincomalee: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/88/Uppveli_Beach_in_Trincomalee%2C_Sri_Lanka.jpg/1280px-Uppveli_Beach_in_Trincomalee%2C_Sri_Lanka.jpg",
    "Uppuveli beach in Trincomalee",
    "Honeplus",
    "CC BY-SA 3.0",
    "https://commons.wikimedia.org/wiki/File:Uppveli_Beach_in_Trincomalee,_Sri_Lanka.jpg",
  ),
  dambulla: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bd/Dambulla_Cave_1.jpg/1280px-Dambulla_Cave_1.jpg",
    "The cave temple at Dambulla",
    "Philip Nalangan",
    "CC BY 4.0",
    "https://commons.wikimedia.org/wiki/File:Dambulla_Cave_1.jpg",
  ),
  anuradhapura: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4c/SL_Anuradhapura_asv2020-01_img24_Jetavanaramaya_Stupa.jpg/1280px-SL_Anuradhapura_asv2020-01_img24_Jetavanaramaya_Stupa.jpg",
    "Jetavanaramaya stupa in Anuradhapura",
    "A.Savin",
    "FAL",
    "https://commons.wikimedia.org/wiki/File:SL_Anuradhapura_asv2020-01_img24_Jetavanaramaya_Stupa.jpg",
  ),
  negombo: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/30/SL_Negombo_asv2020-01_img02_Dutch_canal.jpg/1280px-SL_Negombo_asv2020-01_img02_Dutch_canal.jpg",
    "Boats on the Dutch canal in Negombo",
    "A.Savin",
    "FAL",
    "https://commons.wikimedia.org/wiki/File:SL_Negombo_asv2020-01_img02_Dutch_canal.jpg",
  ),
  yala: image(
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/78/SL_Yala_NP_BlockV_asv2020-01_img05.jpg/1280px-SL_Yala_NP_BlockV_asv2020-01_img05.jpg",
    "Yala National Park",
    "A.Savin",
    "FAL",
    "https://commons.wikimedia.org/wiki/File:SL_Yala_NP_BlockV_asv2020-01_img05.jpg",
  ),
};

export function destinationKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Resolves a destination name, allowing "Kandy District" or "Galle Fort" to match their city. */
export function destinationImage(name: string | null | undefined): DestinationImage | null {
  const key = destinationKey(name);
  if (!key) return null;
  if (IMAGES[key]) return IMAGES[key]!;
  // Match the exact name or its first segment ("Kandy, Sri Lanka" -> "kandy"), never a longer name that
  // merely contains a curated one, so a place cannot borrow another destination's photograph.
  const head = destinationKey((name ?? "").split(",")[0]);
  return IMAGES[head] ?? null;
}

export function hotelImageUrl(imageId: string | null | undefined): string | null {
  return imageId ? `/api/v1/media/${imageId}` : null;
}

export function uniqueCredits(images: (DestinationImage | null)[]): DestinationImage[] {
  const seen = new Set<string>();
  return images.filter((entry): entry is DestinationImage => {
    if (!entry || seen.has(entry.src)) return false;
    seen.add(entry.src);
    return true;
  });
}
