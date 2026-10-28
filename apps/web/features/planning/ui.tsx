"use client";
import * as React from "react";
import { AlertTriangle, CircleHelp, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PlanningSnapshot } from "@tripweave/planning-contract";

/** Planner-scoped section frame used by the small number of blocks that are not fully bespoke. */
export function PlanningSection({ title, description, icon: Icon = Sparkles, children, className, id }: { title: string; description?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string; id?: string }) {
  const generatedId = React.useId();
  const headingId = id ?? generatedId;
  return (
    <section className={cn("pl-card overflow-hidden", className)} aria-labelledby={headingId}>
      <div className="flex items-start gap-3 p-5">
        <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--pl-surface-2)] text-[var(--pl-accent)]">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 id={headingId} className="pl-display text-[1.5rem] leading-none">
            {title}
          </h3>
          {description ? <div className="mt-1 text-[11px] text-[var(--pl-muted)]">{description}</div> : null}
        </div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

export function MissingEntity({ what }: { what: string }) {
  return (
    <section className="pl-card p-5">
      <p className="pl-eyebrow">
        <AlertTriangle className="size-3" aria-hidden /> Not available
      </p>
      <p role="status" className="mt-1.5 text-sm text-[var(--pl-muted)]">
        This {what} is no longer available from the server. Refresh the planning tab to load the latest data.
      </p>
    </section>
  );
}

export function EmptyBlock({ children }: { children: React.ReactNode }) {
  return (
    <section className="pl-card p-5">
      <p className="pl-eyebrow">
        <CircleHelp className="size-3" aria-hidden /> Nothing to show yet
      </p>
      <p role="status" className="mt-1.5 text-sm text-[var(--pl-muted)]">
        {children}
      </p>
    </section>
  );
}

export function SourceBadge({ snapshot, compact = false }: { snapshot: PlanningSnapshot; compact?: boolean }) {
  const engine = snapshot.sources.engine;
  if (engine === "none") return <Badge tone="neutral">Server data</Badge>;
  const label = engine === "rules" ? "Rules-assisted" : "AI-assisted";
  return (
    <Badge tone={engine === "rules" ? "neutral" : "accent"} title={snapshot.sources.model ?? undefined}>
      {compact ? label : `${label}${snapshot.sources.model ? ` · ${snapshot.sources.model}` : ""}`}
    </Badge>
  );
}

export function VerificationBadge({ pkg }: { pkg: { verification: Record<string, unknown>; package: { selections: { offer: { isMock: boolean } }[] } } }) {
  const verification = pkg.verification as { status?: string; allVerified?: boolean; validUntil?: string | null };
  if (pkg.package.selections.some((selection) => selection.offer.isMock)) return <Badge tone="danger">Illustrative data</Badge>;
  if (verification.allVerified) return <Badge tone="success">Live checked</Badge>;
  if (verification.status === "failed") return <Badge tone="warning">Live check failed</Badge>;
  return <Badge tone="neutral">Indicative</Badge>;
}

export type PlanningTone = "accent" | "sage" | "ink";

const TONE_CLASS: Record<PlanningTone, string> = {
  accent: "bg-[var(--pl-accent-soft)] text-[var(--pl-accent)]",
  sage: "bg-[var(--pl-sage-soft)] text-[var(--pl-sage)]",
  ink: "bg-[var(--pl-surface-2)] text-[var(--pl-ink)]",
};

/** Rounded icon tile used by every generated block, so icons share one size, tint and shape. */
export function IconBadge({ icon: Icon, tone = "accent", size = "md", className }: { icon: React.ComponentType<{ className?: string }>; tone?: PlanningTone; size?: "sm" | "md"; className?: string }) {
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center", size === "sm" ? "size-7 rounded-lg" : "size-9 rounded-xl", TONE_CLASS[tone], className)}>
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
    </span>
  );
}

/** Heading row shared by the generated blocks: icon, eyebrow, serif title on the left; chips or actions on the right. */
export function SectionHeader({
  eyebrow,
  title,
  icon,
  tone = "accent",
  meta,
  className,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: PlanningTone;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <IconBadge icon={icon} tone={tone} /> : null}
        <div className="min-w-0">
          <p className="pl-eyebrow">{eyebrow}</p>
          <h3 className="pl-display mt-1 text-[1.75rem] leading-none sm:text-[1.9rem]">{title}</h3>
        </div>
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-1.5">{meta}</div> : null}
    </div>
  );
}

/** Labelled fact with an icon badge. Used in definition lists, so the root is a div around a dt and dd. */
export function StatTile({ icon, label, children, tone = "accent" }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode; tone?: PlanningTone }) {
  return (
    <div className="flex h-full items-start gap-3 rounded-2xl border border-[var(--pl-line)] bg-[var(--pl-surface)] p-3.5">
      <IconBadge icon={icon} tone={tone} size="sm" />
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pl-muted)]">{label}</dt>
        <dd className="mt-1 text-[13px] leading-snug">{children}</dd>
      </div>
    </div>
  );
}
