import { QUOTE_TRANSITIONS, type QuoteStatus } from "@tripweave/shared";
import { titleCase } from "@/lib/utils";

export const QUOTE_STATUS_OPTIONS: QuoteStatus[] = ["draft", "preparing", "ready_for_review", "sent", "viewed", "accepted", "rejected", "expired", "cancelled"];

export const statusLabel = (s: string): string => (s === "ready_for_review" ? "Ready for review" : titleCase(s));

/** Whether the lifecycle allows moving `from` -> `to` (mirrors the API's table; the API still decides). */
export function canMove(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** The API issues a quotation from draft/preparing (via review), ready_for_review, and re-issues from sent/viewed. */
export function canIssue(status: QuoteStatus): boolean {
  return status === "ready_for_review" || status === "sent" || status === "viewed" || canMove(status, "ready_for_review");
}

/** Statuses from which the API accepts a new version. */
export const REVISABLE: QuoteStatus[] = ["draft", "preparing", "ready_for_review", "sent", "viewed", "rejected", "expired"];

/** Statuses in which new share links can be created. */
export const SHAREABLE: QuoteStatus[] = ["ready_for_review", "sent", "viewed"];

export function parseReasons(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function cancellationLabel(c: { refundable: boolean | null; freeCancellationUntil?: string | null } | undefined): string {
  if (!c) return "Cancellation terms to be confirmed";
  if (c.refundable === true) return c.freeCancellationUntil ? `Free cancellation until ${c.freeCancellationUntil}` : "Free cancellation (see terms)";
  if (c.refundable === false) return "Non-refundable";
  return "Cancellation terms to be confirmed";
}

export const CATEGORY_LABELS: Record<string, string> = { accommodation: "Accommodation", transport: "Transport", activity: "Activity", guide: "Guide", meal: "Meals", other: "Other" };
export const categoryLabel = (c: string): string => CATEGORY_LABELS[c] ?? titleCase(c);

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
