import { Hono } from "hono";
import { z } from "zod";
import { AppError, paginationSchema, pricingConfigSchema, quoteCreateSchema, quoteShareSchema, quoteTransitionSchema, quoteVersionSchema, addDays, type QuoteStatus } from "@tripweave/shared";
import { identity, inventory, quotes, trips } from "@tripweave/database";
import { renderProposalPdf } from "@tripweave/proposal-renderer";
import type { Env, Vars } from "../env";
import { randomToken, sha256Hex } from "../lib/crypto";
import { ok, paged, parseBody, parseQuery, requireParam, type AppContext } from "../lib/http";
import { audit, can, getTenant, rateLimit, requireBusiness, requirePermission } from "../middleware/auth";
import { sendEmail } from "../services/email";
import type { StoredPackage } from "../services/pricing";
import { assertQuotable, assertTransition, buildVersion, clientViewFor, presentVersion, type PackageVerification } from "../services/quotes";
import { confirmQuoteForBooking } from "../services/booking-confirmation";
import { stayImageUrl } from "../services/quote-images";
import { loadPricing, requireFx } from "../services/settings";

export const quoteRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
quoteRoutes.use("*", requireBusiness);

async function mustGetQuote(c: AppContext, id: string) {
  const q = await quotes.getQuote(c.get("db"), getTenant(c).organizationId, id);
  if (!q) throw new AppError("not_found", "Quotation not found");
  return q;
}
const rights = (c: AppContext) => ({ canSeeMargins: getTenant(c).permissions.has("margins:view") });
const EDITABLE: QuoteStatus[] = ["draft", "preparing", "ready_for_review", "sent", "viewed", "rejected", "expired"];

function summary(q: quotes.QuoteRecord, canSeeMargins: boolean) {
  return { ...q, totalCostMinor: canSeeMargins ? q.totalCostMinor : undefined, grossMarginBp: canSeeMargins ? q.grossMarginBp : undefined };
}



async function loadPackageForQuote(c: AppContext, packageId: string, tripId: string) {
  const a = getTenant(c);
  const rec = await trips.getPackage(c.get("db"), a.organizationId, packageId);
  if (!rec) throw new AppError("not_found", "Package not found");
  const job = await trips.getJob(c.get("db"), a.organizationId, rec.jobId);
  if (!job || job.tripRequestId !== tripId) throw new AppError("validation_failed", "That package belongs to a different trip");
  const itinerary = await trips.getItinerary(c.get("db"), a.organizationId, job.itineraryId);
  if (!itinerary) throw new AppError("not_found", "Itinerary not found");
  return { rec, pkg: rec.package as unknown as StoredPackage, itinerary };
}

quoteRoutes.get("/quotes", requirePermission("quotes:read"), async (c) => {
  const q = parseQuery(c, paginationSchema.extend({ status: z.string().max(30).optional(), tripId: z.string().max(64).optional() }));
  const page = await quotes.listQuotes(c.get("db"), getTenant(c).organizationId, q);
  return paged(c, { ...page, items: page.items.map((x) => summary(x, rights(c).canSeeMargins)) });
});

quoteRoutes.post("/quotes", requirePermission("quotes:write"), async (c) => {
  const a = getTenant(c);
  const body = await parseBody(c, quoteCreateSchema);
  const db = c.get("db");
  const trip = await trips.getTrip(db, a.organizationId, body.tripRequestId);
  if (!trip) throw new AppError("not_found", "Trip not found");
  const { rec, pkg, itinerary } = await loadPackageForQuote(c, body.packageId, trip.id);
  assertQuotable(pkg, c.get("deps").now(), rec.verification as PackageVerification);
  const currency = trip.budgetCurrency;
  const config = await loadPricing(db, a.organizationId);
  const fx = await requireFx(db, a.organizationId, pkg.selections.map((s) => s.offer.currency).concat(currency));
  const { version, pricing } = await buildVersion({ db, organizationId: a.organizationId, userId: a.userId, currency, pkg, trip, stops: itinerary.stops, itineraryTitle: itinerary.title || trip.title, config, fx, extraItems: [], discountMinor: 0 });
  const validUntil = body.validUntil ?? addDays(c.get("deps").now().toISOString().slice(0, 10), 14);
  const created = await quotes.createQuote(db, a.organizationId, a.userId, { tripRequestId: trip.id, customerId: trip.customerId, currency, validUntil, packageId: rec.id, version });
  await trips.setTripStatus(db, a.organizationId, trip.id, "quoted", a.userId);
  await audit(c, "quote.created", "quote", created.id, { quoteNumber: created.quoteNumber, packageId: rec.id, sellingPriceMinor: pricing.sellingPriceMinor, approvalRequired: pricing.approval.required });
  const q = await quotes.getQuote(db, a.organizationId, created.id);
  return ok(c, summary(q!, rights(c).canSeeMargins), 201);
});

quoteRoutes.get("/quotes/:id", requirePermission("quotes:read"), async (c) => {
  const a = getTenant(c);
  const q = await mustGetQuote(c, requireParam(c, "id"));
  const db = c.get("db");
  const { version: wanted } = parseQuery(c, z.object({ version: z.coerce.number().int().min(1).optional() }));
  const version = await quotes.getVersion(db, q.id, wanted ?? q.currentVersion);
  if (!version) throw new AppError("not_found", "Version not found");
  const [versions, history, approvals, shares, acceptances, bookingConfirmation] = await Promise.all([quotes.listVersionSummaries(db, q.id), quotes.quoteStatusHistory(db, q.id), quotes.approvalHistory(db, q.id), quotes.listShares(db, q.id), quotes.listAcceptances(db, q.id), quotes.latestBookingConfirmation(db, a.organizationId, q.id, q.currentVersion)]);
  const r = rights(c);
  const presented = presentVersion(version, r);
  const pkg = version.package as unknown as StoredPackage;
  const images = await inventory.firstImagesFor(db, pkg.selections.map((s) => s.offer.property.id));
  const presentedSelections = (presented.package as unknown as { selections: { offer: { property: { id: string } } }[] }).selections;
  const versionView = {
    ...presented,
    package: {
      ...(presented.package as Record<string, unknown>),
      // Stored property photographs win; Google Hotels' own photos are the fallback for provider listings.
      selections: presentedSelections.map((s, i) => ({
        ...s,
        imageUrl: stayImageUrl(images.get(s.offer.property.id), pkg.selections[i]?.offer.providerMetadata),
      })),
    },
  };
  return ok(c, {
    quote: summary(q, r.canSeeMargins),
    version: versionView,
    versions: versions.map((v) => (r.canSeeMargins ? v : { ...v, totalCostMinor: undefined, grossMarginBp: undefined })),
    history, approvals, shares,
    acceptances: acceptances.map(({ ip_hash: _ipHash, ...rest }) => rest), // never expose the client's hashed IP to staff
    bookingConfirmation: bookingConfirmation ? (r.canSeeMargins ? bookingConfirmation : { ...bookingConfirmation, totalCostMinor: undefined, checks: bookingConfirmation.checks.map((check) => { const c = check as { previousTotalMinor?: number; currentTotalMinor?: number | null; [key: string]: unknown }; const { previousTotalMinor: _previous, currentTotalMinor: _current, ...rest } = c; return rest; }) }) : null,
    canApprove: a.permissions.has("quotes:approve"),
    // Only the current version can be approved/sent; a rejected approval needs a new version.
    awaitingApproval: version.versionNumber === q.currentVersion && version.approvalRequired && !version.approvedAt && !approvals.some((x) => x.version_number === version.versionNumber && x.decision === "rejected"),
  });
});

/** New immutable version. Issued versions are never edited in place. */
quoteRoutes.post("/quotes/:id/versions", requirePermission("quotes:write"), async (c) => {
  const a = getTenant(c);
  const db = c.get("db");
  const q = await mustGetQuote(c, requireParam(c, "id"));
  if (!EDITABLE.includes(q.status)) throw new AppError("invalid_transition", `A ${q.status} quotation cannot be revised.`);
  const body = await parseBody(c, quoteVersionSchema.extend({ refreshFx: z.boolean().default(false) }));
  if (body.expectedVersion !== undefined && body.expectedVersion !== q.currentVersion) throw new AppError("conflict", "The quotation was modified by someone else; reload and retry.", { currentVersion: q.currentVersion });
  if (body.pricing && !a.permissions.has("settings:pricing")) throw new AppError("forbidden", "Overriding pricing rules requires pricing-settings permission");
  const prev = await quotes.getVersion(db, q.id, q.currentVersion);
  const trip = await trips.getTrip(db, a.organizationId, q.tripRequestId);
  if (!prev || !trip) throw new AppError("not_found", "Quotation data missing");
  let pkg = prev.package as unknown as StoredPackage;
  let itineraryStops = (prev.itinerary as { stops?: unknown[] }).stops ?? [];
  let itineraryTitle = (prev.itinerary as { title?: string }).title ?? trip.title;
  let packageId: string | null = null;
  if (body.packageId) {
    const loaded = await loadPackageForQuote(c, body.packageId, trip.id);
    pkg = loaded.pkg;
    itineraryStops = loaded.itinerary.stops;
    itineraryTitle = loaded.itinerary.title || trip.title;
    packageId = loaded.rec.id;
    assertQuotable(pkg, c.get("deps").now(), loaded.rec.verification as PackageVerification);
  }
  const baseConfig = { ...(await loadPricing(db, a.organizationId)), ...(body.pricing ?? {}) };
  const config = pricingConfigSchema.parse(baseConfig);
  const prevTerms = prev.terms as { terms?: string; inclusions?: string[]; exclusions?: string[]; clientNotes?: string; extraItems?: z.output<typeof quoteVersionSchema>["extraItems"] };
  const currency = q.currency;
  const extraItems = body.extraItems ?? prevTerms.extraItems ?? []; // omitted => carried forward; present => replaces
  const fx = body.refreshFx ? await requireFx(db, a.organizationId, [...pkg.selections.map((s) => s.offer.currency), ...extraItems.map((i) => i.currency), currency]) : (prev.fx as never);
  const prevExtras = extraItems;
  const { version } = await buildVersion({
    db, organizationId: a.organizationId, userId: a.userId, currency, pkg, trip, stops: itineraryStops, itineraryTitle, config, fx, extraItems: prevExtras, discountMinor: body.discountMinor,
    inclusions: body.inclusions ?? prevTerms.inclusions, exclusions: body.exclusions ?? prevTerms.exclusions, terms: body.terms ?? prevTerms.terms, clientNotes: body.clientNotes ?? prevTerms.clientNotes, internalNotes: body.internalNotes ?? prev.internalNotes ?? undefined,
  });
  const next = await quotes.addQuoteVersion(db, a.organizationId, q.id, q.currentVersion, version, { validUntil: body.validUntil ?? null, packageId });
  // A revised, already-issued quotation goes back to draft; the issued version stays untouched and shareable as-is.
  if (["sent", "viewed", "rejected", "expired", "ready_for_review"].includes(q.status)) await quotes.setQuoteStatus(db, a.organizationId, q.id, q.status, "draft", a.userId, `Revised to v${next}`);
  await audit(c, "quote.version_created", "quote", q.id, { version: next, sellingPriceMinor: version.sellingPriceMinor, approvalRequired: version.approvalRequired });
  const fresh = await quotes.getQuote(db, a.organizationId, q.id);
  return ok(c, { quote: summary(fresh!, rights(c).canSeeMargins), version: presentVersion((await quotes.getVersion(db, q.id, next))!, rights(c)) }, 201);
});

quoteRoutes.get("/quotes/:id/versions", requirePermission("quotes:read"), async (c) => {
  const q = await mustGetQuote(c, requireParam(c, "id"));
  const r = rights(c);
  return ok(c, (await quotes.listVersionSummaries(c.get("db"), q.id)).map((v) => (r.canSeeMargins ? v : { ...v, totalCostMinor: undefined, grossMarginBp: undefined })));
});

/* ---------- lifecycle ---------- */

quoteRoutes.post("/quotes/:id/approve", requirePermission("quotes:approve"), async (c) => {
  const a = getTenant(c);
  const q = await mustGetQuote(c, requireParam(c, "id"));
  const body = await parseBody(c, z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().max(500).optional() }));
  const version = await quotes.getVersion(c.get("db"), q.id, q.currentVersion);
  if (!version?.approvalRequired) throw new AppError("precondition_failed", "This version does not need approval");
  if (version.createdBy === a.userId && a.role !== "owner") throw new AppError("forbidden", "A different manager must approve a quotation you prepared");
  const pending = await quotes.pendingApproval(c.get("db"), q.id, q.currentVersion);
  if (!pending || pending.decision != null) throw new AppError("precondition_failed", "This version has already been decided. Create a new version to request approval again.");
  await quotes.decideApproval(c.get("db"), q.id, q.currentVersion, a.userId, body.decision, body.note);
  await audit(c, `quote.${body.decision}`, "quote", q.id, { version: q.currentVersion });
  return ok(c, { decision: body.decision });
});

quoteRoutes.post("/quotes/:id/status", requirePermission("quotes:write"), async (c) => {
  const a = getTenant(c);
  const q = await mustGetQuote(c, requireParam(c, "id"));
  const body = await parseBody(c, quoteTransitionSchema);
  if (body.status === q.status) return ok(c, summary(q, rights(c).canSeeMargins));
  if (body.status === "viewed") throw new AppError("forbidden", "Viewed is set automatically when the client opens the link");
  if (body.status === "sent") throw new AppError("bad_request", "Use the send action to issue a quotation");
  assertTransition(q.status, body.status);
  if (body.status === "ready_for_review") {
    const v = await quotes.getVersion(c.get("db"), q.id, q.currentVersion);
    if (v?.approvalRequired && !v.approvedAt) { /* allowed: review is where approval is granted */ }
  }
  if (!(await quotes.setQuoteStatus(c.get("db"), a.organizationId, q.id, q.status, body.status, a.userId, body.note))) throw new AppError("conflict", "The quotation status changed; reload and retry.");
  if (["accepted", "rejected"].includes(body.status)) {
    await quotes.recordAcceptance(c.get("db"), { quoteId: q.id, versionNumber: q.currentVersion, decision: body.status === "accepted" ? "accept" : "reject", name: a.displayName, email: a.email, comment: `Recorded by staff${body.note ? `: ${body.note}` : ""}` });
    await trips.setTripStatus(c.get("db"), a.organizationId, q.tripRequestId, body.status === "accepted" ? "won" : "lost", a.userId);
  }
  if (["cancelled", "expired"].includes(body.status)) await quotes.revokeAllShares(c.get("db"), q.id);
  await audit(c, "quote.status_changed", "quote", q.id, { from: q.status, to: body.status });
  return ok(c, summary((await quotes.getQuote(c.get("db"), a.organizationId, q.id))!, rights(c).canSeeMargins));
});

function shareUrl(c: AppContext, token: string): string {
  return `${c.env.APP_BASE_URL.replace(/\/$/, "")}/q/${token}`;
}

async function createShareFor(c: AppContext, q: quotes.QuoteRecord, days: number) {
  const a = getTenant(c);
  const token = randomToken(32);
  const expiresAt = new Date(c.get("deps").now().getTime() + days * 86_400_000).toISOString();
  await quotes.createShare(c.get("db"), q.id, q.currentVersion, await sha256Hex(token), expiresAt, a.userId);
  return { token, url: shareUrl(c, token), expiresAt, version: q.currentVersion };
}

async function assertIssuable(c: AppContext, q: quotes.QuoteRecord) {
  const v = await quotes.getVersion(c.get("db"), q.id, q.currentVersion);
  if (!v) throw new AppError("not_found", "Version not found");
  if (v.approvalRequired && !v.approvedAt) throw new AppError("precondition_failed", "This version needs manager approval (discount or margin threshold) before it can be sent.");
  if (q.validUntil && q.validUntil < c.get("deps").now().toISOString().slice(0, 10)) throw new AppError("precondition_failed", "The validity date has passed; extend it in a new version first.");
  assertQuotable(v.package as unknown as StoredPackage, c.get("deps").now(), undefined, { requireLiveExternal: false });
}

quoteRoutes.post("/quotes/:id/send", requirePermission("quotes:send"), async (c) => {
  const a = getTenant(c);
  const db = c.get("db");
  const q = await mustGetQuote(c, requireParam(c, "id"));
  const body = await parseBody(c, quoteShareSchema.extend({ message: z.string().max(2000).optional(), email: z.boolean().default(true) }));
  if (!["draft", "preparing", "ready_for_review", "sent", "viewed"].includes(q.status)) assertTransition(q.status, "sent");
  await assertIssuable(c, q);
  if (q.status === "draft" || q.status === "preparing") await quotes.setQuoteStatus(db, a.organizationId, q.id, q.status, "ready_for_review", a.userId);
  const current = (await quotes.getQuote(db, a.organizationId, q.id))!;
  if (current.status === "ready_for_review") await quotes.setQuoteStatus(db, a.organizationId, q.id, "ready_for_review", "sent", a.userId, "Issued to client");
  const share = await createShareFor(c, current, body.expiresInDays);
  let emailed = false;
  if (body.email && current.customerId) {
    const customer = await trips.getCustomer(db, a.organizationId, current.customerId);
    const org = await identity.getOrganization(db, a.organizationId);
    if (customer?.email) {
      await sendEmail(c.env, db, c.get("deps"), { organizationId: a.organizationId, to: customer.email, subject: `Your travel quotation ${q.quoteNumber} from ${org?.name ?? "us"}`, body: `${body.message ? `${body.message}\n\n` : ""}View your quotation (valid until ${q.validUntil ?? "the date shown"}):\n${share.url}\n` });
      emailed = true;
    }
  }
  await audit(c, "quote.sent", "quote", q.id, { version: q.currentVersion, emailed });
  return ok(c, { ...share, emailed, status: (await quotes.getQuote(db, a.organizationId, q.id))!.status });
});

quoteRoutes.post("/quotes/:id/confirm-booking", requirePermission("quotes:write"), rateLimit({ name: "confirm-booking", limit: 60, windowSeconds: 3600, by: "user" }), async (c) => {
  const a = getTenant(c);
  const id = requireParam(c, "id");
  const result = await confirmQuoteForBooking(
    { env: c.env, db: c.get("db"), deps: c.get("deps") },
    a.organizationId,
    a.userId,
    id,
    { validityMinutes: Number(c.env.PRICE_VALIDITY_MINUTES ?? 15) },
  );
  await audit(c, "quote.booking_confirmation", "quote", id, { status: result.confirmation.status, reference: result.confirmation.reference, allConfirmed: result.allConfirmed, changed: result.changed });
  const margins = can(c, "margins:view");
  const checks = margins
    ? result.checks
    : result.checks.map(({ previousTotalMinor: _previous, currentTotalMinor: _current, ...check }) => check);
  const confirmation = margins ? result.confirmation : { ...result.confirmation, totalCostMinor: undefined };
  return ok(c, { confirmation, checks, allConfirmed: result.allConfirmed, changed: result.changed });
});

quoteRoutes.post("/quotes/:id/share", requirePermission("quotes:send"), async (c) => {  const q = await mustGetQuote(c, requireParam(c, "id"));
  const body = await parseBody(c, quoteShareSchema);
  if (!["ready_for_review", "sent", "viewed"].includes(q.status)) throw new AppError("invalid_transition", "Share links can be created once a quotation is ready for review or sent.");
  await assertIssuable(c, q);
  const share = await createShareFor(c, q, body.expiresInDays);
  await audit(c, "quote.share_created", "quote", q.id, { version: q.currentVersion, expiresAt: share.expiresAt });
  return ok(c, share, 201);
});

quoteRoutes.delete("/quotes/:id/shares/:shareId", requirePermission("quotes:send"), async (c) => {
  const q = await mustGetQuote(c, requireParam(c, "id"));
  if (!(await quotes.revokeShare(c.get("db"), q.id, requireParam(c, "shareId")))) throw new AppError("not_found", "Share link not found or already revoked");
  await audit(c, "quote.share_revoked", "quote", q.id, { shareId: requireParam(c, "shareId") });
  return ok(c, { revoked: true });
});

/* ---------- documents ---------- */

quoteRoutes.get("/quotes/:id/pdf", requirePermission("quotes:read"), async (c) => {
  const a = getTenant(c);
  const db = c.get("db");
  const q = await mustGetQuote(c, requireParam(c, "id"));
  const { version } = parseQuery(c, z.object({ version: z.coerce.number().int().min(1).optional() }));
  const n = version ?? q.currentVersion;
  if (!(await quotes.getVersion(db, q.id, n))) throw new AppError("not_found", "Version not found");
  const pdf = await buildAndStorePdf(c, q, n);
  await audit(c, "quote.pdf_generated", "quote", q.id, { version: n });
  return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${q.quoteNumber}-v${n}.pdf"`, "cache-control": "private, no-store" } });
});

export async function buildAndStorePdf(c: AppContext, q: quotes.QuoteRecord, versionNumber: number): Promise<Uint8Array> {
  const db = c.get("db");
  const existing = await quotes.latestDocument(db, q.organizationId, "quote", q.id, versionNumber);
  if (existing && c.env.MEDIA && q.status !== "draft") {
    const obj = await c.env.MEDIA.get(String(existing.r2_object_key));
    if (obj) return new Uint8Array(await obj.arrayBuffer());
  }
  const view = await clientViewFor(db, q.organizationId, q, versionNumber, () => "");
  let bytes: Uint8Array;
  try {
    bytes = await renderProposalPdf({ ...view, stays: view.stays.map((s) => ({ ...s, imageUrl: null })) });
  } catch (e) {
    throw new AppError("internal_error", `The PDF could not be generated: ${(e as Error).message.slice(0, 100)}`);
  }
  if (c.env.MEDIA) {
    const key = `documents/${q.organizationId}/quotes/${q.id}/v${versionNumber}-${Date.now()}.pdf`;
    await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } });
    await quotes.recordDocument(db, { organizationId: q.organizationId, resourceType: "quote", resourceId: q.id, versionNumber, key, contentType: "application/pdf", size: bytes.length, sha256: await sha256Hex(String(bytes.length) + key) });
  }
  return bytes;
}

