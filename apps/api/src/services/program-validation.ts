/**
 * Checks shared by every generated OpenUI surface (the AI planner and the package presentation):
 * bounded node collection, plain-text rules for model-written strings and OpenUI string literals.
 * Component allowlists and reference rules stay with each surface.
 */

/** Generated screens nest their cards, so a rich reply can hold a few dozen nodes; this caps absurd ones. */
export const MAX_NODES = 60;

/** Extracts every ElementNode reachable from the root, with a hard cap against absurd programs. */
export function collectNodes(root: unknown): { nodes: { typeName: string; props: Record<string, unknown> }[]; tooMany: boolean } {
  const nodes: { typeName: string; props: Record<string, unknown> }[] = [];
  const visitValue = (value: unknown): void => {
    if (nodes.length > MAX_NODES) return;
    if (Array.isArray(value)) {
      for (const item of value) visitValue(item);
      return;
    }
    if (value && typeof value === "object" && (value as { type?: unknown }).type === "element") {
      const node = value as { typeName: string; props: Record<string, unknown> };
      nodes.push({ typeName: node.typeName, props: node.props });
      for (const child of Object.values(node.props ?? {})) visitValue(child);
    }
  };
  visitValue(root);
  return { nodes, tooMany: nodes.length > MAX_NODES };
}

/**
 * Numeric claims and links. Prices, currency amounts, percentages (discounts), review scores and star
 * ratings are facts the server supplies through components, so model-written text must not state them.
 */
const FACT_CLAIM_OR_URL =
  /(?:\b(?:USD|EUR|GBP|LKR)\b\s?\d|[$€£]\s?\d|\d[\d,.]*\s?\b(?:USD|EUR|GBP|LKR|dollars?|euros?|pounds?|rupees?)\b|\d[\d,.]*\s?%|\b\d+(?:\.\d+)?\s?\/\s?10\b|\b\d+(?:\.\d+)?-?stars?\b|https?:\/\/|www\.)/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * The parser drops extra positional arguments before anything renders, so a reply that passes one too
 * many (a subtitle a block does not take, say) is still safe and complete. Rejecting it would throw away
 * a good page over a harmless slip.
 */
export const TOLERATED_PARSE_ERRORS: ReadonlySet<string> = new Set(["excess-args"]);

/**
 * Every string the model writes, at any depth, is plain text. Length and bounds are checked by the
 * component's Zod schema; this rejects control characters and anything that states a price, a rating,
 * a discount or a link.
 */
export function freeTextProblem(value: unknown): string | null {
  if (typeof value === "string") {
    if (value.length > 1_000) return "is too long";
    if (CONTROL_CHARACTERS.test(value)) return "contains control characters";
    if (FACT_CLAIM_OR_URL.test(value)) return "must not contain prices, ratings, percentages or URLs";
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = freeTextProblem(item);
      if (problem) return problem;
    }
  }
  return null;
}

/** The parser represents omitted optional arguments as null; the Zod schemas expect them to be absent. */
export function withoutNulls(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== null && value !== undefined));
}

/** OpenUI string literal for a value the server builds (never model output). */
export function lang(value: string): string {
  return JSON.stringify(value);
}

export function langArray(values: string[]): string {
  return `[${values.map((value) => lang(value)).join(", ")}]`;
}
