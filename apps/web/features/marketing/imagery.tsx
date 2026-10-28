import { cn } from "@/lib/utils";

/**
 * Decorative marketing photography (Sri Lanka), self-hosted from `public/images/marketing/`.
 * Purely atmospheric: no image depicts a product feature or a real customer. Photos are from Unsplash
 * (Unsplash License: free to use, no attribution required), stored as `<name>-<width>.webp`.
 */
export interface MarketingImage {
  name: string;
  alt: string;
  /** Widths available on disk, ascending. */
  widths: readonly number[];
}

const FULL = [800, 1400, 2000] as const;
const CARD = [800, 1400] as const;

export const IMAGES = {
  hero: { name: "hero", widths: FULL, alt: "Sigiriya rock rising above green fields at dusk, Sri Lanka" },
  flow: { name: "flow", widths: FULL, alt: "Morning sun over a tea plantation in the hill country" },
  operators: { name: "operators", widths: CARD, alt: "A blue train winding through hill-country villages" },
  hotels: { name: "hotels", widths: CARD, alt: "Palm trees leaning over a turquoise bay" },
  footer: { name: "footer", widths: FULL, alt: "The Nine Arch Bridge surrounded by jungle" },
  auth: { name: "auth", widths: FULL, alt: "A waterfall falling from a misty green cliff" },
  features: { name: "features", widths: FULL, alt: "Aerial view of terraced green fields" },
  stilts: { name: "stilts", widths: FULL, alt: "Stilt fishermen perched on poles in shallow water off a palm-lined beach" },
  sigiriya: { name: "sigiriya", widths: FULL, alt: "Aerial view of the Sigiriya rock fortress rising above dense forest" },
  temple: { name: "temple", widths: FULL, alt: "Painted fishing boats moored below a golden temple tower" },
  elephants: { name: "elephants", widths: CARD, alt: "A herd of elephants bathing in a shallow river" },
  beach: { name: "beach", widths: CARD, alt: "Aerial view of fishing boats on a sandy beach beside the surf" },
  colombo: { name: "colombo", widths: CARD, alt: "A train heading towards the Lotus Tower in Colombo at golden hour" },
  coconut: { name: "coconut", widths: CARD, alt: "A rope swing hanging from a leaning palm over the beach at sunset" },
} satisfies Record<string, MarketingImage>;

const imageUrl = (img: MarketingImage, width: number) => `/images/marketing/${img.name}-${width}.webp`;

/** Full-bleed cover image. `priority` loads eagerly (first screen only); `decorative` hides it from assistive tech. */
export function Photo({ image, className, sizes = "100vw", priority, decorative }: { image: MarketingImage; className?: string; sizes?: string; priority?: boolean; decorative?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl(image, image.widths[image.widths.length - 1]!)}
      srcSet={image.widths.map((w) => `${imageUrl(image, w)} ${w}w`).join(", ")}
      sizes={sizes}
      alt={decorative ? "" : image.alt}
      aria-hidden={decorative || undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cn("bg-muted object-cover", className)}
    />
  );
}
