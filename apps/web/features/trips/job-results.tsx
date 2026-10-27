import { Alert, Badge } from "@/components/ui/card";
import { money, titleCase } from "@/lib/utils";
import { REJECTION_LABELS, type InfeasibilityReport, type ProviderOutcomeRow, type StopFunnel } from "./types";

const PROVIDER_LABEL: Record<string, string> = {
  internal: "Your hotel catalogue",
  hotelbeds: "Hotelbeds",
  amadeus: "Amadeus",
  google_hotels: "Google Hotels (Booking.com, Expedia…)",
  osm_discovery: "OpenStreetMap discovery (estimates)",
  mock: "Mock supplier",
};

/** Per-stop funnel: how many hotel offers were considered and why the rest were rejected. */
export function FunnelTable({ funnel }: { funnel: StopFunnel[] }) {
  if (funnel.length === 0) return null;
  return (
    <div className="relative overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <caption className="sr-only">Hotel offers considered and rejected per stop</caption>
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2">Stop</th>
            <th scope="col" className="px-3 py-2 text-right">Offers found</th>
            <th scope="col" className="px-3 py-2 text-right">Usable</th>
            <th scope="col" className="px-3 py-2">Why the rest were rejected</th>
          </tr>
        </thead>
        <tbody>
          {funnel.map((f) => {
            const rej = Object.entries(f.rejections ?? {}).filter(([, n]) => n > 0);
            return (
              <tr key={f.stopId} className="border-t border-border align-top">
                <th scope="row" className="px-3 py-2 text-left font-semibold">{f.destination}</th>
                <td className="tw-num px-3 py-2 text-right">{f.total}</td>
                <td className={`tw-num px-3 py-2 text-right font-semibold ${f.accepted === 0 ? "text-destructive" : ""}`}>{f.accepted}</td>
                <td className="px-3 py-2">
                  {rej.length === 0 ? (
                    <span className="text-muted-foreground">{f.total === 0 ? "No hotels were returned for this stop" : "None rejected"}</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {rej.map(([code, n]) => (
                        <li key={code} className="text-xs">
                          <span className="tw-num font-semibold">{n}</span> {REJECTION_LABELS[code] ?? titleCase(code)}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function InfeasibilityPanel({ infeasible, funnel, currency }: { infeasible: InfeasibilityReport | null | undefined; funnel: StopFunnel[] | undefined; currency: string }) {
  return (
    <div className="flex flex-col gap-4">
      {infeasible?.reasons.length ? (
        <section aria-label="Reasons">
          <h4 className="mb-1 text-sm font-semibold">Why nothing qualified</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {infeasible.reasons.map((r, i) => (
              <li key={i}>{r.message}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">The optimiser did not report a specific reason.</p>
      )}
      {infeasible?.minimumBudgetMinor ? (
        <Alert tone="info" title="Minimum budget needed">
          The cheapest combination that meets every mandatory requirement costs about <span className="tw-num font-semibold">{money(infeasible.minimumBudgetMinor, currency)}</span> at selling price.
        </Alert>
      ) : null}
      {infeasible?.suggestions.length ? (
        <section aria-label="Suggestions">
          <h4 className="mb-1 text-sm font-semibold">What you could change</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {infeasible.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {funnel && funnel.length > 0 ? (
        <section aria-label="Funnel">
          <h4 className="mb-1 text-sm font-semibold">Hotel funnel by stop</h4>
          <FunnelTable funnel={funnel} />
        </section>
      ) : null}
    </div>
  );
}

/** Supplier outcomes (ok / error / timeout) so failures are never hidden. */
export function ProviderOutcomes({ providers, stopName }: { providers: ProviderOutcomeRow[]; stopName?: (stopId: string) => string | undefined }) {
  const label = (key: string) => PROVIDER_LABEL[key] ?? key;
  if (providers.length === 0) return <p className="text-sm text-muted-foreground">No supplier calls were recorded.</p>;
  const failed = providers.filter((p) => p.status === "error" || p.status === "timeout");
  return (
    <div className="flex flex-col gap-3">
      {failed.length > 0 ? (
        <Alert tone="warning" title={`${failed.length} supplier call${failed.length === 1 ? "" : "s"} failed`}>
          Results may be missing hotels from these suppliers. Run again later or use the remaining suppliers' results with care.
        </Alert>
      ) : null}
      <div className="relative overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <caption className="sr-only">Supplier call outcomes</caption>
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2">Supplier</th>
              {stopName ? <th scope="col" className="px-3 py-2">Stop</th> : null}
              <th scope="col" className="px-3 py-2">Outcome</th>
              <th scope="col" className="px-3 py-2 text-right">Offers</th>
              <th scope="col" className="px-3 py-2 text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p, i) => (
              <tr key={i} className="border-t border-border align-top">
                <th scope="row" className="px-3 py-2 text-left font-semibold">
                  {label(p.providerKey)} {p.isMock ? <Badge tone="danger" className="ml-1">Illustrative</Badge> : null}
                </th>
                {stopName ? <td className="px-3 py-2">{p.stopId ? stopName(p.stopId) ?? "—" : "—"}</td> : null}
                <td className="px-3 py-2">
                  <Badge tone={p.status === "ok" ? "success" : p.status === "skipped" ? "neutral" : "danger"}>{p.status === "ok" ? "OK" : p.status === "timeout" ? "Timed out" : p.status === "skipped" ? "Skipped" : "Error"}</Badge>
                  {p.errorMessage || p.errorCode ? <span className="ml-2 text-xs text-muted-foreground">{p.errorMessage ?? p.errorCode}</span> : null}
                </td>
                <td className="tw-num px-3 py-2 text-right">{p.offers}</td>
                <td className="tw-num px-3 py-2 text-right text-muted-foreground">{Math.round(p.latencyMs)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
