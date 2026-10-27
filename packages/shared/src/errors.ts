export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "invalid_transition"
  | "precondition_failed"
  | "unprocessable"
  | "provider_error"
  | "ai_unavailable"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  invalid_transition: 409,
  precondition_failed: 412,
  unprocessable: 422,
  provider_error: 502,
  ai_unavailable: 503,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const notFound = (what = "Resource") => new AppError("not_found", `${what} not found`);
export const forbidden = (msg = "You do not have permission to perform this action") =>
  new AppError("forbidden", msg);
export const badRequest = (msg: string, details?: unknown) => new AppError("bad_request", msg, details);
export const conflict = (msg: string, details?: unknown) => new AppError("conflict", msg, details);
