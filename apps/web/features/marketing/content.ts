import { OBJECTIVE_LABELS, type OptimisationObjective } from "@tripweave/shared";

export const OBJECTIVES: { key: OptimisationObjective; label: string; intent: string; bias: string }[] = [
  { key: "budget_explorer", label: OBJECTIVE_LABELS.budget_explorer, intent: "Lowest overall cost among combinations that meet every mandatory requirement.", bias: "price first" },
  { key: "best_value", label: OBJECTIVE_LABELS.best_value, intent: "Best balance of hotel quality, location and flexibility relative to price.", bias: "balanced" },
  { key: "comfort_journey", label: OBJECTIVE_LABELS.comfort_journey, intent: "Well-located, well-reviewed hotels with sensible travel between stops.", bias: "ease of travel" },
  { key: "premium_experience", label: OBJECTIVE_LABELS.premium_experience, intent: "The highest-quality properties and amenities available within the constraints.", bias: "quality first" },
  { key: "company_preferred", label: OBJECTIVE_LABELS.company_preferred, intent: "Contracted inventory and preferred partner properties first.", bias: "your suppliers" },
];

export const FLOW: { n: string; title: string; text: string }[] = [
  { n: "01", title: "Enquiry", text: "Capture the request once: travellers, dates, interests, budget and must-haves. Paste a free-text email and review what was understood before it is used." },
  { n: "02", title: "Itinerary", text: "Build a route of stops with nights per stop. Travel legs between stops are estimated and labelled, never silently assumed." },
  { n: "03", title: "Optimise", text: "The engine searches hotel and room combinations from your contracted rates and any enabled suppliers, then ranks five distinct packages." },
  { n: "04", title: "Quote", text: "Pick a package, review costs and margin, apply your pricing rules and send a branded quotation. Clients can respond from a secure link." },
];

export const DATA_LABELS: { label: string; text: string }[] = [
  { label: "Company managed", text: "A rate from your own contract or rate sheet." },
  { label: "Supplier reported", text: "Reported by a supplier but not price-checked." },
  { label: "Live checked", text: "A live price check passed at the time of search." },
  { label: "Estimated", text: "An estimate; it must be confirmed before you promise it." },
  { label: "Illustrative", text: "Mock data for demos. It is always marked and cannot be quoted." },
];
