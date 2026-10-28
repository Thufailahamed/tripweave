import { z } from "zod";
import { isIsoDate } from "./dates";
import { SUPPORTED_CURRENCIES } from "./money";
import { ROLES } from "./permissions";

/* ---------- primitives ---------- */
export const idSchema = z.string().min(1).max(64);
export const isoDateSchema = z.string().refine(isIsoDate, "Must be a valid YYYY-MM-DD date");
export const currencySchema = z.enum(SUPPORTED_CURRENCIES);
export const mealPlanSchema = z.enum(["RO", "BB", "HB", "FB", "AI"]);
export const hotelCategorySchema = z.enum(["budget", "standard", "comfort", "boutique", "premium", "luxury"]);
export const budgetScopeSchema = z.enum(["accommodation_only", "all_inclusive_trip"]);
export const minorUnitsSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const basisPointsSchema = z.number().int().min(0).max(100_000);
export const objectiveSchema = z.enum([
  "budget_explorer",
  "best_value",
  "comfort_journey",
  "premium_experience",
  "company_preferred",
]);
export const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(200).optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type Pagination = z.infer<typeof paginationSchema>;

/* ---------- auth / org ---------- */
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Include letters and numbers");

export const registerSchema = z.object({
  email: z.email().max(254),
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120),
  organizationName: z.string().trim().min(2).max(120),
  organizationType: z.enum(["tour_operator", "hotel_management"]),
  country: z.string().trim().length(2).toUpperCase().default("LK"),
  defaultCurrency: currencySchema.default("USD"),
  timezone: z.string().max(64).default("Asia/Colombo"),
  turnstileToken: z.string().max(2048).optional(),
});
export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export const forgotPasswordSchema = z.object({ email: z.email().max(254), turnstileToken: z.string().optional() });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
export const switchOrganizationSchema = z.object({ organizationId: idSchema });

export const brandingSchema = z.object({
  productName: z.string().max(80).optional(),
  logoUrl: z.string().url().max(500).optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  contactEmail: z.email().optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  website: z.string().max(200).optional(),
  quoteFooter: z.string().max(1000).optional(),
});
export type Branding = z.infer<typeof brandingSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  defaultCurrency: currencySchema.optional(),
  timezone: z.string().max(64).optional(),
  country: z.string().length(2).optional(),
  branding: brandingSchema.optional(),
});

export const inviteMemberSchema = z.object({
  email: z.email().max(254),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(ROLES).exclude(["owner"]),
  /** Temporary password for the invited user; they should change it. */
  temporaryPassword: passwordSchema,
});
export const updateMemberSchema = z.object({
  role: z.enum(ROLES).exclude(["owner"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

/* ---------- pricing config ---------- */
export const pricingConfigSchema = z.object({
  mode: z.enum(["target_margin", "percent_markup", "fixed_markup"]).default("target_margin"),
  targetMarginBp: basisPointsSchema.max(9_500).default(2_000),
  markupBp: basisPointsSchema.default(2_500),
  fixedMarkupMinor: minorUnitsSchema.default(0),
  minimumProfitMinor: minorUnitsSchema.default(0),
  minimumSellingPriceMinor: minorUnitsSchema.default(0),
  paymentFeeBp: basisPointsSchema.max(2_000).default(0),
  sellingTaxBp: basisPointsSchema.max(5_000).default(0),
  maxDiscountBp: basisPointsSchema.max(10_000).default(1_000),
  approvalMarginFloorBp: basisPointsSchema.max(9_500).default(1_000),
  roundTo: z.enum(["none", "unit", "ten", "hundred"]).default("none"),
});
export type PricingConfig = z.infer<typeof pricingConfigSchema>;

/* ---------- customers ---------- */
export const customerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.email().max(254).optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  country: z.string().max(2).optional(),
  preferredLanguage: z.string().max(10).optional(),
  notes: z.string().max(4000).optional(),
});

/* ---------- trips ---------- */
export const roomAllocationSchema = z.object({
  adults: z.number().int().min(1).max(10),
  children: z.number().int().min(0).max(10),
  childAges: z.array(z.number().int().min(0).max(17)).optional(),
});
export const partySchema = z
  .object({
    adults: z.number().int().min(1).max(60),
    children: z.number().int().min(0).max(40),
    childAges: z.array(z.number().int().min(0).max(17)).default([]),
    rooms: z.array(roomAllocationSchema).min(1).max(30),
  })
  .superRefine((p, ctx) => {
    const a = p.rooms.reduce((s, r) => s + r.adults, 0);
    const c = p.rooms.reduce((s, r) => s + r.children, 0);
    if (a !== p.adults) ctx.addIssue({ code: "custom", message: "Room allocation adults must equal total adults", path: ["rooms"] });
    if (c !== p.children) ctx.addIssue({ code: "custom", message: "Room allocation children must equal total children", path: ["rooms"] });
    if (p.childAges.length !== 0 && p.childAges.length !== p.children)
      ctx.addIssue({ code: "custom", message: "Provide an age for every child or none", path: ["childAges"] });
  });

export const specialRequirementsSchema = z.object({
  requiredAmenities: z.array(z.string().max(60)).max(30).default([]),
  preferredAmenities: z.array(z.string().max(60)).max(30).default([]),
  accessibility: z.array(z.string().max(120)).max(20).default([]),
  maxLegDurationMinutes: z.number().int().min(15).max(1_440).nullable().default(null),
  requiredMealPlans: z.array(mealPlanSchema).max(5).default([]),
  requireFreeCancellation: z.boolean().default(false),
  other: z.string().max(2_000).default(""),
});
export type SpecialRequirements = z.infer<typeof specialRequirementsSchema>;

const tripRequestBase = z.object({
    customerId: idSchema.nullable().optional(),
    title: z.string().trim().min(2, "Give the trip a title of at least 2 characters").max(200),
    description: z.string().max(10_000).default(""),
    arrivalDate: isoDateSchema.nullable().optional(),
    departureDate: isoDateSchema.nullable().optional(),
    party: partySchema.default({ adults: 2, children: 0, childAges: [], rooms: [{ adults: 2, children: 0 }] }),
    budgetAmountMinor: minorUnitsSchema.nullable().optional(),
    budgetCurrency: currencySchema.default("USD"),
    budgetScope: budgetScopeSchema.default("accommodation_only"),
    preferredHotelCategory: hotelCategorySchema.nullable().optional(),
    preferredMealPlan: mealPlanSchema.nullable().optional(),
    specialRequirements: specialRequirementsSchema.default({
      requiredAmenities: [],
      preferredAmenities: [],
      accessibility: [],
      maxLegDurationMinutes: null,
      requiredMealPlans: [],
      requireFreeCancellation: false,
      other: "",
    }),
    status: z
      .enum(["new", "needs_clarification", "planning", "optimised", "quoted", "won", "lost", "archived"])
      .optional(),
  });
export const tripRequestSchema = tripRequestBase.superRefine((t, ctx) => {
  if (t.arrivalDate && t.departureDate && t.departureDate <= t.arrivalDate)
    ctx.addIssue({ code: "custom", path: ["departureDate"], message: "Departure must be after arrival" });
});
/** Used for PATCH; handlers must only apply keys present in the raw body (see parsePartial in the API). */
export const tripRequestUpdateSchema = tripRequestBase.partial();
export type TripRequestInput = z.infer<typeof tripRequestSchema>;

export const parseTripSchema = z.object({
  text: z.string().trim().min(10).max(8_000),
  /** When true the parsed result is applied to the trip request. */
  apply: z.boolean().default(false),
});

/** Structured output of the AI/rule parser. null / empty = explicitly unknown, never invented. */
export const parsedTripSchema = z.object({
  arrivalDate: isoDateSchema.nullable(),
  departureDate: isoDateSchema.nullable(),
  nights: z.number().int().min(1).max(60).nullable(),
  durationDays: z.number().int().min(1).max(61).nullable(),
  destinations: z.array(z.string().min(1).max(80)).max(20),
  overnightStops: z
    .array(z.object({ destination: z.string().min(1).max(80), nights: z.number().int().min(1).max(30) }))
    .max(20),
  activities: z.array(z.string().max(120)).max(40),
  adults: z.number().int().min(1).max(60).nullable(),
  children: z.number().int().min(0).max(40).nullable(),
  childAges: z.array(z.number().int().min(0).max(17)).max(40),
  roomCount: z.number().int().min(1).max(30).nullable(),
  budgetAmount: z.number().min(0).nullable(),
  budgetCurrency: currencySchema.nullable(),
  budgetScope: budgetScopeSchema.nullable(),
  preferredHotelCategory: hotelCategorySchema.nullable(),
  mealPlans: z.array(mealPlanSchema).max(5),
  requiredAmenities: z.array(z.string().max(60)).max(30),
  preferredAmenities: z.array(z.string().max(60)).max(30),
  accessibility: z.array(z.string().max(120)).max(20),
  maxLegDurationMinutes: z.number().int().min(15).max(1_440).nullable(),
  cancellationPreference: z.enum(["free_cancellation", "any"]).nullable(),
  otherRequirements: z.array(z.string().max(200)).max(20),
  clarifyingQuestions: z.array(z.string().max(300)).max(10),
});
export type ParsedTrip = z.infer<typeof parsedTripSchema>;

export const itineraryStopInputSchema = z.object({
  id: idSchema.optional(),
  destination: z.string().trim().min(1).max(80),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  arrivalDate: isoDateSchema,
  departureDate: isoDateSchema,
  activities: z.array(z.string().max(160)).max(30).default([]),
  notes: z.string().max(1_000).nullable().optional(),
});
export const itineraryInputSchema = z.object({
  title: z.string().max(200).optional(),
  summary: z.string().max(2_000).optional(),
  origin: z.string().max(120).optional(),
  arrivalInformation: z.record(z.string(), z.unknown()).optional(),
  departureInformation: z.record(z.string(), z.unknown()).optional(),
  stops: z.array(itineraryStopInputSchema).min(1).max(20),
});

/* ---------- properties & rates ---------- */
export const propertySchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().max(5_000).default(""),
  country: z.string().length(2).default("LK"),
  region: z.string().max(80).optional(),
  city: z.string().trim().min(1).max(80),
  address: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  category: hotelCategorySchema.default("standard"),
  starClassification: z.number().min(1).max(5).nullable().optional(),
  reviewScore: z.number().min(0).max(10).nullable().optional(),
  amenities: z.array(z.string().max(60)).max(60).default([]),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).default("14:00"),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).default("11:00"),
  contact: z
    .object({ email: z.string().max(254).optional(), phone: z.string().max(40).optional(), website: z.string().max(200).optional() })
    .default({}),
  status: z.enum(["active", "inactive", "draft"]).default("active"),
  preferredPartner: z.boolean().default(false),
});
export const propertyUpdateSchema = propertySchema.partial();

export const roomTypeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2_000).default(""),
  bedConfiguration: z.array(z.string().max(60)).max(6).default([]),
  maximumAdults: z.number().int().min(1).max(12),
  maximumChildren: z.number().int().min(0).max(8).default(0),
  maximumOccupancy: z.number().int().min(1).max(14),
  amenities: z.array(z.string().max(60)).max(40).default([]),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  providerKey: z.string().trim().min(2).max(40).regex(/^[a-z0-9_]+$/),
  supplierType: z.enum(["direct_hotel", "dmc", "wholesaler", "api_provider", "partner"]).default("direct_hotel"),
  status: z.enum(["active", "inactive"]).default("active"),
  configurationReference: z.string().max(120).optional(),
});

const supplierAgreementSchemaBase = z.object({
    supplierId: idSchema,
    contractReference: z.string().trim().min(1).max(80),
    agreementType: z.enum(["net_rate", "commissionable", "allotment", "contract_rate"]).default("net_rate"),
    currency: currencySchema,
    effectiveFrom: isoDateSchema,
    effectiveTo: isoDateSchema,
    termsReference: z.string().max(500).optional(),
    commissionBp: basisPointsSchema.max(9_000).default(0),
    status: z.enum(["active", "expired", "draft", "terminated"]).default("active"),
});
export const supplierAgreementSchema = supplierAgreementSchemaBase
  .refine((a) => a.effectiveTo >= a.effectiveFrom, { message: "effectiveTo must be on or after effectiveFrom", path: ["effectiveTo"] });;
/** For PATCH: validate only supplied keys (see parsePatch). */
export const supplierAgreementUpdateSchema = supplierAgreementSchemaBase.partial();

export const cancellationPolicySchema = z.object({
  refundable: z.boolean(),
  freeCancellationDaysBeforeArrival: z.number().int().min(0).max(365).optional(),
  penaltyDescription: z.string().max(300).optional(),
});

const ratePlanSchemaBase = z.object({
    roomTypeId: idSchema,
    supplierId: idSchema.nullable().optional(),
    supplierAgreementId: idSchema.nullable().optional(),
    name: z.string().trim().min(2).max(120),
    mealPlan: mealPlanSchema,
    rateType: z.enum(["contract", "rack", "promotional", "package"]).default("contract"),
    currency: currencySchema,
    pricingBasis: z.enum(["per_room_per_night", "per_person_per_night"]).default("per_room_per_night"),
    cancellationPolicy: cancellationPolicySchema.default({ refundable: true, freeCancellationDaysBeforeArrival: 7 }),
    paymentTerms: z.object({ type: z.enum(["pay_now", "pay_at_hotel", "credit", "deposit"]).default("credit"), description: z.string().max(300).optional() }).default({ type: "credit" }),
    effectiveFrom: isoDateSchema,
    effectiveTo: isoDateSchema,
    minimumNights: z.number().int().min(1).max(60).default(1),
    maximumNights: z.number().int().min(1).max(365).nullable().optional(),
    status: z.enum(["active", "inactive", "draft"]).default("active"),
});
export const ratePlanSchema = ratePlanSchemaBase
  .refine((r) => r.effectiveTo >= r.effectiveFrom, { message: "effectiveTo must be on or after effectiveFrom", path: ["effectiveTo"] });;
/** For PATCH: validate only supplied keys (see parsePatch). */
export const ratePlanUpdateSchema = ratePlanSchemaBase.partial();

export const taxTreatmentSchema = z.object({
  included: z.boolean().default(false),
  taxBp: basisPointsSchema.max(5_000).default(0),
  serviceChargeBp: basisPointsSchema.max(5_000).default(0),
});
export const extraPersonRulesSchema = z.object({
  baseAdults: z.number().int().min(1).max(12).default(2),
  extraAdultMinor: minorUnitsSchema.default(0),
  extraChildMinor: minorUnitsSchema.default(0),
  childFreeUnderAge: z.number().int().min(0).max(17).default(0),
});

const rateRuleSchemaBase = z.object({
    applicableStartDate: isoDateSchema,
    applicableEndDate: isoDateSchema,
    amountMinor: minorUnitsSchema,
    priority: z.number().int().min(0).max(1_000).default(0),
    occupancyConditions: z
      .object({ minAdults: z.number().int().min(1).optional(), maxAdults: z.number().int().min(1).optional() })
      .default({}),
    taxTreatment: taxTreatmentSchema.default({ included: false, taxBp: 0, serviceChargeBp: 0 }),
    extraPersonRules: extraPersonRulesSchema.default({ baseAdults: 2, extraAdultMinor: 0, extraChildMinor: 0, childFreeUnderAge: 0 }),
    blackoutDates: z.array(isoDateSchema).max(366).default([]),
    label: z.string().max(80).optional(),
});
export const rateRuleSchema = rateRuleSchemaBase
  .refine((r) => r.applicableEndDate >= r.applicableStartDate, { message: "End date must be on or after start date", path: ["applicableEndDate"] });;
/** For PATCH: validate only supplied keys (see parsePatch). */
export const rateRuleUpdateSchema = rateRuleSchemaBase.partial();

export const inventoryUpsertSchema = z.object({
  roomTypeId: idSchema,
  entries: z
    .array(z.object({ date: isoDateSchema, availableQuantity: z.number().int().min(0).max(10_000).nullable() }))
    .min(1)
    .max(400),
});

const partnerAccessSchemaBase = z.object({
    receivingOrganizationId: idSchema,
    resourceType: z.enum(["property", "rate_plan"]),
    resourceId: idSchema,
    permittedRateScope: z.enum(["net_rates", "indicative_only"]).default("net_rates"),
    validFrom: isoDateSchema,
    validUntil: isoDateSchema,
});
export const partnerAccessSchema = partnerAccessSchemaBase
  .refine((p) => p.validUntil >= p.validFrom, { message: "validUntil must be on or after validFrom", path: ["validUntil"] });;
/** For PATCH: validate only supplied keys (see parsePatch). */
export const partnerAccessUpdateSchema = partnerAccessSchemaBase.partial();

export const rateImportRowSchema = z.object({
  property: z.string().min(1),
  roomType: z.string().min(1),
  ratePlan: z.string().min(1),
  mealPlan: mealPlanSchema,
  currency: currencySchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  amount: z.coerce.number().min(0),
  taxBp: z.coerce.number().int().min(0).default(0),
  serviceChargeBp: z.coerce.number().int().min(0).default(0),
  taxIncluded: z.coerce.boolean().default(false),
});

/* ---------- optimisation ---------- */
export const optimisationConstraintsSchema = z.object({
  strictBudget: z.boolean().default(true),
  budgetAmountMinor: minorUnitsSchema.nullable().optional(),
  budgetCurrency: currencySchema.optional(),
  maxLegDurationMinutes: z.number().int().min(15).max(1_440).nullable().optional(),
  minimumCategory: hotelCategorySchema.nullable().optional(),
  requiredAmenities: z.array(z.string().max(60)).max(30).default([]),
  preferredAmenities: z.array(z.string().max(60)).max(30).default([]),
  requiredMealPlans: z.array(mealPlanSchema).max(5).default([]),
  requireFreeCancellation: z.boolean().default(false),
  requireConfirmedAvailability: z.boolean().default(false),
  /** Allow listings whose source does not publish a board basis; packages flag them for confirmation. */
  allowUnconfirmedMealPlans: z.boolean().default(false),
  includeExternalProviders: z.boolean().default(true),
  includeMockProvider: z.boolean().default(false),
});
export const optimisationRequestSchema = z.object({
  itineraryId: idSchema.optional(),
  objectives: z.array(objectiveSchema).min(1).max(5).default([
    "budget_explorer",
    "best_value",
    "comfort_journey",
    "premium_experience",
    "company_preferred",
  ]),
  constraints: optimisationConstraintsSchema.default({
    strictBudget: true,
    requiredAmenities: [],
    preferredAmenities: [],
    requiredMealPlans: [],
    requireFreeCancellation: false,
    requireConfirmedAvailability: false,
    allowUnconfirmedMealPlans: false,
    includeExternalProviders: true,
    includeMockProvider: false,
  }),
  beamWidth: z.number().int().min(1).max(200).default(25),
  candidateLimitPerStop: z.number().int().min(1).max(100).default(12),
});

export const replaceHotelSchema = z.object({
  stopId: idSchema,
  offerId: idSchema,
});

/* ---------- quotes ---------- */
export const quoteItemSchema = z.object({
  category: z.enum(["accommodation", "transport", "activity", "guide", "meal", "other"]),
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().min(1).max(10_000).default(1),
  unitCostMinor: minorUnitsSchema,
  currency: currencySchema,
  included: z.boolean().default(true),
  optional: z.boolean().default(false),
});
export const quoteCreateSchema = z.object({
  tripRequestId: idSchema,
  packageId: idSchema,
  validUntil: isoDateSchema.optional(),
});
export const quoteVersionSchema = z.object({
  packageId: idSchema.optional(),
  /** When omitted the previous version's extra items are carried forward; when present they replace them. */
  extraItems: z.array(quoteItemSchema).max(50).optional(),
  /** Per-quote overrides. Deliberately default-free so unspecified fields keep the organisation's values. */
  pricing: z
    .object({
      mode: z.enum(["target_margin", "percent_markup", "fixed_markup"]).optional(),
      targetMarginBp: basisPointsSchema.max(9_500).optional(),
      markupBp: basisPointsSchema.optional(),
      fixedMarkupMinor: minorUnitsSchema.optional(),
      minimumProfitMinor: minorUnitsSchema.optional(),
      minimumSellingPriceMinor: minorUnitsSchema.optional(),
      paymentFeeBp: basisPointsSchema.max(2_000).optional(),
      sellingTaxBp: basisPointsSchema.max(5_000).optional(),
      maxDiscountBp: basisPointsSchema.max(10_000).optional(),
      approvalMarginFloorBp: basisPointsSchema.max(9_500).optional(),
      roundTo: z.enum(["none", "unit", "ten", "hundred"]).optional(),
    })
    .optional(),
  discountMinor: minorUnitsSchema.default(0),
  validUntil: isoDateSchema.optional(),
  inclusions: z.array(z.string().max(300)).max(40).optional(),
  exclusions: z.array(z.string().max(300)).max(40).optional(),
  terms: z.string().max(10_000).optional(),
  clientNotes: z.string().max(4_000).optional(),
  internalNotes: z.string().max(4_000).optional(),
  expectedVersion: z.number().int().min(1).optional(),
});
export const quoteTransitionSchema = z.object({
  status: z.enum(["draft", "preparing", "ready_for_review", "sent", "viewed", "accepted", "rejected", "expired", "cancelled"]),
  note: z.string().max(500).optional(),
});
export const quoteShareSchema = z.object({
  expiresInDays: z.number().int().min(1).max(180).default(30),
});
export const quoteAcceptSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  acceptedByName: z.string().trim().min(2).max(120),
  acceptedByEmail: z.email().max(254),
  comment: z.string().max(1_000).optional(),
});

