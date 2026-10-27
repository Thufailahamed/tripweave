"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, KeyRound, Palette, Plug, ScrollText, Scale, Users } from "lucide-react";
import type { Permission } from "@tripweave/shared";
import { useCan, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface Item {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: Permission;
  needsOrg: boolean;
}

const ITEMS: Item[] = [
  { href: "/settings", label: "Organisation", icon: Building2, needsOrg: true },
  { href: "/settings/team", label: "Team", icon: Users, perm: "team:manage", needsOrg: true },
  { href: "/settings/pricing", label: "Pricing & currency", icon: Scale, perm: "settings:pricing", needsOrg: true },
  { href: "/settings/branding", label: "Branding", icon: Palette, perm: "org:manage", needsOrg: true },
  { href: "/settings/integrations", label: "Integrations", icon: Plug, perm: "settings:integrations", needsOrg: true },
  { href: "/settings/audit", label: "Audit log", icon: ScrollText, perm: "audit:read", needsOrg: true },
  { href: "/settings/account", label: "Account", icon: KeyRound, needsOrg: false },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const can = useCan();
  const { data: session } = useSession();
  const hasOrg = !!session?.organization;
  const items = ITEMS.filter((i) => (!i.perm || can(i.perm)) && (hasOrg || !i.needsOrg));
  const active = (href: string) => (href === "/settings" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Settings" className="lg:sticky lg:top-20 lg:self-start">
        <ul className="flex gap-1 overflow-x-auto border-b border-border pb-2 lg:flex-col lg:overflow-visible lg:border-b-0 lg:pb-0">
          {items.map((i) => (
            <li key={i.href} className="shrink-0">
              <Link
                href={i.href}
                aria-current={active(i.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active(i.href) && "bg-primary-soft text-accent hover:text-accent",
                )}
              >
                <i.icon className="size-4 shrink-0" aria-hidden />
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
