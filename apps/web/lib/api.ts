/**
 * Typed client for the Hono API. All calls are same-origin (`/api/v1/*`), cookie-authenticated, and
 * carry the CSRF header the API requires for unsafe methods. Business logic lives in the API: the
 * UI never computes prices, margins or permissions.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;
  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId ?? null;
  }
  /** Field-level problems from a 422 response, keyed by dotted path. */
  get fieldErrors(): Record<string, string> {
    const issues = (this.details as { issues?: { path: string; message: string }[] } | undefined)?.issues ?? [];
    return Object.fromEntries(issues.map((i) => [i.path, i.message]));
  }
}

export interface ListMeta {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
export interface Paged<T> {
  items: T[];
  meta: ListMeta;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(query?: Query): string {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function raw(method: string, path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { accept: "application/json", "x-requested-with": "tripweave", ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}${qs(opts.query)}`, { method, headers, body, credentials: "same-origin", signal: opts.signal });
  } catch {
    throw new ApiError(0, "network_error", "Could not reach the server. Check your connection and try again.");
  }
  return res;
}

async function parse<T>(res: Response): Promise<{ data: T; meta?: ListMeta }> {
  const text = await res.text();
  let json: { data?: T; meta?: ListMeta; error?: { code: string; message: string; details?: unknown; requestId?: string } } | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? `Request failed (${res.status})`, e?.details, e?.requestId);
  }
  return { data: json?.data as T, meta: json?.meta };
}

export async function api<T>(method: string, path: string, opts?: RequestOptions): Promise<T> {
  return (await parse<T>(await raw(method, path, opts))).data;
}
export const apiGet = <T>(path: string, query?: Query, signal?: AbortSignal) => api<T>("GET", path, { query, signal });
export const apiPost = <T>(path: string, body?: unknown, headers?: Record<string, string>) => api<T>("POST", path, { body: body ?? {}, headers });
export const apiPut = <T>(path: string, body?: unknown) => api<T>("PUT", path, { body: body ?? {} });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>("PATCH", path, { body: body ?? {} });
export const apiDelete = <T>(path: string) => api<T>("DELETE", path);

/** Paginated list endpoints return `{ data: [...], meta }`. */
export async function apiList<T>(path: string, query?: Query, signal?: AbortSignal): Promise<Paged<T>> {
  const { data, meta } = await parse<T[]>(await raw("GET", path, { query, signal }));
  return { items: data, meta: meta ?? { total: data.length, page: 1, pageSize: data.length, pages: 1 } };
}

/** Binary download (PDF/CSV) with auth; returns a Blob. */
export async function apiBlob(path: string, query?: Query): Promise<Blob> {
  const res = await raw("GET", path, { query, headers: { accept: "*/*" } });
  if (!res.ok) await parse(res);
  return res.blob();
}

export function openBlob(blob: Blob, filename?: string): void {
  const url = URL.createObjectURL(blob);
  if (filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } else window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong";
}
