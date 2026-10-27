import { Hono } from "hono";
import { AppError, quoteAcceptSchema } from "@tripweave/shared";
import { inventory, ops, quotes, trips } from "@tripweave/database";
import { renderProposalPdf } from "@tripweave/proposal-renderer";
import type { Env, Vars } from "../env";
import { sha256Hex } from "../lib/crypto";
import { clientIp, ok, parseBody, requireParam, type AppContext } from "../lib/http";
import { rateLimit } from "../middleware/auth";
import type { StoredPackage } from "../services/pricing";
import { clientViewFor } from "../services/quotes";

/**
 * Unauthenticated, token-gated client endpoints. They expose only the allow-listed ClientQuoteView:
 * no costs, margins, supplier identities, contract references, staff notes or provider ids.
 */
export const publicRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

publicRoutes.use("*", async (c, next) => {
  await next();
  c.res.headers.set("x-robots-tag", "noindex, nofollow");
  c.res.headers.set("cache-control", "no-store");
  c.res.headers.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
});

async function resolveShare(c: AppContext) {
  const token = requireParam(c, "token");
  if (token.length < 30) throw new AppError("not_found", "This link is invalid or has expired");
  const share = await quotes.findActiveShare(c.get("db"), await sha256Hex(token));
  // Identical response for unknown, revoked and expired tokens: no oracle for token validity.
  if (!share) throw new AppError("not_found", "This link is invalid or has expired");
  const quote = await quotes.getQuote(c.get("db"), share.organizationId, share.quoteId);
  if (!quote || quote.status === "cancelled") throw new AppError("not_found", "This link is invalid or has expired");
  return { token, share, quote };
}

const imageUrlFor = (token: string) => (imageId: string) => `/api/v1/public/quotes/${token}/images/${imageId}`;

publicRoutes.get("/quotes/:token", rateLimit({ name: "public-quote", limit: 120, windowSeconds: 600 }), async (c) => {
  const { token, share, quote } = await resolveShare(c);
  const db = c.get("db");
  const view = await clientViewFor(db, share.organizationId, quote, share.versionNumber, imageUrlFor(token));
  const first = await quotes.recordShareView(db, share.id);
  let status = quote.status;
  if (first && quote.status === "sent" && share.versionNumber === quote.currentVersion) {
    if (await quotes.setQuoteStatus(db, share.organizationId, quote.id, "sent", "viewed", null, "Opened by client")) {
      status = "viewed";
      await ops.addNotification(db, { organizationId: share.organizationId, kind: "quote_viewed", title: `${quote.quoteNumber} was opened by the client`, link: `/quotes/${quote.id}` });
    }
  }
  await ops.writeAudit(db, { organizationId: share.organizationId, actorUserId: null, action: "quote.viewed", resourceType: "quote", resourceId: quote.id, metadata: { version: share.versionNumber, first }, requestId: c.get("requestId") });
  const revised = share.versionNumber !== quote.currentVersion;
  const expired = quote.validUntil !== null && quote.validUntil < c.get("deps").now().toISOString().slice(0, 10);
  return ok(c, { view: { ...view, status }, canRespond: !revised && !expired && ["sent", "viewed"].includes(status), revised, expired });
});

publicRoutes.post("/quotes/:token/respond", rateLimit({ name: "public-respond", limit: 20, windowSeconds: 3600 }), async (c) => {
  const { share, quote } = await resolveShare(c);
  const body = await parseBody(c, quoteAcceptSchema);
  const db = c.get("db");
  if (share.versionNumber !== quote.currentVersion) throw new AppError("precondition_failed", "This quotation has been revised. Please ask your travel consultant for the latest link.");
  if (!["sent", "viewed"].includes(quote.status)) throw new AppError("invalid_transition", `This quotation can no longer be ${body.decision === "accept" ? "accepted" : "declined"} (it is ${quote.status}).`);
  if (quote.validUntil && quote.validUntil < c.get("deps").now().toISOString().slice(0, 10)) throw new AppError("precondition_failed", "This quotation has expired. Please ask for an updated one.");
  const to = body.decision === "accept" ? "accepted" : "rejected";
  if (!(await quotes.setQuoteStatus(db, share.organizationId, quote.id, quote.status, to, null, `Client ${body.decision}ed (${body.acceptedByName})`))) throw new AppError("conflict", "This quotation was just updated; please refresh.");
  await quotes.recordAcceptance(db, { quoteId: quote.id, versionNumber: share.versionNumber, decision: body.decision, name: body.acceptedByName, email: body.acceptedByEmail, comment: body.comment, ipHash: await sha256Hex(clientIp(c)) });
  await trips.setTripStatus(db, share.organizationId, quote.tripRequestId, to === "accepted" ? "won" : "lost", null);
  await ops.addNotification(db, { organizationId: share.organizationId, kind: `quote_${to}`, title: `${quote.quoteNumber} was ${to} by ${body.acceptedByName}`, body: body.comment ?? "", link: `/quotes/${quote.id}` });
  await ops.writeAudit(db, { organizationId: share.organizationId, actorUserId: null, action: `quote.client_${to}`, resourceType: "quote", resourceId: quote.id, metadata: { version: share.versionNumber, by: body.acceptedByName }, requestId: c.get("requestId") });
  return ok(c, { status: to });
});

publicRoutes.get("/quotes/:token/pdf", rateLimit({ name: "public-pdf", limit: 30, windowSeconds: 600 }), async (c) => {
  const { share, quote } = await resolveShare(c);
  const view = await clientViewFor(c.get("db"), share.organizationId, quote, share.versionNumber, () => "");
  const bytes = await renderProposalPdf({ ...view, stays: view.stays.map((s) => ({ ...s, imageUrl: null })) });
  return new Response(bytes, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${quote.quoteNumber}.pdf"`, "cache-control": "no-store", "x-robots-tag": "noindex" } });
});

/** Property images are served only for hotels that appear in the shared version. */
publicRoutes.get("/quotes/:token/images/:imageId", rateLimit({ name: "public-image", limit: 300, windowSeconds: 600 }), async (c) => {
  const { share, quote } = await resolveShare(c);
  const version = await quotes.getVersion(c.get("db"), quote.id, share.versionNumber);
  const pkg = version?.package as unknown as StoredPackage | undefined;
  const img = await inventory.getImage(c.get("db"), requireParam(c, "imageId"));
  if (!img || !pkg || !pkg.selections.some((s) => s.offer.property.id === img.propertyId)) throw new AppError("not_found", "Image not found");
  if (img.sourceUrl) return c.redirect(img.sourceUrl, 302);
  if (!img.r2ObjectKey || !c.env.MEDIA) throw new AppError("not_found", "Image not found");
  const obj = await c.env.MEDIA.get(img.r2ObjectKey);
  if (!obj) throw new AppError("not_found", "Image not found");
  return new Response(obj.body, { headers: { "content-type": img.contentType ?? "application/octet-stream", "cache-control": "private, max-age=600", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
});
