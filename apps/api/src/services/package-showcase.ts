import { createParser } from "@openuidev/lang-core";
import {
  PACKAGE_PROP_SCHEMAS,
  PACKAGE_SHOWCASE_COMPONENT_NAMES,
  getPackageShowcaseJSONSchema,
  type PackageShowcaseAction,
  type PackageShowcaseComponentName,
  type PackageShowcaseSnapshot,
} from "@tripweave/planning-contract";
import { AppError, type BudgetScope } from "@tripweave/shared";
import { trips } from "@tripweave/database";
import type { AppContext } from "../lib/http";
import { getTenant } from "../middleware/auth";
import { presentReferencedPackages } from "./package-presentation";
import { collectNodes, freeTextProblem, lang, langArray, TOLERATED_PARSE_ERRORS, withoutNulls } from "./program-validation";

/** The optimiser keeps a bounded shortlist per run; the presentation and its prompt stay within it. */
export const MAX_PRESENTED_PACKAGES = 20;
const MAX_NOTICES = 6;

function noticeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, MAX_NOTICES)
    .map((item) => item.slice(0, 300));
}

/**
 * Builds the presentation snapshot for one optimisation run (the latest successful one by default).
 * Permissions are applied here, so margins and contract references never reach the browser or prompt
 * of a reader who may not see them.
 */
export async function buildPackageShowcaseSnapshot(ctx: AppContext, tripId: string, jobId?: string | null): Promise<PackageShowcaseSnapshot> {
  const a = getTenant(ctx);
  const db = ctx.get("db");
  const trip = await trips.getTrip(db, a.organizationId, tripId);
  if (!trip) throw new AppError("not_found", "Trip not found");
  const job = jobId ? await trips.getJob(db, a.organizationId, jobId) : ((await trips.listJobsForTrip(db, a.organizationId, tripId)).find((row) => row.status === "succeeded") ?? null);
  if (!job || job.tripRequestId !== tripId) throw new AppError("not_found", "Optimisation run not found for this trip");
  const records = job.status === "succeeded" ? await trips.listJobPackages(db, a.organizationId, job.id) : [];
  if (records.length === 0) throw new AppError("precondition_failed", "This optimisation run has no packages to present.");

  const { packages, offers } = await presentReferencedPackages(ctx, records.slice(0, MAX_PRESENTED_PACKAGES));
  const summary = (job.resultSummary ?? {}) as { notes?: unknown; warnings?: unknown };
  const permissions = {
    canValidatePrices: a.permissions.has("packages:write"),
    canCreateQuotes: a.permissions.has("quotes:write"),
    canRunOptimisation: a.permissions.has("optimisation:run"),
    canSeeMargins: a.permissions.has("margins:view"),
    canSeeContracts: a.permissions.has("agreements:manage"),
  };
  const allowedActions: PackageShowcaseAction[] = [
    "open_itinerary",
    ...(permissions.canValidatePrices ? (["validate_package"] as const) : []),
    ...(permissions.canCreateQuotes ? (["create_quote"] as const) : []),
    ...(permissions.canRunOptimisation ? (["open_optimise"] as const) : []),
  ];
  return {
    generatedAt: ctx.get("deps").now().toISOString(),
    job: { id: job.id, completedAt: job.completedAt, notices: [...noticeList(summary.warnings), ...noticeList(summary.notes)].slice(0, MAX_NOTICES) },
    trip: {
      ref: "trip",
      id: trip.id,
      title: trip.title,
      arrivalDate: trip.arrivalDate,
      departureDate: trip.departureDate,
      party: trip.party,
      budgetAmountMinor: trip.budgetAmountMinor,
      budgetCurrency: trip.budgetCurrency,
      budgetScope: trip.budgetScope as BudgetScope,
    },
    packages,
    offers,
    permissions,
    allowedActions,
    allowlist: PACKAGE_SHOWCASE_COMPONENT_NAMES,
  };
}

const COMPONENT_SET = new Set<string>(PACKAGE_SHOWCASE_COMPONENT_NAMES);
/** Components that show a package's own price and hotels. A presentation must include at least one. */
const PACKAGE_BEARING = new Set<string>(["PackageCard", "PackageCompare"]);

/**
 * Validates a complete presentation against the allowlist and the snapshot. The parser enforces the
 * grammar; each node is then checked against its component schema, every model-written string is
 * checked as plain text, and every reference must resolve to a package or offer in this snapshot.
 */
export function validatePackageShowcaseProgram(program: string, snapshot: PackageShowcaseSnapshot): { ok: true } | { ok: false; errors: string[] } {
  if (typeof program !== "string" || program.trim().length === 0) return { ok: false, errors: ["empty program"] };
  if (program.length > 40_000) return { ok: false, errors: ["program too large"] };
  let parser: ReturnType<typeof createParser>;
  try {
    parser = createParser(getPackageShowcaseJSONSchema(), "PackageShowcase");
  } catch {
    return { ok: false, errors: ["validator unavailable"] };
  }
  const result = parser.parse(program);
  const errors: string[] = [];
  if (result.meta.incomplete) errors.push("incomplete program");
  for (const error of result.meta.errors) if (error.severity !== "warning" && !TOLERATED_PARSE_ERRORS.has(error.code)) errors.push(`${error.code}: ${error.message}`);
  if (result.meta.unresolved.length > 0) errors.push(`unresolved references: ${result.meta.unresolved.join(", ")}`);
  if (result.queryStatements.length > 0 || result.mutationStatements.length > 0) errors.push("tool calls are not allowed");
  if (!result.root) errors.push("missing root");
  if (result.root && result.root.typeName !== "PackageShowcase") errors.push("root must be PackageShowcase");
  const { nodes, tooMany } = collectNodes(result.root);
  if (tooMany) errors.push("too many components");
  if (errors.length > 0) return { ok: false, errors };

  const packageByRef = new Map(snapshot.packages.flatMap((pkg) => [[pkg.id, pkg] as const, [pkg.ref, pkg] as const]));
  const offerByRef = new Map(snapshot.offers.flatMap((offer) => [[offer.offerId, offer] as const, [offer.ref, offer] as const]));
  const knownPackage = (key: unknown) => typeof key === "string" && packageByRef.has(key);

  for (const node of nodes) {
    if (!COMPONENT_SET.has(node.typeName)) {
      errors.push(`unknown component: ${node.typeName}`);
      continue;
    }
    const props = withoutNulls(node.props ?? {});
    const parsed = PACKAGE_PROP_SCHEMAS[node.typeName as PackageShowcaseComponentName].safeParse(props);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 3)) errors.push(`${node.typeName}${issue.path.length > 0 ? `.${issue.path.join(".")}` : ""} ${issue.message}`);
      continue;
    }
    for (const [key, value] of Object.entries(props)) {
      const problem = freeTextProblem(value);
      if (problem) errors.push(`${node.typeName}.${key} ${problem}`);
    }
    switch (node.typeName) {
      case "PackageCard":
      case "PriceBreakdown":
      case "BudgetFit":
      case "LivePriceStatus":
      case "PackageInsight":
        if (!knownPackage(props.packageId)) errors.push(`${node.typeName} references an unknown package`);
        break;
      case "PackageCompare": {
        const ids = props.packageIds as string[];
        if (ids.some((id) => !knownPackage(id))) errors.push("PackageCompare references an unknown package");
        if (new Set(ids).size !== ids.length) errors.push("PackageCompare lists a package more than once");
        break;
      }
      case "HotelStay": {
        const offer = offerByRef.get(props.offerId as string);
        if (!offer) errors.push("HotelStay references an unknown offer");
        if (props.packageId !== undefined) {
          const pkg = knownPackage(props.packageId) ? packageByRef.get(props.packageId as string) : null;
          if (!pkg) errors.push("HotelStay references an unknown package");
          else if (offer && !offer.packageIds.includes(pkg.id)) errors.push("HotelStay offer does not belong to that package");
        }
        break;
      }
      default:
        break;
    }
  }
  if (snapshot.packages.length > 0 && !nodes.some((node) => PACKAGE_BEARING.has(node.typeName))) {
    errors.push("show the packages with PackageCard or PackageCompare");
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/**
 * Deterministic presentation built only from snapshot refs. It always validates, so it is safe to show
 * when generation is unavailable, times out or fails validation twice.
 */
export function buildPackageFallbackProgram(snapshot: PackageShowcaseSnapshot, reason: "unavailable" | "invalid" | "standard" = "standard"): string {
  const defs: string[] = [];
  const blocks: string[] = [];
  const add = (expression: string) => {
    const name = `block${blocks.length + 1}`;
    defs.push(`${name} = ${expression}`);
    blocks.push(name);
  };
  const lead = snapshot.packages.find((pkg) => pkg.objective === "best_value" && !pkg.parentId) ?? snapshot.packages[0]!;
  const others = snapshot.packages.filter((pkg) => pkg.ref !== lead.ref).slice(0, 2);
  const compared = snapshot.packages.slice(0, 4);

  add(`Lead(${lang("Every price, hotel and live-check status below comes from the latest server data for this trip.")})`);
  add(`PackageCard(${lang(lead.ref)}, "lead")`);
  add(`PackageInsight(${lang(lead.ref)})`);
  if (compared.length > 1) add(`PackageCompare(${langArray(compared.map((pkg) => pkg.ref))})`);
  for (const pkg of others) add(`PackageCard(${lang(pkg.ref)}, "standard")`);
  add(`LivePriceStatus(${lang(lead.ref)})`);
  add("NextSteps()");

  const subtitle =
    reason === "unavailable"
      ? "AI composition is unavailable, so this standard presentation uses the latest server data."
      : reason === "invalid"
        ? "The generated presentation could not be validated, so this standard presentation uses the latest server data."
        : "A standard presentation of the packages from the latest optimisation run.";
  return [`root = PackageShowcase(${lang("Your trip packages")}, [${blocks.join(", ")}], ${lang(subtitle)})`, ...defs].join("\n");
}
