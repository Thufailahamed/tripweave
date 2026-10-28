import { LogoMark } from "@/components/brand";
import { IntroSeen } from "@/components/motion";

const WORD = "TripWeave";

/**
 * Landing-page intro curtain: mark spins in, the wordmark rises, a 0→100 counter and line run, then the
 * curtain lifts to reveal the hero. Pure CSS (globals.css `.tw-intro*`), shown once per browser session
 * (the root layout marks `data-intro-seen`) and skipped entirely under reduced motion.
 */
export function IntroCurtain() {
  return (
    <div className="tw-intro" aria-hidden>
      <IntroSeen />
      <div className="flex items-center justify-between border-b border-border px-4 py-5 text-xs text-muted-foreground md:px-8">
        <span>Tour planning &amp; quotation</span>
        <span>Loading</span>
      </div>
      <div className="flex flex-col items-center gap-6 px-4">
        <LogoMark className="tw-intro-mark size-10 text-white md:size-12" />
        <p className="tw-wide text-4xl text-accent md:text-6xl">
          <span className="tw-mask">
            {[...WORD].map((ch, i) => (
              <span key={i} className="tw-letter" style={{ "--i": i, animationDelay: `${120 + i * 45}ms` } as React.CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
        </p>
      </div>
      <div>
        <div className="flex items-end justify-between px-4 pb-4 md:px-8">
          <span className="text-xs text-muted-foreground">Weaving itineraries</span>
          <span className="tw-intro-count tw-num tw-wide text-5xl md:text-7xl" />
        </div>
        <div className="h-px bg-border">
          <div className="tw-intro-bar h-px bg-accent" />
        </div>
      </div>
    </div>
  );
}
