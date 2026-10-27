import type { NormalisedOffer, PartyConfiguration } from "@tripweave/shared";

export interface HotelSearchInput {
  destination: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number;
  checkIn: string;
  checkOut: string;
  party: PartyConfiguration;
  /** Preferred currency for supplier pricing where the supplier supports it. */
  currency?: string;
  limit?: number;
  /** Organisation on whose behalf the search runs (tenant scoping for internal inventory). */
  organizationId: string;
}

export interface PropertySearchResult {
  providerKey: string;
  externalPropertyId: string;
  name: string;
  destination: string;
  latitude: number | null;
  longitude: number | null;
  category: NormalisedOffer["property"]["category"];
  starRating: number | null;
  reviewScore: number | null;
  amenities: string[];
  isMock: boolean;
}

export type HotelAvailabilityInput = HotelSearchInput & { propertyIds?: string[] };
export type RoomOffer = NormalisedOffer;

export interface PriceCheckInput {
  offer: NormalisedOffer;
  organizationId: string;
  party: PartyConfiguration;
}

export interface PriceCheckResult {
  status: "confirmed" | "price_changed" | "unavailable" | "not_supported";
  /** Updated offer (verification status reflects the outcome); null when unavailable. */
  offer: NormalisedOffer | null;
  previousTotalMinor: number;
  currentTotalMinor: number | null;
  message?: string;
  checkedAt: string;
}

export type ProviderErrorCode =
  | "timeout"
  | "rate_limited"
  | "auth"
  | "not_configured"
  | "bad_request"
  | "bad_response"
  | "upstream"
  | "unsupported";

export class ProviderError extends Error {
  constructor(
    readonly providerKey: string,
    readonly code: ProviderErrorCode,
    message: string,
    readonly retryable: boolean = false,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface HotelProvider {
  readonly key: string;
  readonly displayName: string;
  /** True for mock/illustrative providers; their offers must never be shown as live. */
  readonly isMock: boolean;
  searchProperties(input: HotelSearchInput): Promise<PropertySearchResult[]>;
  getAvailability(input: HotelAvailabilityInput): Promise<RoomOffer[]>;
  recheckPrice(input: PriceCheckInput): Promise<PriceCheckResult>;
}

export interface ProviderOutcome {
  providerKey: string;
  status: "ok" | "error" | "timeout" | "skipped";
  offers: number;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  isMock: boolean;
}
