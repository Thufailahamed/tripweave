"use client";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleSlash, Plug } from "lucide-react";
import { toast } from "sonner";
import { Alert, Badge, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select, Switch } from "@/components/ui/form";
import { apiGet, apiPut, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { cn } from "@/lib/utils";
import { NoAccess } from "@/features/settings/shared";
import { ProviderHealthTable, type ProviderHealth } from "@/features/settings/provider-health";

interface IntegrationSettings {
  externalProviders: { hotelbeds: boolean; amadeus?: boolean; google_hotels?: boolean; openstreetmap?: boolean };
  googleHotelsDirect?: boolean;
  mockProvider: boolean;
  aiEngine: "auto" | "rules";
}
interface PlatformStatus {
  hotelbedsConfigured: boolean;
  amadeusConfigured: boolean;
  googleHotelsConfigured: boolean;
  openStreetMapAvailable: boolean;
  routingProvider: string;
  routingConfigured: boolean;
  workersAiAvailable: boolean;
  externalLlmConfigured: boolean;
  emailDelivery: "resend" | "outbox_only";
  mockProviderAllowed: boolean;
}
interface IntegrationsResponse {
  settings: IntegrationSettings;
  platform: PlatformStatus;
  health: ProviderHealth[];
}
const KEY = ["org-integrations"] as const;

function Status({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
      <CheckCircle2 className="size-4" aria-hidden /> {yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
      <CircleSlash className="size-4" aria-hidden /> {no}
    </span>
  );
}

function Settings({ data }: { data: IntegrationsResponse }) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState<IntegrationSettings>(data.settings);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => setDraft(data.settings), [data.settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);
  const p = data.platform;

  const save = useMutation({
    mutationFn: () => apiPut<IntegrationSettings>("/organization/integrations", draft),
    onSuccess: (saved) => {
      toast.success("Integration settings saved");
      qc.setQueryData<IntegrationsResponse>(KEY, (old) => (old ? { ...old, settings: saved } : old));
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your organisation's settings</CardTitle>
        <CardDescription>Switch integrations on or off for your organisation. A switch only takes effect when the platform has the capability available.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex flex-col gap-1">
          <Switch id="int-hotelbeds" checked={draft.externalProviders.hotelbeds} disabled={!p.hotelbedsConfigured && !draft.externalProviders.hotelbeds} onCheckedChange={(v) => setDraft((d) => ({ ...d, externalProviders: { ...d.externalProviders, hotelbeds: v } }))} label="Use Hotelbeds live supplier search" />
          <p className="ml-11 text-xs text-muted-foreground">
            {p.hotelbedsConfigured ? "Live supplier rates are fetched on request and labelled by their source." : "Not available: the platform operator has not configured Hotelbeds credentials."}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Switch id="int-amadeus" checked={draft.externalProviders.amadeus ?? false} disabled={!p.amadeusConfigured && !draft.externalProviders.amadeus} onCheckedChange={(v) => setDraft((d) => ({ ...d, externalProviders: { ...d.externalProviders, amadeus: v } }))} label="Use Amadeus live hotel search" />
          <p className="ml-11 text-xs text-muted-foreground">
            {p.amadeusConfigured ? "Live Amadeus rates are fetched on request and labelled by their source. Amadeus test keys only cover a subset of hotels." : "Not available: the platform operator has not configured Amadeus credentials."}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Switch id="int-google-hotels" checked={draft.externalProviders.google_hotels ?? false} disabled={!p.googleHotelsConfigured && !draft.externalProviders.google_hotels} onCheckedChange={(v) => setDraft((d) => ({ ...d, externalProviders: { ...d.externalProviders, google_hotels: v } }))} label="Search Booking.com and other booking sites" />
          <p className="ml-11 text-xs text-muted-foreground">
            {p.googleHotelsConfigured
              ? "Live cross-OTA prices from Booking.com, Expedia, Agoda, Hotels.com and others via Google Hotels. Each package records which site the price came from."
              : "Not available: the platform operator has not configured the Google Hotels (SerpApi) key."}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Switch id="int-google-hotels-direct" checked={draft.googleHotelsDirect ?? false} disabled={!p.googleHotelsConfigured && !draft.googleHotelsDirect} onCheckedChange={(v) => setDraft((d) => ({ ...d, googleHotelsDirect: v }))} label="Verify room and breakfast details on hotel pages (pilot)" />
          <p className="ml-11 text-xs text-muted-foreground">
            {draft.externalProviders.google_hotels
              ? "Checks the cheapest cross-OTA results against each hotel's Google Hotels page to confirm room type, occupancy, cancellation and whether breakfast is included in the rate. Prices still come from the main Google Hotels search. Slower, and some hotels publish no room detail, so unconfirmed offers stay flagged."
              : "Only takes effect while cross-OTA search is switched on. Prices still come from the main Google Hotels search; this adds rate-level room and breakfast evidence."}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Switch id="int-osm" checked={draft.externalProviders.openstreetmap ?? true} disabled={!p.openStreetMapAvailable && !draft.externalProviders.openstreetmap} onCheckedChange={(v) => setDraft((d) => ({ ...d, externalProviders: { ...d.externalProviders, openstreetmap: v } }))} label="Discover additional hotels on OpenStreetMap" />
          <p className="ml-11 text-xs text-muted-foreground">
            {p.openStreetMapAvailable
              ? "Finds real properties near each stop. Prices are estimates benchmarked against your catalogue and availability is always unconfirmed, so they are labelled as estimates."
              : "Not available: hotel discovery is disabled in this environment."}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Switch id="int-mock" checked={draft.mockProvider} disabled={!p.mockProviderAllowed && !draft.mockProvider} onCheckedChange={(v) => setDraft((d) => ({ ...d, mockProvider: v }))} label="Allow the mock (illustrative) provider" />
          <p className="ml-11 text-xs text-muted-foreground">{p.mockProviderAllowed ? "For demos and testing only." : "Not available: the mock provider is disabled in this environment."}</p>
          {draft.mockProvider ? (
            <div className="ml-11 mt-1">
              <Alert tone="warning" title="Illustrative data cannot be quoted">
                Offers from the mock provider are made-up examples, always labelled as such. They can be explored in optimisation runs but must never be sent to a client as a quotation.
              </Alert>
            </div>
          ) : null}
        </div>
        <Field label="AI engine" htmlFor="int-ai" hint={draft.aiEngine === "auto" ? "Uses the platform's AI model (when available) to read free-text enquiries and write itinerary text. Prices and availability are never produced by AI." : "Deterministic rules only. No text is sent to any AI model."}>
          <Select id="int-ai" value={draft.aiEngine} onChange={(e) => setDraft((d) => ({ ...d, aiEngine: e.target.value as IntegrationSettings["aiEngine"] }))}>
            <option value="auto">Automatic (AI when available, otherwise rules)</option>
            <option value="rules">Rules only (no AI)</option>
          </Select>
        </Field>
      </CardContent>
      <CardFooter>
        <Button variant="outline" disabled={!dirty} onClick={() => setDraft(data.settings)}>
          Reset
        </Button>
        <Button loading={save.isPending} disabled={!dirty} onClick={() => (setError(null), save.mutate())}>
          Save integrations
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function IntegrationsPage() {
  const can = useCan();
  const allowed = can("settings:integrations");
  const q = useQuery({ queryKey: KEY, queryFn: () => apiGet<IntegrationsResponse>("/organization/integrations"), enabled: allowed });
  if (!allowed) {
    return (
      <>
        <PageHeader title="Integrations" eyebrow="Settings" />
        <NoAccess what="Integration settings" permission="settings:integrations" />
      </>
    );
  }
  const p = q.data?.platform;
  return (
    <>
      <PageHeader title="Integrations" eyebrow="Settings" icon={Plug} description="External suppliers, routing and AI available to your organisation, and how they have been performing." />
      {q.isLoading ? (
        <LoadingBlock label="Loading integrations" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data && p ? (
        <div className="flex flex-col gap-6">
          <Alert tone="info" title="Credentials are managed by the platform operator">
            API keys and secrets for suppliers, routing, email and AI are stored as Cloudflare secrets and are never shown or collected here. Only whether each capability is configured is displayed.
          </Alert>
          <Card>
            <CardHeader>
              <CardTitle>Platform status</CardTitle>
              <CardDescription>What the platform currently makes available. Read-only.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { k: "Hotelbeds", v: <Status ok={p.hotelbedsConfigured} yes="Configured" no="Not configured" /> },
                  { k: "Amadeus", v: <Status ok={p.amadeusConfigured} yes="Configured" no="Not configured" /> },
                  { k: "Booking.com + other OTAs", v: <Status ok={p.googleHotelsConfigured} yes="Configured via Google Hotels" no="Not configured" /> },
                  { k: "OpenStreetMap discovery", v: <Status ok={p.openStreetMapAvailable} yes="Enabled" no="Disabled" /> },
                  { k: "Routing provider", v: <span className="text-sm font-semibold">{p.routingProvider}{!p.routingConfigured ? <Badge tone="warning" className="ml-2">Missing key</Badge> : null}</span> },
                  { k: "Workers AI", v: <Status ok={p.workersAiAvailable} yes="Available" no="Unavailable" /> },
                  { k: "External LLM", v: <Status ok={p.externalLlmConfigured} yes="Configured" no="Not configured" /> },
                  { k: "Email delivery", v: <span className={cn("text-sm font-semibold", p.emailDelivery === "resend" ? "text-success" : "text-warning")}>{p.emailDelivery === "resend" ? "Sent via email provider" : "Outbox only (not delivered)"}</span> },
                  { k: "Mock provider", v: <Status ok={p.mockProviderAllowed} yes="Allowed" no="Disabled" /> },
                ].map((r) => (
                  <div key={r.k}>
                    <dt className="text-xs font-medium text-muted-foreground">{r.k}</dt>
                    <dd className="mt-0.5">{r.v}</dd>
                  </div>
                ))}
              </dl>
              {p.emailDelivery === "outbox_only" ? <p className="mt-4 text-xs text-muted-foreground">With outbox-only delivery, emails (such as quotation links) are recorded but not sent; share links manually.</p> : null}
            </CardContent>
          </Card>
          <Settings data={q.data} />
          <section aria-labelledby="health-h">
            <h2 id="health-h" className="mb-1 font-display text-lg font-semibold">
              Provider health, last 7 days
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">A provider is flagged unhealthy when 30% or more of its calls failed.</p>
            <ProviderHealthTable rows={q.data.health} />
          </section>
        </div>
      ) : null}
    </>
  );
}
