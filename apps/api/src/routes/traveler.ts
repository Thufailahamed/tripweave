import { Hono } from "hono";
import {
  AppError,
  DEFAULT_TRAVELER_PROFILE,
  travelerBudgetItemSchema,
  travelerBudgetUpdateSchema,
  travelerNoteSchema,
  travelerNoteUpdateSchema,
  travelerPackingItemSchema,
  travelerPackingUpdateSchema,
  travelerProfileUpdateSchema,
  travelerShareSchema,
  type TravelerProfile,
} from "@tripweave/shared";
import { identity, ops, traveler, trips } from "@tripweave/database";
import type { Env, Vars } from "../env";
import { randomToken, sha256Hex } from "../lib/crypto";
import { ok, parseBody, requireParam, type AppContext } from "../lib/http";
import { audit, getTraveler, rateLimit, requireTraveler } from "../middleware/auth";

export const travelerRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();
travelerRoutes.use("*", requireTraveler);

const writeLimit = rateLimit({ name: "traveler-write", limit: 300, windowSeconds: 3600, by: "user" });
const shareLimit = rateLimit({ name: "traveler-share", limit: 30, windowSeconds: 3600, by: "user" });

async function mustTrip(c: AppContext, tripId: string) {
  const a = getTraveler(c);
  const trip = await trips.getTrip(c.get("db"), a.organizationId, tripId);
  if (!trip) throw new AppError("not_found", "Trip not found");
  return trip;
}

async function readProfile(c: AppContext) {
  const a = getTraveler(c);
  const db = c.get("db");
  const user = await identity.findUserById(db, a.userId);
  if (!user) throw new AppError("not_found", "User not found");
  const org = await identity.getOrganization(db, a.organizationId);
  const stored = await ops.getSetting<TravelerProfile>(db, a.organizationId, "traveler", {
    ...DEFAULT_TRAVELER_PROFILE,
    country: org?.country ?? "LK",
    currency: org?.defaultCurrency ?? "USD",
  });
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, emailVerified: !!user.emailVerifiedAt },
    profile: {
      ...DEFAULT_TRAVELER_PROFILE,
      ...stored,
      country: org?.country ?? stored.country,
      currency: org?.defaultCurrency ?? stored.currency,
    } satisfies TravelerProfile,
  };
}

travelerRoutes.get("/profile", async (c) => ok(c, await readProfile(c)));

travelerRoutes.patch("/profile", writeLimit, async (c) => {
  const a = getTraveler(c);
  const body = await parseBody(c, travelerProfileUpdateSchema);
  const db = c.get("db");
  if (body.displayName) await identity.updateUserDisplayName(db, a.userId, body.displayName);
  if (body.country || body.currency) {
    await identity.updateOrganization(db, a.organizationId, { country: body.country, defaultCurrency: body.currency });
  }
  const current = await ops.getSetting<TravelerProfile>(db, a.organizationId, "traveler", DEFAULT_TRAVELER_PROFILE);
  const next: TravelerProfile = {
    ...DEFAULT_TRAVELER_PROFILE,
    ...current,
    ...(body.homeCity !== undefined ? { homeCity: body.homeCity } : {}),
    ...(body.country !== undefined ? { country: body.country } : {}),
    ...(body.currency !== undefined ? { currency: body.currency } : {}),
    ...(body.interests !== undefined ? { interests: body.interests } : {}),
    ...(body.pace !== undefined ? { pace: body.pace } : {}),
    ...(body.dietary !== undefined ? { dietary: body.dietary } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
  };
  await ops.setSetting(db, a.organizationId, "traveler", next, a.userId);
  await audit(c, "traveler.profile_updated", "user", a.userId, { fields: Object.keys(body) });
  return ok(c, await readProfile(c));
});

/* ---------- budget ---------- */

travelerRoutes.get("/trips/:id/budget", async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  return ok(c, { items: await traveler.listBudgetItems(c.get("db"), a.organizationId, trip.id) });
});

travelerRoutes.post("/trips/:id/budget", writeLimit, async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  const body = await parseBody(c, travelerBudgetItemSchema);
  const item = await traveler.createBudgetItem(c.get("db"), a.organizationId, trip.id, { ...body, currency: trip.budgetCurrency });
  await audit(c, "traveler.budget_created", "trip", trip.id, { itemId: item.id, category: item.category });
  return ok(c, item, 201);
});

travelerRoutes.patch("/trips/:id/budget/:itemId", writeLimit, async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  const itemId = requireParam(c, "itemId");
  const body = await parseBody(c, travelerBudgetUpdateSchema);
  if (!(await traveler.updateBudgetItem(c.get("db"), a.organizationId, trip.id, itemId, body))) throw new AppError("not_found", "Budget item not found");
  const item = await traveler.getBudgetItem(c.get("db"), a.organizationId, trip.id, itemId);
  await audit(c, "traveler.budget_updated", "trip", trip.id, { itemId });
  return ok(c, item);
});

travelerRoutes.delete("/trips/:id/budget/:itemId", writeLimit, async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  const itemId = requireParam(c, "itemId");
  if (!(await traveler.deleteBudgetItem(c.get("db"), a.organizationId, trip.id, itemId))) throw new AppError("not_found", "Budget item not found");
  await audit(c, "traveler.budget_deleted", "trip", trip.id, { itemId });
  return ok(c, { deleted: true });
});

/* ---------- packing ---------- */

travelerRoutes.get("/trips/:id/packing", async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  return ok(c, { items: await traveler.listPackingItems(c.get("db"), a.organizationId, trip.id) });
});

travelerRoutes.post("/trips/:id/packing", writeLimit, async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  const body = await parseBody(c, travelerPackingItemSchema);
  const item = await traveler.createPackingItem(c.get("db"), a.organizationId, trip.id, body);
  await audit(c, "traveler.packing_created", "trip", trip.id, { itemId: item.id, category: item.category });
  return ok(c, item, 201);
});

travelerRoutes.patch("/trips/:id/packing/:itemId", writeLimit, async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  const itemId = requireParam(c, "itemId");
  const body = await parseBody(c, travelerPackingUpdateSchema);
  if (!(await traveler.updatePackingItem(c.get("db"), a.organizationId, trip.id, itemId, body))) throw new AppError("not_found", "Packing item not found");
  const item = await traveler.getPackingItem(c.get("db"), a.organizationId, trip.id, itemId);
  await audit(c, "traveler.packing_updated", "trip", trip.id, { itemId });
  return ok(c, item);
});

travelerRoutes.delete("/trips/:id/packing/:itemId", writeLimit, async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  const itemId = requireParam(c, "itemId");
  if (!(await traveler.deletePackingItem(c.get("db"), a.organizationId, trip.id, itemId))) throw new AppError("not_found", "Packing item not found");
  await audit(c, "traveler.packing_deleted", "trip", trip.id, { itemId });
  return ok(c, { deleted: true });
});

/* ---------- notes ---------- */

travelerRoutes.get("/trips/:id/notes", async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  return ok(c, { items: await traveler.listNotes(c.get("db"), a.organizationId, trip.id) });
});

travelerRoutes.post("/trips/:id/notes", writeLimit, async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  const body = await parseBody(c, travelerNoteSchema);
  const note = await traveler.createNote(c.get("db"), a.organizationId, trip.id, body.body);
  await audit(c, "traveler.note_created", "trip", trip.id, { noteId: note.id });
  return ok(c, note, 201);
});

travelerRoutes.patch("/trips/:id/notes/:noteId", writeLimit, async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  const noteId = requireParam(c, "noteId");
  const body = await parseBody(c, travelerNoteUpdateSchema);
  if (!(await traveler.updateNote(c.get("db"), a.organizationId, trip.id, noteId, body.body))) throw new AppError("not_found", "Note not found");
  const note = await traveler.getNote(c.get("db"), a.organizationId, trip.id, noteId);
  await audit(c, "traveler.note_updated", "trip", trip.id, { noteId });
  return ok(c, note);
});

travelerRoutes.delete("/trips/:id/notes/:noteId", writeLimit, async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  const noteId = requireParam(c, "noteId");
  if (!(await traveler.deleteNote(c.get("db"), a.organizationId, trip.id, noteId))) throw new AppError("not_found", "Note not found");
  await audit(c, "traveler.note_deleted", "trip", trip.id, { noteId });
  return ok(c, { deleted: true });
});

/* ---------- shares ---------- */

travelerRoutes.get("/trips/:id/shares", async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  return ok(c, { shares: await traveler.listActiveShares(c.get("db"), a.organizationId, trip.id, c.get("deps").now().toISOString()) });
});

travelerRoutes.post("/trips/:id/shares", shareLimit, async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  const body = await parseBody(c, travelerShareSchema);
  const db = c.get("db");
  await traveler.revokeActiveShares(db, a.organizationId, trip.id);
  const token = randomToken(32);
  const expiresAt = new Date(c.get("deps").now().getTime() + body.expiresInDays * 86_400_000).toISOString();
  const share = await traveler.createShare(db, { organizationId: a.organizationId, tripRequestId: trip.id, tokenHash: await sha256Hex(token), expiresAt, includeBudget: body.includeBudget, createdBy: a.userId });
  await audit(c, "traveler.share_created", "trip", trip.id, { shareId: share.id, expiresAt, includeBudget: body.includeBudget });
  return ok(c, { share, url: `${c.env.APP_BASE_URL}/t/${token}` }, 201);
});

travelerRoutes.delete("/trips/:id/shares/:shareId", writeLimit, async (c) => {
  const a = getTraveler(c);
  const trip = await mustTrip(c, requireParam(c, "id"));
  const shareId = requireParam(c, "shareId");
  if (!(await traveler.revokeShare(c.get("db"), a.organizationId, trip.id, shareId))) throw new AppError("not_found", "Share link not found");
  await audit(c, "traveler.share_revoked", "trip", trip.id, { shareId });
  return ok(c, { revoked: true });
});
