import { Logo } from "@/components/brand";
import { IMAGES, Photo } from "@/features/marketing/imagery";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative isolate hidden overflow-hidden border-r border-border p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 -z-20 overflow-hidden">
          <Photo image={IMAGES.auth} priority sizes="55vw" className="tw-kenburns size-full" />
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-background/60 via-background/20 to-background/90" />
        <Logo />
        <div className="tw-rise max-w-lg" style={{ "--d": "150ms" } as React.CSSProperties}>
          <p className="text-5xl font-semibold leading-[1] tracking-[-0.06em]">One enquiry in. Several costed, client-ready itineraries out.</p>
          <p className="mt-5 max-w-md text-base leading-snug text-white/70">Route-aware hotel combinations, deterministic costing and branded quotations — built for tour operators and hotel companies.</p>
        </div>
        <p className="text-xs text-white/50">Development and illustrative data is always labelled. Live supplier rates are never invented.</p>
      </aside>
      <main className="flex flex-col px-6 py-8">
        <Logo className="mb-10 lg:hidden" />
        <div className="flex flex-1 items-center justify-center">
          <div className="tw-rise w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
