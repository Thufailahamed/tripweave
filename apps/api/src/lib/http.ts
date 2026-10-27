import type { Context } from "hono";
import { z, type ZodType } from "zod";
import { AppError } from "@tripweave/shared";
import type { Env, Vars } from "../env";

export type AppContext = Context<{ Bindings: Env; Variables: Vars }>;

export function ok<T>(c: AppContext, data: T, status: 200 | 201 | 202 = 200) {
  return c.json({ data }, status);
}

export function paged<T>(c: AppContext, p: { items: T[]; total: number; page: number; pageSize: number }) {
  return c.json({ data: p.items, meta: { total: p.total, page: p.page, pageSize: p.pageSize, pages: Math.max(1, Math.ceil(p.total / p.pageSize)) } });
}

export function validationError(error: z.ZodError): AppError {
  const issues = error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  return new AppError("validation_failed", issues[0] ? `${issues[0].path ? `${issues[0].path}: ` : ""}${issues[0].message}` : "Invalid request", { issues });
}

export async function readJson(c: AppContext): Promise<unknown> {
  const len = Number(c.req.header("content-length") ?? 0);
  if (len > 1_000_000) throw new AppError("bad_request", "Request body too large");
  try {
    return await c.req.json();
  } catch {
    throw new AppError("bad_request", "Request body must be valid JSON");
  }
}

export async function parseBody<S extends ZodType>(c: AppContext, schema: S): Promise<z.output<S>> {
  const raw = await readJson(c);
  const r = schema.safeParse(raw);
  if (!r.success) throw validationError(r.error);
  return r.data;
}

/**
 * PATCH helper: validates with a partial schema, then keeps ONLY keys present in the request body so
 * schema defaults can never overwrite existing values.
 */
export async function parsePatch<S extends z.ZodObject>(c: AppContext, schema: S): Promise<Partial<z.output<S>>> {
  const raw = await readJson(c);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new AppError("bad_request", "Body must be an object");
  const r = schema.partial().safeParse(raw);
  if (!r.success) throw validationError(r.error);
  const present = Object.keys(raw as Record<string, unknown>);
  return Object.fromEntries(Object.entries(r.data as Record<string, unknown>).filter(([k]) => present.includes(k))) as Partial<z.output<S>>;
}

export function parseQuery<S extends ZodType>(c: AppContext, schema: S): z.output<S> {
  const r = schema.safeParse(c.req.query());
  if (!r.success) throw validationError(r.error);
  return r.data;
}

export function requireParam(c: AppContext, name: string): string {
  const v = c.req.param(name);
  if (!v || v.length > 80) throw new AppError("bad_request", `Invalid ${name}`);
  return v;
}

export const clientIp = (c: AppContext): string => c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

export function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') (field += '"', i++);
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") (row.push(field), (field = ""));
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}
