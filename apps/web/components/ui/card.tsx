import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, Inbox } from "lucide-react";
import { cn, titleCase } from "@/lib/utils";
import { CountUp, RevealWords } from "@/components/motion";
import { Photo, type MarketingImage } from "@/features/marketing/imagery";

type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

/** `interactive` cards lift and brighten their border on hover; the icon tile inside tilts with them. */
export function Card({ className, interactive, ...props }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cn("tw-surface rounded-xl border border-border text-card-foreground", interactive && "tw-lift group", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 border-b border-border px-6 py-5", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-[15px] font-semibold tracking-[-0.03em]", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-5", className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-border px-6 py-4", className)} {...props} />;
}

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground",
      primary: "bg-primary-soft text-primary",
      accent: "bg-accent-soft text-accent",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      danger: "bg-destructive-soft text-destructive",
      info: "bg-info-soft text-info",
      outline: "border border-border text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;
export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const STATUS_TONES: Record<string, BadgeTone> = {
  // generic
  active: "success", inactive: "neutral", draft: "neutral", suspended: "danger", closed: "neutral", pending: "warning",
  // trips
  new: "info", needs_clarification: "warning", planning: "primary", optimised: "accent", quoted: "primary", won: "success", lost: "danger", archived: "neutral",
  // quotes
  preparing: "info", ready_for_review: "warning", sent: "primary", viewed: "accent", accepted: "success", rejected: "danger", expired: "warning", cancelled: "neutral",
  // jobs
  queued: "neutral", running: "info", succeeded: "success", failed: "danger", infeasible: "warning",
  // offers
  company_managed: "primary", supplier_reported: "info", live_checked: "success", estimated: "warning", requires_confirmation: "warning", unavailable: "danger", booked: "success",
  confirmed: "success", unknown: "warning", on_request: "warning",
  // agreements/shares
  terminated: "danger", revoked: "danger", responded: "success", open: "info",
};
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label ?? titleCase(status)}
    </Badge>
  );
}

const alertVariants = cva("flex gap-3 rounded-xl border px-4 py-3 text-sm", {
  variants: {
    tone: {
      info: "border-info/30 bg-info-soft text-info",
      success: "border-success/30 bg-success-soft text-success",
      warning: "border-warning/30 bg-warning-soft text-warning",
      danger: "border-destructive/30 bg-destructive-soft text-destructive",
    },
  },
  defaultVariants: { tone: "info" },
});
const ALERT_ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertCircle } as const;
export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof ALERT_ICON; title?: string; children?: React.ReactNode; className?: string }) {
  const Icon = ALERT_ICON[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn(alertVariants({ tone }), className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-0.5 opacity-90" : "")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("tw-shimmer rounded-md", className)} />;
}
export function LoadingBlock({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn("h-10", i === 0 && "h-12 w-2/3")} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} aria-label="Loading" />;
}

/** Empty list or first-run prompt. Pass `image` for a faded photo backdrop, the same treatment as the dashboard hero. */
export function EmptyState({ icon: Icon = Inbox, title, description, action, image }: { icon?: IconType; title: string; description?: string; action?: React.ReactNode; image?: MarketingImage }) {
  return (
    <div className="tw-surface group relative isolate flex flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border border-dashed border-border px-6 py-16 text-center">
      {image ? (
        <>
          <div aria-hidden className="absolute inset-0 -z-20 overflow-hidden">
            <Photo image={image} decorative className="size-full opacity-35 transition-transform duration-[1800ms] ease-out group-hover:scale-105" />
          </div>
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-card/60 via-card/85 to-card" />
        </>
      ) : null}
      <div className="relative flex size-14 items-center justify-center rounded-2xl border border-border bg-primary-soft text-accent">
        <span aria-hidden className="absolute inset-0 rounded-2xl bg-accent/10 blur-xl" />
        <Icon className="relative size-6" />
      </div>
      <div className="max-w-md">
        <p className="font-display text-lg font-semibold tracking-[-0.04em]">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Something went wrong" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = error instanceof Error ? error.message : "Please try again.";
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-destructive/30 bg-destructive-soft px-5 py-4 text-sm text-destructive">
      <p className="font-semibold">{title}</p>
      <p>{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-1 rounded-full border border-destructive/40 bg-card px-3.5 py-1 text-xs font-semibold transition-colors hover:bg-destructive-soft">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-border", className)} />;
}

const TILE_TONES = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive-soft text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const;
export type TileTone = keyof typeof TILE_TONES;

/** Tinted rounded square holding an icon; tilts slightly when its `group` parent is hovered. */
export function IconTile({ icon: Icon, tone = "primary", size = "md", className }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; tone?: TileTone; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-xl transition-transform duration-500 ease-out group-hover:-rotate-6 group-hover:scale-105", size === "sm" ? "size-8" : size === "lg" ? "size-12 rounded-2xl" : "size-10", TILE_TONES[tone], className)}>
      <Icon className={size === "sm" ? "size-4" : size === "lg" ? "size-6" : "size-5"} strokeWidth={1.8} />
    </span>
  );
}

/** Key figure. Whole numbers count up on first view; `bare` drops the card chrome for use inside a StatGrid. */
export function Stat({ label, value, hint, tone, bare, className, icon, iconTone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "warning" | "success"; bare?: boolean; className?: string; icon?: IconType; iconTone?: TileTone }) {
  return (
    <div className={cn("group relative overflow-hidden px-5 py-5", bare ? "bg-card" : "tw-surface tw-lift rounded-xl border border-border", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {icon ? null : <span aria-hidden className={cn("size-1.5 rounded-full bg-foreground/30", tone === "success" && "bg-success", tone === "warning" && "bg-warning")} />}
          {label}
        </p>
        {icon ? <IconTile icon={icon} tone={iconTone} size="sm" /> : null}
      </div>
      <p className={cn("tw-num mt-3 font-display text-[32px] font-semibold leading-none tracking-[-0.06em]", tone === "warning" && "text-warning", tone === "success" && "text-success")}>
        {typeof value === "number" && Number.isInteger(value) ? <CountUp value={value} duration={1100} /> : value}
      </p>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-accent transition-transform duration-500 ease-out group-hover:scale-x-100" />
    </div>
  );
}

/** Hairline grid of bare Stats (one shared border, 1px dividers). */
export function StatGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid gap-px overflow-hidden rounded-xl border border-border bg-border", className)}>{children}</div>;
}

/**
 * Page title row. `icon` adds a tinted icon tile beside the title. `image` turns the header into a photo banner
 * (the dashboard's treatment): title, description and actions sit over the photo.
 */
export function PageHeader({ title, description, actions, eyebrow, icon, image }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode; icon?: IconType; image?: MarketingImage }) {
  const heading = (
    <div className="flex min-w-0 items-start gap-4">
      {icon ? <IconTile icon={icon} tone="accent" size="lg" className={cn("mt-1", image && "bg-card/80 backdrop-blur-md")} /> : null}
      <div className="min-w-0">
        {eyebrow ? <p className="tw-eyebrow tw-rise mb-4">{eyebrow}</p> : null}
        <RevealWords as="h1" text={title} className="font-display text-[34px] font-semibold leading-[1.02] tracking-[-0.055em] md:text-[46px]" />
        {description ? (
          <p className="tw-rise mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground" style={{ "--d": "120ms" } as React.CSSProperties}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
  const actionRow = actions ? (
    <div className="tw-rise flex flex-wrap items-center gap-2" style={{ "--d": "180ms" } as React.CSSProperties}>
      {actions}
    </div>
  ) : null;

  if (image) {
    return (
      <div className="group tw-surface relative isolate mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-5 overflow-hidden rounded-2xl border border-border p-6 md:p-8">
        <div aria-hidden className="absolute inset-0 -z-20 overflow-hidden">
          <Photo image={image} decorative priority sizes="(min-width: 1400px) 1400px, 100vw" className="size-full opacity-55 transition-transform duration-[1800ms] ease-out group-hover:scale-[1.04]" />
        </div>
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-card via-card/85 to-card/30" />
        {heading}
        {actionRow}
      </div>
    );
  }

  return (
    <div className="group mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-border pb-7">
      {heading}
      {actionRow}
    </div>
  );
}
