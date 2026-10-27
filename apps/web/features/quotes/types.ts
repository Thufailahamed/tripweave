import type { QuoteStatus } from "@tripweave/shared";

/**
 * Shapes returned by the quotation API. Internal commercial fields (cost, margin, profit, markup, FX,
 * supplier names) are only present when the API decided the user has `margins:view`, so they are all
 * optional here and must only be rendered when `!== undefined`.
 */
export interface QuoteSummary {
  id: string;
  tripRequestId: string;
  customerId: string | null;
  customerName?: string | null;
  tripTitle?: string;
  quoteNumber: string;
  status: QuoteStatus;
  currency: string;
  validUntil: string | null;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  sellingPriceMinor?: number;
  totalCostMinor?: number;
  grossMarginBp?: number;
}

export interface QuoteItem {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unitSellingMinor: number;
  totalSellingMinor: number;
  currency: string;
  optional: boolean;
  unitCostMinor?: number;
  totalCostMinor?: number;
}

export interface QuoteStop {
  destination: string;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  activities?: string[];
}

export interface QuoteSelection {
  destination: string;
  costMinor?: number;
  offer: {
    property: { name: string; category: string | null };
    roomType: { name: string };
    mealPlan: string;
    stayStart: string;
    stayEnd: string;
    nights: number;
    currency?: string;
    cancellation?: { refundable: boolean | null; freeCancellationUntil?: string | null };
    isMock?: boolean;
    verificationStatus?: string;
    supplierName?: string;
    totalAmountMinor?: number;
  };
}

export interface PricingDetail {
  currency?: string;
  sellingPriceBeforeDiscountMinor?: number;
  discountMinor?: number;
  sellingPriceMinor?: number;
  sellingTaxMinor?: number;
  totalPayableMinor?: number;
  approval?: { required: boolean; reasons?: string[] };
  // margins:view only
  totalCostMinor?: number;
  paymentFeeMinor?: number;
  grossProfitMinor?: number;
  grossMarginBp?: number;
  markupBp?: number;
  warnings?: string[];
  categoryTotals?: Record<string, { costMinor: number; sellingMinor: number }>;
  config?: Record<string, unknown>;
}

export interface VersionDetail {
  id: string;
  versionNumber: number;
  itinerary: { title?: string; stops?: QuoteStop[] };
  pricing: PricingDetail;
  package: { selections?: QuoteSelection[] };
  terms: { terms?: string; inclusions?: string[]; exclusions?: string[]; clientNotes?: string };
  internalNotes: string | null;
  approvalRequired: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  items: QuoteItem[];
  sellingPriceMinor: number;
  totalCostMinor?: number;
  grossProfitMinor?: number;
  grossMarginBp?: number;
  fx?: { pivot?: string; rates?: Record<string, string>; source?: string; asOf?: string };
}

export interface VersionSummary {
  versionNumber: number;
  sellingPriceMinor: number;
  totalCostMinor?: number;
  grossMarginBp?: number;
  approvalRequired: boolean;
  approvedAt: string | null;
  createdAt: string;
}

export interface StatusHistoryRow {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  changed_by_name: string | null;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  version_number: number;
  reasons_json: string;
  decision: "approved" | "rejected" | null;
  decision_note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface AcceptanceRow {
  id: string;
  version_number: number;
  decision: "accept" | "reject";
  accepted_by_name: string;
  accepted_by_email: string;
  comment: string | null;
  created_at: string;
}

export interface ShareRow {
  id: string;
  versionNumber: number;
  expiresAt: string;
  revokedAt: string | null;
  viewCount: number;
  firstViewedAt: string | null;
  createdAt: string;
}

export interface QuoteDetailResponse {
  quote: QuoteSummary;
  version: VersionDetail;
  versions: VersionSummary[];
  history: StatusHistoryRow[];
  approvals: ApprovalRow[];
  shares: ShareRow[];
  acceptances: AcceptanceRow[];
  canApprove: boolean;
  awaitingApproval: boolean;
}

export interface ShareResult {
  token: string;
  url: string;
  expiresAt: string;
  version: number;
  emailed?: boolean;
  status?: string;
}

export const quoteKeys = {
  all: ["quotes"] as const,
  list: (params: Record<string, unknown>) => ["quotes", "list", params] as const,
  detail: (id: string, version?: number) => ["quotes", "detail", id, version ?? "current"] as const,
  detailAll: (id: string) => ["quotes", "detail", id] as const,
};
