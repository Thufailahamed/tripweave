/** Response shapes of the hotel / rate / partner endpoints (mirrors packages/database/src/repos/inventory.ts). */
import type { HotelCategory, MealPlan } from "@tripweave/shared";

export type Access = "owner" | "shared" | "provider";

export interface Property {
  id: string;
  ownerOrganizationId: string | null;
  source: string;
  name: string;
  slug: string;
  description: string;
  country: string;
  region: string | null;
  city: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: HotelCategory;
  starClassification: number | null;
  reviewScore: number | null;
  reviewSource: string | null;
  preferredPartner: boolean;
  amenities: string[];
  checkInTime: string;
  checkOutTime: string;
  contact: { email?: string; phone?: string; website?: string };
  status: string;
  createdAt: string;
  updatedAt: string;
  access?: Access;
  coverImageId?: string | null;
}

export interface HotelImage {
  id: string;
  propertyId: string;
  r2ObjectKey: string | null;
  sourceUrl: string | null;
  contentType: string | null;
  altText: string;
  displayOrder: number;
  imageSource: string;
  createdAt: string;
}

export interface RoomType {
  id: string;
  propertyId: string;
  name: string;
  description: string;
  bedConfiguration: string[];
  maximumAdults: number;
  maximumChildren: number;
  maximumOccupancy: number;
  amenities: string[];
  status: string;
}

export interface RatePlan {
  id: string;
  organizationId: string;
  propertyId: string;
  roomTypeId: string;
  supplierId: string | null;
  supplierAgreementId: string | null;
  name: string;
  mealPlan: MealPlan;
  rateType: string;
  currency: string;
  pricingBasis: "per_room_per_night" | "per_person_per_night";
  cancellationPolicy: { refundable?: boolean; freeCancellationDaysBeforeArrival?: number; penaltyDescription?: string };
  paymentTerms: { type?: string; description?: string };
  effectiveFrom: string;
  effectiveTo: string;
  minimumNights: number;
  maximumNights: number | null;
  status: string;
  updatedAt: string;
  shared?: boolean;
  scope?: string;
  roomTypeName?: string;
  propertyName?: string;
}

export interface RateRule {
  id: string;
  ratePlanId: string;
  applicableStartDate: string;
  applicableEndDate: string;
  amountMinor: number;
  currency: string;
  priority: number;
  label: string | null;
  occupancyConditions: { minAdults?: number; maxAdults?: number };
  taxTreatment: { included: boolean; taxBp: number; serviceChargeBp: number };
  extraPersonRules: { baseAdults: number; extraAdultMinor: number; extraChildMinor: number; childFreeUnderAge: number };
  blackoutDates: string[];
  updatedAt: string;
}

export type RatePlanWithRules = RatePlan & { rules: RateRule[] };

export interface HotelDetail {
  property: Property;
  images: HotelImage[];
  rooms: RoomType[];
  ratePlans: RatePlan[];
  canEdit: boolean;
}

export interface Supplier {
  id: string;
  organizationId: string | null;
  name: string;
  providerKey: string;
  supplierType: string;
  status: string;
  configurationReference: string | null;
}

export interface Agreement {
  id: string;
  organizationId: string;
  supplierId: string;
  supplierName?: string;
  contractReference: string;
  agreementType: string;
  currency: string;
  commissionBp: number;
  effectiveFrom: string;
  effectiveTo: string;
  termsReference: string | null;
  status: string;
}

export interface PartnerShare {
  id: string;
  sourceOrganizationId: string;
  receivingOrganizationId: string;
  resourceType: "property" | "rate_plan" | string;
  resourceId: string;
  permittedRateScope: "net_rates" | "indicative_only" | string;
  validFrom: string;
  validUntil: string;
  status: string;
  receivingOrganizationName?: string;
  sourceOrganizationName?: string;
  resourceName?: string;
}

export interface Enquiry {
  id: string;
  fromOrganizationId: string;
  toOrganizationId: string;
  fromName?: string;
  toName?: string;
  propertyId: string | null;
  propertyName?: string | null;
  subject: string;
  message: string;
  stayStart: string | null;
  stayEnd: string | null;
  guests: number | null;
  status: string;
  response: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Overlap {
  a: string;
  b: string;
}

/** Raw `rate_change_history` row (the API returns database columns as-is). */
export interface RateHistoryRow {
  id: string;
  rate_plan_id: string;
  rate_rule_id: string | null;
  change_type: string;
  before_json: string | null;
  after_json: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: string;
}

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
}

export interface ImportResult {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  errors: { row: number; message: string }[];
  created: { ratePlans: number; rules: number };
}
