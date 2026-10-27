/**
 * Minimal structural view of Cloudflare D1 so repositories (and tests running on node:sqlite)
 * share one code path. `D1Database` from workers-types satisfies this interface.
 */
export interface D1ResultLike<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: { changes?: number; last_row_id?: number; rows_written?: number; rows_read?: number };
}
export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1ResultLike<T>>;
  run(): Promise<D1ResultLike>;
}
export interface Db {
  prepare(sql: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<D1ResultLike[]>;
}

export type Row = Record<string, unknown>;

/** D1 allows at most 100 bound parameters per statement; stay well below. */
export const MAX_IN_PARAMS = 80;

/** Injectable clock so time-dependent queries (expiry, locks, validity) are testable and consistent with the API layer. */
let clockFn: () => Date = () => new Date();
export function setClock(fn: () => Date): void {
  clockFn = fn;
}
export function clock(): Date {
  return clockFn();
}
export function nowIso(): string {
  return clockFn().toISOString();
}
export function newId(): string {
  return crypto.randomUUID();
}

/** D1 rejects `undefined` bind values; normalise to null. */
function clean(values: unknown[]): unknown[] {
  return values.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
}

export function stmt(db: Db, sql: string, params: unknown[] = []): D1StatementLike {
  return db.prepare(sql).bind(...clean(params));
}

export async function query<T = Row>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await stmt(db, sql, params).all<T>();
  return r.results ?? [];
}

export async function queryOne<T = Row>(db: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  return stmt(db, sql, params).first<T>();
}

export async function execute(db: Db, sql: string, params: unknown[] = []): Promise<number> {
  const r = await stmt(db, sql, params).run();
  return r.meta?.changes ?? 0;
}

export async function batch(db: Db, statements: D1StatementLike[]): Promise<D1ResultLike[]> {
  if (statements.length === 0) return [];
  return db.batch(statements);
}

export function chunk<T>(items: T[], size = MAX_IN_PARAMS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs an `IN (...)` query in bounded chunks and concatenates the results. */
export async function queryIn<T = Row>(
  db: Db,
  sqlWithPlaceholder: string,
  ids: string[],
  leadingParams: unknown[] = [],
): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunk(ids)) {
    const sql = sqlWithPlaceholder.replace("{IN}", part.map(() => "?").join(","));
    out.push(...(await query<T>(db, sql, [...leadingParams, ...part])));
  }
  return out;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
export const toJson = (v: unknown): string => JSON.stringify(v ?? null);

export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export async function paginate<T>(
  db: Db,
  opts: {
    select: string;
    from: string;
    where: string;
    params: unknown[];
    orderBy: string;
    page: number;
    pageSize: number;
    map: (row: Row) => T;
  },
): Promise<Page<T>> {
  const totalRow = await queryOne<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${opts.from} WHERE ${opts.where}`, opts.params);
  const rows = await query(
    db,
    `SELECT ${opts.select} FROM ${opts.from} WHERE ${opts.where} ORDER BY ${opts.orderBy} LIMIT ? OFFSET ?`,
    [...opts.params, opts.pageSize, (opts.page - 1) * opts.pageSize],
  );
  return { items: rows.map(opts.map), total: totalRow?.n ?? 0, page: opts.page, pageSize: opts.pageSize };
}

export const bool = (v: unknown): boolean => v === 1 || v === true;
export const str = (v: unknown): string => (v == null ? "" : String(v));
export const strOrNull = (v: unknown): string | null => (v == null ? null : String(v));
export const num = (v: unknown): number => (v == null ? 0 : Number(v));
export const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
