"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Motion primitives (marketing site and app). No animation library: one shared IntersectionObserver for reveals, and
 * rAF-throttled scroll listeners that only write a CSS variable (`--p`, 0..1); the look lives in
 * globals.css. Under prefers-reduced-motion nothing is written, so every CSS fallback is a static state.
 */

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/* ---------- reveal on enter ---------- */
let revealObserver: IntersectionObserver | null = null;
function observeReveal(el: Element) {
  revealObserver ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        revealObserver?.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.01 },
  );
  revealObserver.observe(el);
  return () => revealObserver?.unobserve(el);
}
function useReveal<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  React.useEffect(() => (ref.current ? observeReveal(ref.current) : undefined), []);
  return ref;
}

type Tag = "div" | "section" | "article" | "li" | "ol" | "ul" | "p" | "span" | "h1" | "h2" | "h3" | "dl" | "nav";
type BaseProps = Omit<React.HTMLAttributes<HTMLElement>, "style"> & { as?: Tag; style?: Vars };

/** Fades/slides (`up`), fades (`fade`) or unmasks (`clip`, for image frames) when scrolled into view. */
export function Reveal({ as = "div", variant = "up", delay = 0, style, ...props }: BaseProps & { variant?: "up" | "fade" | "clip"; delay?: number }) {
  const ref = useReveal<HTMLElement>();
  const Comp = as as React.ElementType;
  return <Comp ref={ref} data-reveal={variant} style={{ ...style, "--d": `${delay}ms` }} {...props} />;
}

/** Heading whose words rise out of masks, staggered. Screen readers get the plain text. */
export function RevealWords({ as = "h2", text, delay = 0, className, id }: { as?: Tag; text: string; delay?: number; className?: string; id?: string }) {
  const ref = useReveal<HTMLElement>();
  const Comp = as as React.ElementType;
  const words = text.split(" ");
  return (
    <Comp ref={ref} id={id} className={cn("tw-words", className)} style={{ "--d": `${delay}ms` } as Vars}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, i) => (
          <React.Fragment key={i}>
            <span className="w">
              <span style={{ "--i": i } as Vars}>{w}</span>
            </span>
            {i < words.length - 1 ? " " : null}
          </React.Fragment>
        ))}
      </span>
    </Comp>
  );
}

/* ---------- scroll progress ---------- */
/**
 * - `through`: 0 when the element's top enters the bottom of the viewport, 1 when its bottom leaves the top.
 * - `exit`: 0 at rest at the top of the page, 1 once the element has scrolled fully out (heroes).
 * - `sticky`: progress through a tall wrapper whose child is `position: sticky` (pinned scenes).
 * - `read`: 0 when the top is at 85% of the viewport, 1 when the bottom reaches its middle (text highlight).
 */
type Mode = "through" | "exit" | "sticky" | "read";
function progress(mode: Mode, r: DOMRect, vh: number) {
  if (mode === "exit") return -r.top / Math.max(1, r.height);
  if (mode === "sticky") return -r.top / Math.max(1, r.height - vh);
  if (mode === "read") return (vh * 0.85 - r.top) / (vh * 0.35 + r.height);
  return (vh - r.top) / (vh + r.height);
}

function useScrollFrame(onFrame: () => void, deps: React.DependencyList) {
  React.useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const run = () => {
      raf = 0;
      onFrame();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    run();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Wrapper that exposes its scroll progress as `--p` to CSS. */
export function ScrollScene({ as = "div", mode = "through", ...props }: BaseProps & { mode?: Mode }) {
  const ref = React.useRef<HTMLElement>(null);
  useScrollFrame(() => {
    const el = ref.current;
    if (!el) return;
    const p = Math.min(1, Math.max(0, progress(mode, el.getBoundingClientRect(), window.innerHeight)));
    el.style.setProperty("--p", p.toFixed(4));
  }, [mode]);
  const Comp = as as React.ElementType;
  return <Comp ref={ref} {...props} />;
}

/** Paragraph whose words brighten one by one while it is read. */
export function ScrollHighlight({ as = "p", text, className, id }: { as?: Tag; text: string; className?: string; id?: string }) {
  const words = text.split(" ");
  return (
    <ScrollScene as={as} mode="read" id={id} className={cn("tw-highlight", className)} style={{ "--n": words.length }}>
      {words.map((w, i) => (
        <span key={i} style={{ "--i": i } as Vars}>
          {w}{" "}
        </span>
      ))}
    </ScrollScene>
  );
}

/**
 * Pinned horizontal track (desktop): the section is made as tall as the track is wide, its inner panel
 * sticks to the viewport, and vertical scrolling slides the track sideways. Below `lg` (or with reduced
 * motion) the children simply stack.
 */
export function HorizontalScroll({ header, footer, children, className, trackClassName }: { header?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; className?: string; trackClassName?: string }) {
  const outer = React.useRef<HTMLDivElement>(null);
  const track = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const o = outer.current;
    const t = track.current;
    if (!o || !t) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    let distance = 0;
    let enabled = false;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!enabled) return;
      const p = Math.min(1, Math.max(0, progress("sticky", o.getBoundingClientRect(), window.innerHeight)));
      t.style.transform = `translate3d(${(-p * distance).toFixed(1)}px,0,0)`;
      o.style.setProperty("--p", p.toFixed(4));
    };
    const measure = () => {
      enabled = mq.matches && !prefersReducedMotion();
      if (!enabled) {
        o.style.height = "";
        t.style.transform = "";
        o.style.removeProperty("--p");
        return;
      }
      distance = Math.max(0, t.scrollWidth - o.clientWidth);
      o.style.height = `${window.innerHeight + distance}px`;
      update();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    mq.addEventListener("change", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
      mq.removeEventListener("change", measure);
    };
  }, []);
  return (
    <div ref={outer} className={cn("relative", className)}>
      <div className="flex flex-col lg:sticky lg:top-0 lg:h-screen lg:justify-center lg:overflow-hidden">
        {header}
        <div ref={track} className={cn("flex flex-col lg:w-max lg:flex-row lg:will-change-transform", trackClassName)}>
          {children}
        </div>
        {footer}
      </div>
    </div>
  );
}

/** Counts up from 0 when first seen. Server-renders the final value. */
export function CountUp({ value, duration = 1600 }: { value: number; duration?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [shown, setShown] = React.useState(value);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let raf = 0;
    if (el.getBoundingClientRect().top > window.innerHeight) setShown(0);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const k = Math.min(1, (t - t0) / duration);
          setShown(Math.round(value * (1 - (1 - k) ** 4)));
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);
  return (
    <span ref={ref} className="tw-num">
      {shown}
    </span>
  );
}

/**
 * Marketing header behaviour: hides while scrolling down, returns on scroll up, turns opaque once the
 * page has scrolled, and exposes page read progress as `--page-p`.
 */
export function ScrollHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLElement>(null);
  const last = React.useRef(0);
  React.useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.dataset.scrolled = y > 40 ? "1" : "0";
      if (Math.abs(y - last.current) > 8) {
        el.dataset.hidden = y > last.current && y > 240 ? "1" : "0";
        last.current = y;
      }
      el.style.setProperty("--page-p", (max > 0 ? Math.min(1, y / max) : 0).toFixed(4));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
    };
  }, []);
  return (
    <header ref={ref} className={className}>
      {children}
    </header>
  );
}

/**
 * Marks the intro as seen for this session once it has actually played, so returning to the landing page
 * via client-side navigation skips it. (The time check also ignores StrictMode's instant unmount/remount.)
 */
export function IntroSeen() {
  React.useEffect(() => {
    const mountedAt = performance.now();
    try {
      sessionStorage.setItem("tw.intro", "1");
    } catch {
      /* storage unavailable */
    }
    return () => {
      if (performance.now() - mountedAt > 2000) document.documentElement.dataset.introSeen = "1";
    };
  }, []);
  return null;
}

/**
 * Pinned step scene (desktop): a tall wrapper whose sticky child plays `count` steps in turn. Every
 * `[data-step-item="i"]` descendant gets `data-state` = before | active | after, and the wrapper exposes
 * `--p` (whole scene) and `--lp` (progress within the active step). `[data-step-go="i"]` buttons scroll
 * to that step. Below `lg` (or with reduced motion) nothing is written, so every step shows in flow.
 */
export function ScrollSteps({ count, className, children, ...props }: Omit<BaseProps, "as"> & { count: number }) {
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    let raf = 0;
    let current = -1;
    const items = () => el.querySelectorAll<HTMLElement>("[data-step-item]");
    const update = () => {
      raf = 0;
      if (!mq.matches || prefersReducedMotion()) {
        if (current !== -1) for (const it of items()) it.removeAttribute("data-state");
        current = -1;
        return;
      }
      const p = Math.min(1, Math.max(0, progress("sticky", el.getBoundingClientRect(), window.innerHeight)));
      const step = Math.min(count - 1, Math.floor(p * count));
      el.style.setProperty("--p", p.toFixed(4));
      el.style.setProperty("--lp", Math.min(1, p * count - step).toFixed(4));
      if (step === current) return;
      current = step;
      el.dataset.step = String(step);
      for (const it of items()) {
        const i = Number(it.dataset.stepItem);
        it.dataset.state = i < step ? "before" : i === step ? "active" : "after";
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onClick = (e: MouseEvent) => {
      const go = (e.target as HTMLElement).closest<HTMLElement>("[data-step-go]");
      if (!go) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const travel = el.offsetHeight - window.innerHeight;
      window.scrollTo({ top: top + ((Number(go.dataset.stepGo) + 0.5) / count) * travel, behavior: "smooth" });
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    mq.addEventListener("change", schedule);
    el.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      mq.removeEventListener("change", schedule);
      el.removeEventListener("click", onClick);
    };
  }, [count]);
  return (
    <section ref={ref} className={className} {...props}>
      {children}
    </section>
  );
}

/**
 * Endless marquee that drifts on its own and speeds up (and turns around) with the reader's scrolling.
 * Children are rendered twice; the copy is hidden from assistive tech. `pauseOnHover` eases it to a stop
 * under the pointer. Static under reduced motion.
 */
export function VelocityMarquee({ children, speed = 50, reverse, pauseOnHover, className }: { children: React.ReactNode; speed?: number; reverse?: boolean; pauseOnHover?: boolean; className?: string }) {
  const track = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = track.current;
    if (!el || prefersReducedMotion()) return;
    let raf = 0;
    let x = 0;
    let boost = 0;
    let dir = reverse ? -1 : 1;
    let lastT = performance.now();
    let lastY = window.scrollY;
    let visible = true;
    let hovered = false;
    let ease = 1;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
    });
    io.observe(el);
    const enter = () => {
      hovered = pauseOnHover === true;
    };
    const leave = () => {
      hovered = false;
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      const dy = window.scrollY - lastY;
      lastY = window.scrollY;
      if (dy) dir = (dy > 0 ? 1 : -1) * (reverse ? -1 : 1);
      boost += (Math.min(60, Math.abs(dy)) - boost) * 0.08;
      ease += ((hovered ? 0 : 1) - ease) * 0.06;
      if (visible) {
        const w = el.scrollWidth / 2;
        x = (x - dir * (speed + boost * 22) * ease * dt) % w;
        if (x > 0) x -= w;
        el.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        el.style.setProperty("--skew", `${(-dir * Math.min(boost, 30) * 0.25).toFixed(2)}deg`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
    };
  }, [speed, reverse, pauseOnHover]);
  return (
    <div className={cn("overflow-hidden", className)}>
      <div ref={track} className="flex w-max will-change-transform">
        {[0, 1].map((copy) => (
          <div key={copy} aria-hidden={copy === 1 || undefined} className="tw-skew flex shrink-0 items-center">
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pulls its child gently towards the pointer while hovered (fine pointers only). */
export function Magnetic({ children, strength = 0.28, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.translate = `${((e.clientX - r.left - r.width / 2) * strength).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * strength).toFixed(1)}px`;
    };
    const leave = () => {
      el.style.translate = "";
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [strength]);
  return (
    <span ref={ref} className={cn("tw-magnetic inline-flex", className)}>
      {children}
    </span>
  );
}
