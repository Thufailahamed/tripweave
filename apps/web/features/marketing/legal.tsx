import * as React from "react";
import { TriangleAlert } from "lucide-react";

export interface LegalSection {
  title: string;
  body: React.ReactNode[];
}

export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-32 md:px-8 md:pt-40">
      <p className="tw-eyebrow tw-rise">Legal</p>
      <h1 className="tw-rise mt-5 text-5xl font-semibold leading-[1] tracking-[-0.06em] md:text-6xl" style={{ "--d": "80ms" } as React.CSSProperties}>
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Template last updated {updated}</p>

      <div role="note" className="mt-6 flex gap-3 rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <strong>Template text, not legal advice.</strong> This document is a starting point written for illustration. It must be reviewed and adapted by qualified legal counsel in your jurisdiction before it is relied upon or the service is used in production. Bracketed items such as [Company name] must be completed.
        </p>
      </div>

      <p className="mt-8 text-base leading-relaxed text-foreground/85">{intro}</p>

      <nav aria-label="Contents" className="mt-8 border-y border-border py-5">
        <p className="text-xs font-medium text-muted-foreground">Contents</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          {sections.map((s, i) => (
            <li key={s.title}>
              <a href={`#s${i + 1}`} className="text-foreground/85 underline-offset-4 hover:text-accent hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 flex flex-col gap-8">
        {sections.map((s, i) => (
          <section key={s.title} id={`s${i + 1}`} aria-labelledby={`s${i + 1}-h`} className="scroll-mt-24">
            <h2 id={`s${i + 1}-h`} className="text-2xl font-semibold tracking-[-0.05em]">
              {i + 1}. {s.title}
            </h2>
            <div className="mt-2 flex flex-col gap-3 text-sm leading-relaxed text-foreground/85">
              {s.body.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
