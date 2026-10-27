"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
  LayoutDashboard,
  Megaphone,
  Plug,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { AdminGuard } from "@/features/admin/admin-guard";

const SECTIONS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/organizations", label: "Organisations", icon: Building2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/jobs", label: "Optimisation", icon: Activity },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/communications", label: "Communications", icon: Megaphone },
  { href: "/admin/providers", label: "Providers & usage", icon: Plug },
  { href: "/admin/support", label: "Support access", icon: ShieldAlert },
  { href: "/admin/settings", label: "Platform settings", icon: Settings },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  return (
    <AdminGuard>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <ShieldCheck className="size-4 text-accent" aria-hidden />
          Platform administration
        </div>
        {session?.organization ? (
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to {session.organization.name}
          </Link>
        ) : null}
      </div>
      <div className="no-print sticky top-16 z-10 -mx-4 mb-8 border-y border-border bg-background/85 px-4 py-2 backdrop-blur-xl md:-mx-10 md:px-10">
        <nav aria-label="Platform administration" className="flex gap-1 overflow-x-auto">
          {SECTIONS.map((s) => {
            const active = "exact" in s && s.exact ? pathname === s.href : pathname === s.href || pathname.startsWith(`${s.href}/`);
            return (
              <Link
                key={s.href}
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-foreground text-background hover:bg-foreground hover:text-background",
                )}
              >
                <s.icon className="size-4" aria-hidden />
                {s.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </AdminGuard>
  );
}
