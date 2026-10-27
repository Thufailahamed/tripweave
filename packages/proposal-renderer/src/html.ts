import { formatMoney } from "@tripweave/shared";
import type { ClientQuoteView } from "./client-view";

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const safeColor = (c: string | undefined, fallback: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback);

/** Self-contained HTML (used for emails and print preview). All dynamic text is escaped. */
export function renderProposalHtml(v: ClientQuoteView): string {
  const money = (n: number) => esc(formatMoney(n, v.currency));
  const primary = safeColor(v.organization.branding.primaryColor, "#12403a");
  const accent = safeColor(v.organization.branding.accentColor, "#b8943f");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(`Quotation ${v.quoteNumber}`)}</title>
<style>body{font-family:Inter,Arial,sans-serif;color:#222;margin:0;background:#faf8f3}main{max-width:760px;margin:0 auto;padding:24px}header{background:${primary};color:#fff;padding:24px;border-radius:8px}h1{margin:0;font-size:22px}h2{color:${accent};text-transform:uppercase;font-size:12px;letter-spacing:.08em;border-bottom:1px solid ${accent};padding-bottom:4px;margin-top:28px}table{width:100%;border-collapse:collapse}td{padding:6px 0;vertical-align:top}.r{text-align:right}.muted{color:#666;font-size:13px}.total{font-weight:700;font-size:18px;color:${primary}}</style></head><body><main>
<header><h1>${esc(v.organization.name)}</h1><div class="muted" style="color:#e6d9b0">Travel quotation ${esc(v.quoteNumber)} (v${v.version})</div></header>
<h2>${esc(v.trip.title)}</h2>
<p class="muted">${v.customerName ? `Prepared for ${esc(v.customerName)} · ` : ""}${v.trip.arrivalDate && v.trip.departureDate ? `${esc(v.trip.arrivalDate)} to ${esc(v.trip.departureDate)} · ` : ""}${v.trip.adults} adults${v.trip.children ? `, ${v.trip.children} children` : ""}${v.validUntil ? ` · Valid until ${esc(v.validUntil)}` : ""}</p>
${v.stays.length ? `<h2>Accommodation</h2>${v.stays.map((s) => `<p><strong>${esc(s.destination)}: ${esc(s.propertyName)}</strong><br><span class="muted">${esc(s.roomType)} · ${esc(s.mealPlan)} · ${esc(s.checkIn)} to ${esc(s.checkOut)} · ${esc(s.cancellation)}</span></p>`).join("")}` : ""}
<h2>Pricing</h2><table>${v.lineItems.map((l) => `<tr><td>${esc(l.description)}${l.optional ? ' <span class="muted">(optional)</span>' : ""}</td><td class="r">${money(l.totalMinor)}</td></tr>`).join("")}
${v.totals.discountMinor ? `<tr><td>Discount</td><td class="r">-${money(v.totals.discountMinor)}</td></tr>` : ""}${v.totals.taxMinor ? `<tr><td>Taxes</td><td class="r">${money(v.totals.taxMinor)}</td></tr>` : ""}
<tr><td class="total">Total</td><td class="r total">${money(v.totals.totalPayableMinor)}</td></tr></table>
${v.inclusions.length ? `<h2>Included</h2><ul>${v.inclusions.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
${v.exclusions.length ? `<h2>Not included</h2><ul>${v.exclusions.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
${v.terms ? `<h2>Terms</h2><p class="muted">${esc(v.terms).replace(/\n/g, "<br>")}</p>` : ""}
</main></body></html>`;
}
