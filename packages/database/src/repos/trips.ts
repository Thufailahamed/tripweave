import type { ItineraryStop, PartyConfiguration } from "@tripweave/shared";
import { clock, batch, chunk, escapeLike, execute, newId, nowIso, num, numOrNull, paginate, parseJson, query, queryOne, str, strOrNull, stmt, toJson, type Db, type Page, type Row } from "../db";

/* ======================= customers ======================= */

export interface CustomerRecord { id: string; organizationId: string; name: string; email: string | null; phone: string | null; country: string | null; preferredLanguage: string | null; notes: string | null; createdAt: string; updatedAt: string }
const mapCustomer = (r: Row): CustomerRecord => ({ id: str(r.id), organizationId: str(r.organization_id), name: str(r.name), email: strOrNull(r.email), phone: strOrNull(r.phone), country: strOrNull(r.country), preferredLanguage: strOrNull(r.preferred_language), notes: strOrNull(r.notes), createdAt: str(r.created_at), updatedAt: str(r.updated_at) });

export async function createCustomer(db: Db, orgId: string, i: { name: string; email?: string; phone?: string; country?: string; preferredLanguage?: string; notes?: string }): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await execute(db, "INSERT INTO customers (id,organization_id,name,email,phone,country,preferred_language,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [id, orgId, i.name, i.email || null, i.phone ?? null, i.country ?? null, i.preferredLanguage ?? null, i.notes ?? null, ts, ts]);
  return id;
}
export async function getCustomer(db: Db, orgId: string, id: string): Promise<CustomerRecord | null> {
  const r = await queryOne(db, "SELECT * FROM customers WHERE id = ? AND organization_id = ?", [id, orgId]);
  return r ? mapCustomer(r) : null;
}
const CUSTOMER_SORTS: Record<string, string> = { name: "name COLLATE NOCASE", email: "email COLLATE NOCASE", country: "country", created: "created_at", updated: "updated_at" };
/** Without `sort` the list stays A-Z by name; `order` only applies when a sort column is chosen. */
export function listCustomers(db: Db, orgId: string, o: { q?: string; page: number; pageSize: number; sort?: string; order?: "asc" | "desc" }): Promise<Page<CustomerRecord>> {
  const where = ["organization_id = ?"];
  const params: unknown[] = [orgId];
  if (o.q) {
    where.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')");
    params.push(`%${escapeLike(o.q)}%`, `%${escapeLike(o.q)}%`);
  }
  return paginate(db, { select: "*", from: "customers", where: where.join(" AND "), params, orderBy: o.sort && CUSTOMER_SORTS[o.sort] ? `${CUSTOMER_SORTS[o.sort]} ${o.order === "asc" ? "ASC" : "DESC"}, id` : "name COLLATE NOCASE, id", page: o.page, pageSize: o.pageSize, map: mapCustomer });
}
export async function updateCustomer(db: Db, orgId: string, id: string, i: Partial<{ name: string; email: string; phone: string; country: string; preferredLanguage: string; notes: string }>): Promise<boolean> {
  const cols: [string, unknown][] = [["name", i.name], ["email", i.email === "" ? null : i.email], ["phone", i.phone], ["country", i.country], ["preferred_language", i.preferredLanguage], ["notes", i.notes]];
  const set = cols.filter(([, v]) => v !== undefined);
  if (set.length === 0) return true;
  return (await execute(db, `UPDATE customers SET ${set.map(([c]) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND organization_id = ?`, [...set.map(([, v]) => v), nowIso(), id, orgId])) > 0;
}
export async function deleteCustomer(db: Db, orgId: string, id: string): Promise<boolean> {
  return (await execute(db, "DELETE FROM customers WHERE id = ? AND organization_id = ?", [id, orgId])) > 0;
}

/* ======================= trips ======================= */

export interface TripRecord {
  id: string; organizationId: string; customerId: string | null; customerName?: string | null; title: string; description: string;
  arrivalDate: string | null; departureDate: string | null; party: PartyConfiguration;
  budgetAmountMinor: number | null; budgetCurrency: string; budgetScope: string;
  preferredHotelCategory: string | null; preferredMealPlan: string | null; specialRequirements: Record<string, unknown>;
  parseResult: unknown; status: string; createdBy: string | null; createdAt: string; updatedAt: string;
}
const mapTrip = (r: Row): TripRecord => ({
  id: str(r.id), organizationId: str(r.organization_id), customerId: strOrNull(r.customer_id), customerName: r.customer_name == null ? null : str(r.customer_name),
  title: str(r.title), description: str(r.description), arrivalDate: strOrNull(r.arrival_date), departureDate: strOrNull(r.departure_date),
  party: parseJson(r.party_configuration_json, { adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] }),
  budgetAmountMinor: numOrNull(r.budget_amount_minor_units), budgetCurrency: str(r.budget_currency), budgetScope: str(r.budget_scope),
  preferredHotelCategory: strOrNull(r.preferred_hotel_category), preferredMealPlan: strOrNull(r.preferred_meal_plan),
  specialRequirements: parseJson(r.special_requirements_json, {}), parseResult: parseJson(r.parse_result_json, null),
  status: str(r.status), createdBy: strOrNull(r.created_by), createdAt: str(r.created_at), updatedAt: str(r.updated_at),
});

export interface TripInput {
  customerId?: string | null; title: string; description?: string; arrivalDate?: string | null; departureDate?: string | null; party: PartyConfiguration;
  budgetAmountMinor?: number | null; budgetCurrency?: string; budgetScope?: string; preferredHotelCategory?: string | null; preferredMealPlan?: string | null;
  specialRequirements?: unknown; status?: string;
}

export async function createTrip(db: Db, orgId: string, userId: string, i: TripInput): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await batch(db, [
    stmt(db, `INSERT INTO trip_requests (id,organization_id,customer_id,title,description,arrival_date,departure_date,party_configuration_json,budget_amount_minor_units,budget_currency,budget_scope,preferred_hotel_category,preferred_meal_plan,special_requirements_json,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, orgId, i.customerId ?? null, i.title, i.description ?? "", i.arrivalDate ?? null, i.departureDate ?? null, toJson(i.party), i.budgetAmountMinor ?? null, i.budgetCurrency ?? "USD", i.budgetScope ?? "accommodation_only", i.preferredHotelCategory ?? null, i.preferredMealPlan ?? null, toJson(i.specialRequirements ?? {}), i.status ?? "new", userId, ts, ts]),
    stmt(db, "INSERT INTO trip_status_history (id,trip_request_id,from_status,to_status,changed_by,created_at) VALUES (?,?,?,?,?,?)", [newId(), id, null, i.status ?? "new", userId, ts]),
  ]);
  return id;
}
export async function getTrip(db: Db, orgId: string, id: string): Promise<TripRecord | null> {
  const r = await queryOne(db, "SELECT t.*, c.name AS customer_name FROM trip_requests t LEFT JOIN customers c ON c.id = t.customer_id WHERE t.id = ? AND t.organization_id = ?", [id, orgId]);
  return r ? mapTrip(r) : null;
}
export function listTrips(db: Db, orgId: string, o: { q?: string; status?: string; customerId?: string; from?: string; to?: string; page: number; pageSize: number; sort?: string; order?: "asc" | "desc" }): Promise<Page<TripRecord>> {
  const where = ["t.organization_id = ?"];
  const params: unknown[] = [orgId];
  if (o.q) (where.push("(t.title LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')"), params.push(`%${escapeLike(o.q)}%`, `%${escapeLike(o.q)}%`));
  if (o.status) (where.push("t.status = ?"), params.push(o.status));
  if (o.customerId) (where.push("t.customer_id = ?"), params.push(o.customerId));
  if (o.from) (where.push("t.arrival_date >= ?"), params.push(o.from));
  if (o.to) (where.push("t.arrival_date <= ?"), params.push(o.to));
  const sortable: Record<string, string> = { updated: "t.updated_at", created: "t.created_at", arrival: "t.arrival_date", title: "t.title", status: "t.status" };
  return paginate(db, { select: "t.*, c.name AS customer_name", from: "trip_requests t LEFT JOIN customers c ON c.id = t.customer_id", where: where.join(" AND "), params, orderBy: `${sortable[o.sort ?? "updated"] ?? "t.updated_at"} ${o.order === "asc" ? "ASC" : "DESC"}, t.id`, page: o.page, pageSize: o.pageSize, map: mapTrip });
}
export async function updateTrip(db: Db, orgId: string, userId: string, id: string, i: Partial<TripInput> & { parseResult?: unknown }): Promise<boolean> {
  const cols: [string, unknown][] = [
    ["customer_id", i.customerId], ["title", i.title], ["description", i.description], ["arrival_date", i.arrivalDate], ["departure_date", i.departureDate],
    ["party_configuration_json", i.party === undefined ? undefined : toJson(i.party)], ["budget_amount_minor_units", i.budgetAmountMinor], ["budget_currency", i.budgetCurrency], ["budget_scope", i.budgetScope],
    ["preferred_hotel_category", i.preferredHotelCategory], ["preferred_meal_plan", i.preferredMealPlan], ["special_requirements_json", i.specialRequirements === undefined ? undefined : toJson(i.specialRequirements)],
    ["parse_result_json", i.parseResult === undefined ? undefined : toJson(i.parseResult)],
  ];
  const set = cols.filter(([, v]) => v !== undefined);
  const before = i.status ? await getTrip(db, orgId, id) : null;
  if (i.status) set.push(["status", i.status]);
  if (set.length === 0) return true;
  const ts = nowIso();
  const n = await execute(db, `UPDATE trip_requests SET ${set.map(([c]) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND organization_id = ?`, [...set.map(([, v]) => v), ts, id, orgId]);
  if (n > 0 && i.status && before && before.status !== i.status)
    await execute(db, "INSERT INTO trip_status_history (id,trip_request_id,from_status,to_status,changed_by,created_at) VALUES (?,?,?,?,?,?)", [newId(), id, before.status, i.status, userId, ts]);
  return n > 0;
}
export async function setTripStatus(db: Db, orgId: string, id: string, status: string, userId: string | null): Promise<void> {
  const before = await getTrip(db, orgId, id);
  if (!before || before.status === status) return;
  const ts = nowIso();
  await batch(db, [
    stmt(db, "UPDATE trip_requests SET status = ?, updated_at = ? WHERE id = ? AND organization_id = ?", [status, ts, id, orgId]),
    stmt(db, "INSERT INTO trip_status_history (id,trip_request_id,from_status,to_status,changed_by,created_at) VALUES (?,?,?,?,?,?)", [newId(), id, before.status, status, userId, ts]),
  ]);
}
export async function tripStatusHistory(db: Db, tripId: string): Promise<Row[]> {
  return query(db, "SELECT h.*, u.display_name AS changed_by_name FROM trip_status_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.trip_request_id = ? ORDER BY h.created_at, h.rowid", [tripId]);
}

/* ======================= itineraries ======================= */

export interface ItineraryRecord { id: string; tripRequestId: string; version: number; title: string; summary: string; origin: string | null; arrivalInformation: Record<string, unknown>; departureInformation: Record<string, unknown>; status: string; createdAt: string; updatedAt: string; stops: ItineraryStop[] }

const mapStop = (r: Row): ItineraryStop => {
  const arrival = str(r.arrival_date);
  const departure = str(r.departure_date);
  return {
    id: str(r.id), sequence: num(r.sequence_number), destination: str(r.destination), latitude: numOrNull(r.latitude), longitude: numOrNull(r.longitude),
    arrivalDate: arrival, departureDate: departure, nights: Math.round((Date.parse(departure) - Date.parse(arrival)) / 86_400_000),
    activities: parseJson(r.planned_activities_json, []), notes: strOrNull(r.notes),
  };
};

export async function getLatestItinerary(db: Db, orgId: string, tripId: string): Promise<ItineraryRecord | null> {
  const r = await queryOne(db, "SELECT i.* FROM itineraries i JOIN trip_requests t ON t.id = i.trip_request_id WHERE i.trip_request_id = ? AND t.organization_id = ? AND i.status != 'superseded' ORDER BY i.version DESC LIMIT 1", [tripId, orgId]);
  if (!r) return null;
  return hydrateItinerary(db, r);
}
export async function getItinerary(db: Db, orgId: string, id: string): Promise<ItineraryRecord | null> {
  const r = await queryOne(db, "SELECT i.* FROM itineraries i JOIN trip_requests t ON t.id = i.trip_request_id WHERE i.id = ? AND t.organization_id = ?", [id, orgId]);
  return r ? hydrateItinerary(db, r) : null;
}
async function hydrateItinerary(db: Db, r: Row): Promise<ItineraryRecord> {
  const stops = (await query(db, "SELECT * FROM itinerary_stops WHERE itinerary_id = ? ORDER BY sequence_number", [str(r.id)])).map(mapStop);
  return { id: str(r.id), tripRequestId: str(r.trip_request_id), version: num(r.version), title: str(r.title), summary: str(r.summary), origin: strOrNull(r.origin), arrivalInformation: parseJson(r.arrival_information_json, {}), departureInformation: parseJson(r.departure_information_json, {}), status: str(r.status), createdAt: str(r.created_at), updatedAt: str(r.updated_at), stops };
}

/** Saves a new itinerary version (previous ones are marked superseded) with its stops, atomically. */
export async function saveItinerary(db: Db, tripId: string, i: { title?: string; summary?: string; origin?: string; arrivalInformation?: unknown; departureInformation?: unknown; status: "draft" | "suggested" | "confirmed"; stops: ItineraryStop[] }): Promise<{ id: string; version: number; stops: ItineraryStop[] }> {
  const latest = await queryOne<{ v: number }>(db, "SELECT COALESCE(MAX(version),0) AS v FROM itineraries WHERE trip_request_id = ?", [tripId]);
  const version = (latest?.v ?? 0) + 1;
  const id = newId();
  const ts = nowIso();
  const stops = i.stops.map((s, idx) => ({ ...s, id: newId(), sequence: idx + 1 }));
  await batch(db, [
    stmt(db, "UPDATE itineraries SET status = 'superseded' WHERE trip_request_id = ? AND status != 'superseded'", [tripId]),
    stmt(db, "INSERT INTO itineraries (id,trip_request_id,version,title,summary,origin,arrival_information_json,departure_information_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [id, tripId, version, i.title ?? "", i.summary ?? "", i.origin ?? null, toJson(i.arrivalInformation ?? {}), toJson(i.departureInformation ?? {}), i.status, ts, ts]),
    ...stops.map((s) => stmt(db, "INSERT INTO itinerary_stops (id,itinerary_id,sequence_number,destination,latitude,longitude,arrival_date,departure_date,planned_activities_json,travel_constraints_json,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [s.id, id, s.sequence, s.destination, s.latitude, s.longitude, s.arrivalDate, s.departureDate, toJson(s.activities), "{}", s.notes ?? null])),
  ]);
  return { id, version, stops };
}

/* ======================= optimisation jobs ======================= */

export interface JobRecord { id: string; organizationId: string; tripRequestId: string; itineraryId: string; status: string; algorithmVersion: string; request: Record<string, unknown>; constraintsSnapshot: Record<string, unknown>; scoring: Record<string, unknown>; fx: unknown; resultSummary: Record<string, unknown> | null; progress: number; stage: string | null; attempt: number; errorCode: string | null; errorSummary: string | null; createdAt: string; startedAt: string | null; completedAt: string | null }
const mapJob = (r: Row): JobRecord => ({ id: str(r.id), organizationId: str(r.organization_id), tripRequestId: str(r.trip_request_id), itineraryId: str(r.itinerary_id), status: str(r.status), algorithmVersion: str(r.algorithm_version), request: parseJson(r.request_json, {}), constraintsSnapshot: parseJson(r.constraints_snapshot_json, {}), scoring: parseJson(r.scoring_configuration_json, {}), fx: parseJson(r.fx_snapshot_json, null), resultSummary: parseJson(r.result_summary_json, null), progress: num(r.progress), stage: strOrNull(r.stage), attempt: num(r.attempt), errorCode: strOrNull(r.error_code), errorSummary: strOrNull(r.error_summary), createdAt: str(r.created_at), startedAt: strOrNull(r.started_at), completedAt: strOrNull(r.completed_at) });

export async function createJob(db: Db, orgId: string, userId: string, j: { tripRequestId: string; itineraryId: string; algorithmVersion: string; request: unknown; constraints: unknown; scoring: unknown; fx: unknown }): Promise<string> {
  const id = newId();
  await execute(db, "INSERT INTO optimisation_jobs (id,organization_id,trip_request_id,itinerary_id,status,algorithm_version,request_json,constraints_snapshot_json,scoring_configuration_json,fx_snapshot_json,created_by,created_at) VALUES (?,?,?,?, 'queued',?,?,?,?,?,?,?)", [id, orgId, j.tripRequestId, j.itineraryId, j.algorithmVersion, toJson(j.request), toJson(j.constraints), toJson(j.scoring), toJson(j.fx), userId, nowIso()]);
  return id;
}
export async function getJob(db: Db, orgId: string, id: string): Promise<JobRecord | null> {
  const r = await queryOne(db, "SELECT * FROM optimisation_jobs WHERE id = ? AND organization_id = ?", [id, orgId]);
  return r ? mapJob(r) : null;
}
export async function getJobUnscoped(db: Db, id: string): Promise<JobRecord | null> {
  const r = await queryOne(db, "SELECT * FROM optimisation_jobs WHERE id = ?", [id]);
  return r ? mapJob(r) : null;
}
export async function latestJobForTrip(db: Db, orgId: string, tripId: string): Promise<JobRecord | null> {
  const r = await queryOne(db, "SELECT * FROM optimisation_jobs WHERE organization_id = ? AND trip_request_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", [orgId, tripId]);
  return r ? mapJob(r) : null;
}
export async function listJobsForTrip(db: Db, orgId: string, tripId: string): Promise<JobRecord[]> {
  return (await query(db, "SELECT * FROM optimisation_jobs WHERE organization_id = ? AND trip_request_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20", [orgId, tripId])).map(mapJob);
}
/** Atomically moves queued -> running; false means another worker already claimed it (duplicate message). */
export async function claimJob(db: Db, id: string): Promise<boolean> {
  return (await execute(db, "UPDATE optimisation_jobs SET status = 'running', started_at = ?, attempt = attempt + 1, progress = 5, stage = 'starting' WHERE id = ? AND status = 'queued'", [nowIso(), id])) > 0;
}
export async function updateJobProgress(db: Db, id: string, progress: number, stage: string): Promise<void> {
  await execute(db, "UPDATE optimisation_jobs SET progress = ?, stage = ? WHERE id = ? AND status = 'running'", [progress, stage, id]);
}
export async function finishJob(db: Db, id: string, r: { status: "succeeded" | "failed" | "infeasible" | "cancelled"; summary?: unknown; errorCode?: string; errorSummary?: string }): Promise<void> {
  await execute(db, "UPDATE optimisation_jobs SET status = ?, progress = ?, stage = ?, result_summary_json = ?, error_code = ?, error_summary = ?, completed_at = ? WHERE id = ?", [r.status, r.status === "succeeded" || r.status === "infeasible" ? 100 : 0, r.status, r.summary === undefined ? null : toJson(r.summary), r.errorCode ?? null, r.errorSummary ?? null, nowIso(), id]);
}
/** Re-queues a job that failed with a transient error (used by queue retry). */
export async function requeueJob(db: Db, id: string): Promise<void> {
  await execute(db, "UPDATE optimisation_jobs SET status = 'queued', stage = 'retrying' WHERE id = ? AND status = 'running'", [id]);
}
export async function staleRunningJobs(db: Db, olderThanMinutes: number): Promise<JobRecord[]> {
  const cutoff = new Date(clock().getTime() - olderThanMinutes * 60_000).toISOString();
  return (await query(db, "SELECT * FROM optimisation_jobs WHERE status IN ('running','queued') AND COALESCE(started_at, created_at) < ? LIMIT 50", [cutoff])).map(mapJob);
}
export async function jobsNeedingAttention(db: Db, orgId: string): Promise<JobRecord[]> {
  return (await query(db, "SELECT * FROM optimisation_jobs WHERE organization_id = ? AND status IN ('failed','infeasible') AND created_at > ? ORDER BY created_at DESC, rowid DESC LIMIT 10", [orgId, new Date(clock().getTime() - 7 * 86_400_000).toISOString()])).map(mapJob);
}
export async function countJobsThisMonth(db: Db, orgId: string): Promise<number> {
  const start = `${nowIso().slice(0, 7)}-01T00:00:00.000Z`;
  const r = await queryOne<{ n: number }>(db, "SELECT COUNT(*) AS n FROM optimisation_jobs WHERE organization_id = ? AND created_at >= ?", [orgId, start]);
  return r?.n ?? 0;
}

/* ======================= packages (candidate combinations) ======================= */

export interface PackageRecord { id: string; organizationId: string; jobId: string; parentId: string | null; number: number; objective: string; totalCostMinor: number; currency: string; score: number; objectiveScore: number; breakdown: Record<string, unknown>; package: Record<string, unknown>; feasibility: string; verification: Record<string, unknown>; manuallyModified: boolean; createdAt: string }
const mapPackage = (r: Row): PackageRecord => ({ id: str(r.id), organizationId: str(r.organization_id), jobId: str(r.optimisation_job_id), parentId: strOrNull(r.parent_combination_id), number: num(r.combination_number), objective: str(r.objective_type), totalCostMinor: num(r.estimated_cost_minor_units), currency: str(r.currency), score: num(r.score), objectiveScore: num(r.objective_score), breakdown: parseJson(r.score_breakdown_json, {}), package: parseJson(r.package_json, {}), feasibility: str(r.feasibility_status), verification: parseJson(r.verification_summary_json, {}), manuallyModified: num(r.manually_modified) === 1, createdAt: str(r.created_at) });

export interface NewPackage { id?: string; jobId: string; parentId?: string | null; number: number; objective: string; totalCostMinor: number; currency: string; score: number; objectiveScore: number; breakdown: unknown; selectedOffers: unknown; package: unknown; feasibility?: string; verification?: unknown; manuallyModified?: boolean; items: { stopId: string; sequence: number; propertyId: string; offerId: string; costMinor: number; currency: string }[] }

export async function insertPackages(db: Db, orgId: string, pkgs: NewPackage[]): Promise<string[]> {
  const ids: string[] = [];
  for (const part of chunk(pkgs, 5)) {
    const statements = part.flatMap((p) => {
      const id = p.id ?? newId();
      ids.push(id);
      return [
        stmt(db, "INSERT INTO candidate_combinations (id,organization_id,optimisation_job_id,parent_combination_id,combination_number,objective_type,selected_offers_json,estimated_cost_minor_units,currency,score,objective_score,score_breakdown_json,package_json,feasibility_status,verification_summary_json,manually_modified,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [id, orgId, p.jobId, p.parentId ?? null, p.number, p.objective, toJson(p.selectedOffers), p.totalCostMinor, p.currency, p.score, p.objectiveScore, toJson(p.breakdown), toJson(p.package), p.feasibility ?? "feasible", toJson(p.verification ?? {}), p.manuallyModified ? 1 : 0, nowIso()]),
        ...p.items.map((it) => stmt(db, "INSERT INTO candidate_combination_items (id,combination_id,stop_id,stop_sequence,property_id,offer_id,cost_minor_units,currency) VALUES (?,?,?,?,?,?,?,?)", [newId(), id, it.stopId, it.sequence, it.propertyId, it.offerId, it.costMinor, it.currency])),
      ];
    });
    await batch(db, statements);
  }
  return ids;
}
export async function getPackage(db: Db, orgId: string, id: string): Promise<PackageRecord | null> {
  const r = await queryOne(db, "SELECT * FROM candidate_combinations WHERE id = ? AND organization_id = ?", [id, orgId]);
  return r ? mapPackage(r) : null;
}
/** Persists a live-price validation result and any repriced selection costs. */
export async function updatePackageValidation(
  db: Db,
  orgId: string,
  id: string,
  i: { packageJson: unknown; totalCostMinor: number; verification: unknown; items: { stopId: string; costMinor: number }[] },
): Promise<boolean> {
  const statements = [
    stmt(db, "UPDATE candidate_combinations SET package_json = ?, estimated_cost_minor_units = ?, verification_summary_json = ? WHERE id = ? AND organization_id = ?", [toJson(i.packageJson), i.totalCostMinor, toJson(i.verification), id, orgId]),
    ...i.items.map((it) => stmt(db, "UPDATE candidate_combination_items SET cost_minor_units = ? WHERE combination_id = ? AND stop_id = ?", [it.costMinor, id, it.stopId])),
  ];
  await batch(db, statements);
  return true;
}
export async function listJobPackages(db: Db, orgId: string, jobId: string): Promise<PackageRecord[]> {
  return (await query(db, "SELECT * FROM candidate_combinations WHERE organization_id = ? AND optimisation_job_id = ? ORDER BY manually_modified, combination_number, created_at", [orgId, jobId])).map(mapPackage);
}
export async function nextCombinationNumber(db: Db, jobId: string): Promise<number> {
  const r = await queryOne<{ n: number }>(db, "SELECT COALESCE(MAX(combination_number),0)+1 AS n FROM candidate_combinations WHERE optimisation_job_id = ?", [jobId]);
  return r?.n ?? 1;
}

/* ======================= partner enquiries ======================= */

export interface EnquiryRecord { id: string; fromOrganizationId: string; toOrganizationId: string; fromName?: string; toName?: string; propertyId: string | null; propertyName?: string | null; subject: string; message: string; stayStart: string | null; stayEnd: string | null; guests: number | null; status: string; response: string | null; createdAt: string; updatedAt: string }
const mapEnquiry = (r: Row): EnquiryRecord => ({ id: str(r.id), fromOrganizationId: str(r.from_organization_id), toOrganizationId: str(r.to_organization_id), fromName: r.from_name == null ? undefined : str(r.from_name), toName: r.to_name == null ? undefined : str(r.to_name), propertyId: strOrNull(r.property_id), propertyName: r.property_name == null ? null : str(r.property_name), subject: str(r.subject), message: str(r.message), stayStart: strOrNull(r.stay_start_date), stayEnd: strOrNull(r.stay_end_date), guests: numOrNull(r.guests), status: str(r.status), response: strOrNull(r.response), createdAt: str(r.created_at), updatedAt: str(r.updated_at) });

export async function createEnquiry(db: Db, fromOrgId: string, userId: string, i: { toOrganizationId: string; propertyId?: string | null; subject: string; message?: string; stayStart?: string | null; stayEnd?: string | null; guests?: number | null }): Promise<string> {
  const id = newId();
  const ts = nowIso();
  await execute(db, "INSERT INTO partner_enquiries (id,from_organization_id,to_organization_id,property_id,subject,message,stay_start_date,stay_end_date,guests,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [id, fromOrgId, i.toOrganizationId, i.propertyId ?? null, i.subject, i.message ?? "", i.stayStart ?? null, i.stayEnd ?? null, i.guests ?? null, userId, ts, ts]);
  return id;
}
export async function listEnquiries(db: Db, orgId: string, direction: "received" | "sent"): Promise<EnquiryRecord[]> {
  const col = direction === "received" ? "to_organization_id" : "from_organization_id";
  return (await query(db, `SELECT e.*, f.name AS from_name, t.name AS to_name, p.name AS property_name FROM partner_enquiries e JOIN organizations f ON f.id = e.from_organization_id JOIN organizations t ON t.id = e.to_organization_id LEFT JOIN properties p ON p.id = e.property_id WHERE e.${col} = ? ORDER BY e.created_at DESC, e.rowid DESC LIMIT 100`, [orgId])).map(mapEnquiry);
}
export async function respondEnquiry(db: Db, toOrgId: string, id: string, response: string, status: "responded" | "closed"): Promise<boolean> {
  return (await execute(db, "UPDATE partner_enquiries SET response = ?, status = ?, updated_at = ? WHERE id = ? AND to_organization_id = ?", [response, status, nowIso(), id, toOrgId])) > 0;
}

/* ======================= dashboard ======================= */

export async function dashboardCounts(db: Db, orgId: string): Promise<{ trips: Record<string, number>; quotes: Record<string, number>; upcoming: TripRecord[] }> {
  const tripRows = await query<{ status: string; n: number }>(db, "SELECT status, COUNT(*) AS n FROM trip_requests WHERE organization_id = ? GROUP BY status", [orgId]);
  const quoteRows = await query<{ status: string; n: number }>(db, "SELECT status, COUNT(*) AS n FROM quotes WHERE organization_id = ? GROUP BY status", [orgId]);
  const upcoming = (await query(db, "SELECT t.*, c.name AS customer_name FROM trip_requests t LEFT JOIN customers c ON c.id = t.customer_id WHERE t.organization_id = ? AND t.arrival_date >= ? AND t.status NOT IN ('lost','archived') ORDER BY t.arrival_date LIMIT 5", [orgId, nowIso().slice(0, 10)])).map(mapTrip);
  return { trips: Object.fromEntries(tripRows.map((r) => [r.status, Number(r.n)])), quotes: Object.fromEntries(quoteRows.map((r) => [r.status, Number(r.n)])), upcoming };
}

/** Persists intermediate pipeline state (small JSON) so stages can run in separate Worker/Workflow invocations. */
export async function saveJobSummary(db: Db, id: string, summary: unknown): Promise<void> {
  await execute(db, "UPDATE optimisation_jobs SET result_summary_json = ? WHERE id = ?", [toJson(summary), id]);
}

/** Removes generated (non-manual) packages for a job so a retried search stage cannot create duplicates. */
export async function clearJobPackages(db: Db, orgId: string, jobId: string): Promise<void> {
  await execute(db, "DELETE FROM candidate_combinations WHERE organization_id = ? AND optimisation_job_id = ? AND manually_modified = 0 AND parent_combination_id IS NULL", [orgId, jobId]);
}
