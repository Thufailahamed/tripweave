import { cn } from "@/lib/utils";

/** Link/button label that rolls up to a copy of itself on hover (the hover target is the nearest `.group`). */
export function RollText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("tw-roll", className)}>
      <span data-text={text}>{text}</span>
    </span>
  );
}

/** Small hexagon badge holding an icon (or a glyph), the marketing site's recurring motif. */
export function Hex({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span aria-hidden className={cn("tw-hex inline-flex shrink-0 items-center justify-center", className)}>
      {children}
    </span>
  );
}

/** Section label: a lime hexagon dot followed by quiet text. */
export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-xs font-medium uppercase tracking-[0.14em] text-foreground/55", className)}>
      <span aria-hidden className="tw-hex size-2.5 bg-accent" />
      {children}
    </span>
  );
}
