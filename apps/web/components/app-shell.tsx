"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Bell, Building2, Moon, Sun, Briefcase, Check, ChevronDown, ChevronRight, FileText, Handshake, Hotel, LayoutDashboard, LogOut, Map, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, ShieldCheck, Users, X, Inbox, KeyRound,
} from "lucide-react";
import type { Permission } from "@tripweave/shared";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import { useCan, useSession, type SessionData } from "@/lib/session";
import { cn, relativeTime, titleCase } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand";
import { PlatformBanner } from "@/components/platform-banner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlay";
import { toast } from "sonner";
import { VerifyEmailBanner } from "@/features/settings/verify-email-banner";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: Permission;
  types?: ("tour_operator" | "hotel_management")[];
  platformAdmin?: boolean;
  group: string;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Work" },
  { href: "/trips", label: "Trip requests", icon: Map, perm: "trips:read", group: "Work" },
  { href: "/quotes", label: "Quotations", icon: FileText, perm: "quotes:read", group: "Work" },
  { href: "/customers", label: "Customers", icon: Users, perm: "customers:read", group: "Work" },
  { href: "/hotels", label: "Hotel catalogue", icon: Hotel, perm: "hotels:read", group: "Inventory" },
  { href: "/hotels/rates", label: "Rates & imports", icon: Briefcase, perm: "rates:read", group: "Inventory" },
  { href: "/hotels/agreements", label: "Suppliers & contracts", icon: Handshake, perm: "agreements:manage", group: "Inventory" },
  { href: "/hotel-workspace", label: "Hotel portfolio", icon: Building2, perm: "hotels:read", types: ["hotel_management"], group: "Hotel management" },
  { href: "/hotel-workspace/partners", label: "Partner sharing", icon: Handshake, perm: "partners:manage", group: "Hotel management" },
  { href: "/hotel-workspace/enquiries", label: "Enquiries", icon: Inbox, perm: "trips:read", group: "Hotel management" },
  { href: "/reports", label: "Reports", icon: BarChart3, perm: "reports:read", group: "Insight" },
  { href: "/settings", label: "Settings", icon: Settings, group: "Organisation" },
  { href: "/admin", label: "Platform admin", icon: ShieldCheck, platformAdmin: true, group: "Platform" },
];

const CRUMBS: Record<string, string> = {
  dashboard: "Dashboard", trips: "Trip requests", quotes: "Quotations", customers: "Customers", hotels: "Hotel catalogue", rates: "Rates & imports", agreements: "Suppliers & contracts",
  "hotel-workspace": "Hotel portfolio", partners: "Partner sharing", enquiries: "Enquiries", reports: "Reports", settings: "Settings", admin: "Platform admin", new: "New", itinerary: "Itinerary",
  optimise: "Optimisation", packages: "Package comparison", team: "Team", pricing: "Pricing & currency", branding: "Branding", integrations: "Integrations", audit: "Audit log", account: "Account",
  organizations: "Organisations", users: "Users", jobs: "Optimisation jobs", communications: "Communications", providers: "Providers & usage", support: "Support access",
};

function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground", className)}>
      {parts.map((p, i) => {
        const href = `/${parts.slice(0, i + 1).join("/")}`;
        const label = CRUMBS[p] ?? (p.length > 12 ? "Details" : titleCase(p));
        const last = i === parts.length - 1;
        return (
          <React.Fragment key={href}>
            {i > 0 ? <ChevronRight className="size-3 text-foreground/25" aria-hidden /> : null}
            {last ? (
              <span aria-current="page" className="truncate font-medium text-foreground">
                {label}
              </span>
            ) : (
              <Link href={href} className="transition-colors hover:text-foreground">
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function NotificationsMenu() {
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => apiGet<{ items: { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }[]; unread: number }>("/notifications"), refetchInterval: 60_000 });
  const read = useMutation({ mutationFn: () => apiPost("/notifications/read"), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  const unread = q.data?.unread ?? 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell />
          {unread > 0 ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent" /> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">Notifications</span>
          {unread > 0 ? (
            <button className="text-xs font-semibold text-accent hover:underline" onClick={() => read.mutate()}>
              Mark all read
            </button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {q.data?.items.length ? (
          q.data.items.slice(0, 8).map((n) => (
            <DropdownMenuItem key={n.id} onSelect={() => n.link && router.push(n.link)} className="flex-col items-start gap-0.5">
              <span className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
              {n.body ? <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span> : null}
              <span className="text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrgSwitcher({ session }: { session: SessionData }) {
  const qc = useQueryClient();
  const router = useRouter();
  const switchOrg = useMutation({
    mutationFn: (organizationId: string) => apiPost("/auth/switch-organization", { organizationId }),
    onSuccess: () => {
      qc.clear();
      router.push("/dashboard");
      router.refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const org = session.organization;
  const multi = session.memberships.length > 1;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-56 justify-between" aria-label="Switch organisation">
          <span className="truncate">{org?.name ?? "No organisation"}</span>
          {multi ? <ChevronDown /> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>Organisations</DropdownMenuLabel>
        {session.memberships.map((m) => (
          <DropdownMenuItem key={m.organizationId} onSelect={() => m.organizationId !== org?.id && switchOrg.mutate(m.organizationId)}>
            <span className="flex-1 truncate">{m.name}</span>
            <span className="text-xs text-muted-foreground">{titleCase(m.role)}</span>
            {m.organizationId === org?.id ? <Check className="text-success" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Topbar search. Press "/" or Ctrl/⌘ K anywhere (outside a text field) to focus it. */
function SearchBox() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const can = useCan();
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className="group relative hidden md:block"
      onSubmit={(e) => {
        e.preventDefault();
        if (!q.trim()) return;
        router.push(`${can("trips:read") ? "/trips" : "/hotels"}?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-accent" aria-hidden />
      <input
        ref={input}
        aria-label="Search trip requests"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search trips, customers…"
        className="h-10 w-64 rounded-full border border-border bg-card pl-10 pr-12 text-sm transition-[width,border-color,box-shadow] duration-300 placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:w-80 focus-visible:border-accent/60 focus-visible:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_12%,transparent)] focus-visible:outline-none xl:w-72"
      />
      <kbd className="tw-kbd pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
        /
      </kbd>
    </form>
  );
}

const ORG_TYPE_LABEL: Record<string, string> = { tour_operator: "Tour operator", hotel_management: "Hotel management" };

type Theme = "light" | "dark";
/** App colour theme on <html> (so portalled dialogs/menus follow it). Light by default; removed when leaving the app. */
function useAppTheme(): [Theme, () => void] {
  const [theme, setTheme] = React.useState<Theme>(() => {
    try {
      return localStorage.getItem("tw.theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  React.useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    return () => {
      delete el.dataset.theme;
    };
  }, [theme]);
  const toggle = () =>
    setTheme((t) => {
      const next = t === "light" ? "dark" : "light";
      try {
        localStorage.setItem("tw.theme", next);
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  return [theme, toggle];
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const dark = theme === "dark";
  return (
    <Button variant="ghost" size="icon" onClick={onToggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} aria-pressed={dark} className="relative overflow-hidden">
      <Sun className={cn("absolute transition-all duration-500", dark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
      <Moon className={cn("absolute transition-all duration-500", dark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0")} />
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const can = useCan();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [theme, toggleTheme] = useAppTheme();

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("tw.sidebar") === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  React.useEffect(() => setMobileOpen(false), [pathname]);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("tw.sidebar", c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });

  const logout = useMutation({
    mutationFn: () => apiPost("/auth/logout"),
    onSettled: () => {
      qc.clear();
      router.push("/login");
    },
  });
  if (!session) return null;
  const org = session.organization;
  const role = session.memberships.find((m) => m.organizationId === org?.id)?.role;
  const initial = session.user.displayName.slice(0, 1).toUpperCase();
  const items = NAV.filter((n) => (!n.perm || can(n.perm)) && (!n.types || (org && n.types.includes(org.type))) && (!n.platformAdmin || session.user.platformAdmin) && (org || n.platformAdmin || n.href === "/settings"));
  const groups = [...new Set(items.map((i) => i.group))];
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname === href || (pathname.startsWith(`${href}/`) && !items.some((o) => o.href !== href && o.href.startsWith(`${href}/`) && pathname.startsWith(o.href))));

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-foreground/10 px-5", collapsed && "justify-center px-2")}>
        <LogoMark className="text-accent" />
        {!collapsed ? <span className="truncate text-xl font-semibold tracking-[-0.07em] text-sidebar-foreground">TripWeave</span> : null}
      </div>
      {org && !collapsed ? (
        <div className="mx-3 mt-4 flex items-center gap-3 rounded-xl border border-sidebar-foreground/10 bg-sidebar-foreground/[0.03] p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-sm font-semibold text-accent">{(org.branding.productName || org.name).slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-[-0.02em] text-sidebar-foreground">{org.branding.productName || org.name}</span>
            <span className="block truncate text-[11px] text-sidebar-foreground/45">{ORG_TYPE_LABEL[org.type] ?? titleCase(org.type)}</span>
          </span>
        </div>
      ) : null}
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((g) => (
          <div key={g} className="mb-5">
            {!collapsed ? (
              <p className="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-medium text-sidebar-foreground/35">
                <span aria-hidden className="size-1.5 border border-sidebar-foreground/30 bg-sidebar-foreground/10" />
                {g}
              </p>
            ) : (
              <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-sidebar-foreground/10" />
            )}
            <ul className="flex flex-col gap-0.5">
              {items
                .filter((i) => i.group === g)
                .map((i) => {
                  const active = isActive(i.href);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        title={collapsed ? i.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] font-medium tracking-[-0.015em] text-sidebar-foreground/60 transition-colors duration-200 hover:bg-sidebar-foreground/[0.05] hover:text-sidebar-foreground",
                          active && "bg-sidebar-foreground/[0.07] text-sidebar-foreground",
                          collapsed && "justify-center px-2",
                        )}
                      >
                        <span aria-hidden className={cn("absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-all duration-300", active ? "opacity-100" : "scale-y-0 opacity-0")} />
                        <i.icon className={cn("size-4 shrink-0 transition-colors", active ? "text-accent" : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/80")} />
                        {!collapsed ? <span className="truncate">{i.label}</span> : <span className="sr-only">{i.label}</span>}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-sidebar-foreground/10 p-3">
        <div className={cn("flex items-center gap-3", collapsed && "flex-col")}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{initial}</span>
          {!collapsed ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-sidebar-foreground">{session.user.displayName}</span>
              <span className="block truncate text-[11px] text-sidebar-foreground/45">{role ? titleCase(role) : session.user.email}</span>
            </span>
          ) : null}
          <button onClick={toggle} className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/50 transition-colors hover:bg-sidebar-foreground/[0.06] hover:text-sidebar-foreground lg:flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className={cn("no-print fixed inset-y-0 left-0 z-30 hidden border-r border-sidebar-foreground/10 transition-[width] duration-300 lg:block", collapsed ? "w-[72px]" : "w-64")}>{sidebar}</aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="tw-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" data-state="open" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="tw-rise absolute inset-y-0 left-0 w-72 border-r border-sidebar-foreground/10">{sidebar}</aside>
        </div>
      ) : null}
      <div className={cn("flex min-w-0 flex-1 flex-col transition-[padding] duration-300", collapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/75 px-4 backdrop-blur-xl md:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label="Toggle navigation">
            {mobileOpen ? <X /> : <Menu />}
          </Button>
          <Breadcrumbs className="hidden md:flex" />
          <div className="ml-auto flex items-center gap-2">
            <SearchBox />
            <OrgSwitcher session={session} />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            {org ? <NotificationsMenu /> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account menu">
                  <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground ring-2 ring-background transition-shadow hover:ring-accent/30">{initial}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60">
                <div className="flex items-center gap-3 px-2.5 py-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{initial}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{session.user.displayName}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{session.user.email}</span>
                  </span>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push("/settings/account")}>
                  <KeyRound /> Account & password
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/settings")}>
                  <Settings /> Organisation settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => logout.mutate()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 md:px-10 md:py-10">
          <PlatformBanner />
          <VerifyEmailBanner />
          {/* Keyed by route so each page eases in on navigation. */}
          <div key={pathname} className="tw-page-in">
            <Breadcrumbs className="mb-4 md:hidden" />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
