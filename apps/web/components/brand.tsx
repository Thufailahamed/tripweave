import Link from "next/link";
import { cn } from "@/lib/utils";

/** TripWeave mark: four crossing strands, woven into a star. Inherits `currentColor`. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-5 shrink-0", className)} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
    </svg>
  );
}

/** Mark + wordmark. `name` lets white-labelled organisations show their own product name. */
export function Logo({ href = "/", name = "TripWeave", className }: { href?: string; name?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 text-foreground", className)} aria-label={`${name} home`}>
      <LogoMark />
      <span className="truncate text-xl font-semibold tracking-[-0.07em] md:text-2xl">{name}</span>
    </Link>
  );
}
