import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "./money";
import type { PartyConfiguration } from "./types";

/** How an organisation uses TripWeave. Personal workspaces never enter the operator shell. */
export type AccountKind = "business" | "individual";

export const TRAVELER_BUDGET_CATEGORIES = ["transport", "stay", "food", "activities", "shopping", "other"] as const;
export type TravelerBudgetCategory = (typeof TRAVELER_BUDGET_CATEGORIES)[number];
export const TRAVELER_BUDGET_CATEGORY_LABELS: Record<TravelerBudgetCategory, string> = {
  transport: "Transport",
  stay: "Stay",
  food: "Food & drink",
  activities: "Activities",
  shopping: "Shopping",
  other: "Other",
};

export const TRAVELER_PACKING_CATEGORIES = ["documents", "clothing", "toiletries", "tech", "health", "other"] as const;
export type TravelerPackingCategory = (typeof TRAVELER_PACKING_CATEGORIES)[number];
export const TRAVELER_PACKING_CATEGORY_LABELS: Record<TravelerPackingCategory, string> = {
  documents: "Documents",
  clothing: "Clothing",
  toiletries: "Toiletries",
  tech: "Tech",
  health: "Health",
  other: "Other",
};

export const TRAVELER_PACES = ["slow", "balanced", "fast"] as const;
export type TravelerPace = (typeof TRAVELER_PACES)[number];
export const TRAVELER_PACE_LABELS: Record<TravelerPace, string> = {
  slow: "Slow and savoured",
  balanced: "Balanced",
  fast: "See as much as possible",
};

export interface TravelerProfile {
  homeCity: string;
  country: string;
  currency: string;
  interests: string[];
  pace: TravelerPace;
  dietary: string;
  notes: string;
}

export const DEFAULT_TRAVELER_PROFILE: TravelerProfile = {
  homeCity: "",
  country: "LK",
  currency: "USD",
  interests: [],
  pace: "balanced",
  dietary: "",
  notes: "",
};

export interface TravelerBudgetItem {
  id: string;
  label: string;
  category: TravelerBudgetCategory;
  amountMinor: number;
  currency: string;
  isPaid: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TravelerPackingItem {
  id: string;
  label: string;
  category: TravelerPackingCategory;
  isChecked: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TravelerNote {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface TravelerShare {
  id: string;
  expiresAt: string;
  includeBudget: boolean;
  viewCount: number;
  createdAt: string;
}

export interface TravelerPublicStop {
  destination: string;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  activities: string[];
}

export interface TravelerPublicItinerary {
  title: string;
  summary: string;
  status: string;
  stops: TravelerPublicStop[];
}

export interface TravelerPublicBudget {
  currency: string;
  totalMinor: number;
  categories: { category: TravelerBudgetCategory; totalMinor: number }[];
}

/** The only shape a public share may expose. No ids, costs, notes, packing or account details. */
export interface TravelerPublicTripView {
  generatedAt: string;
  trip: {
    title: string;
    description: string;
    arrivalDate: string | null;
    departureDate: string | null;
    party: PartyConfiguration;
  };
  itinerary: TravelerPublicItinerary | null;
  budget: TravelerPublicBudget | null;
}

/* ---------- request schemas ---------- */

const travelerPasswordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Include letters and numbers");

export const travelerRegisterSchema = z.object({
  email: z.email().max(254),
  password: travelerPasswordSchema,
  displayName: z.string().trim().min(1).max(120),
  country: z.string().trim().length(2).toUpperCase().default("LK"),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES).default("USD"),
  timezone: z.string().trim().max(64).default("Asia/Colombo"),
  homeCity: z.string().trim().max(80).default(""),
  interests: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  pace: z.enum(TRAVELER_PACES).default("balanced"),
  turnstileToken: z.string().max(2048).optional(),
});

const travelerProfileFields = {
  homeCity: z.string().trim().max(80),
  country: z.string().trim().length(2).toUpperCase(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  interests: z.array(z.string().trim().min(1).max(60)).max(20),
  pace: z.enum(TRAVELER_PACES),
  dietary: z.string().trim().max(300),
  notes: z.string().trim().max(1000),
};

export const travelerProfileSchema = z.object(travelerProfileFields);
export const travelerProfileUpdateSchema = z
  .object({
    ...travelerProfileFields,
    displayName: z.string().trim().min(1).max(120),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

const travelerBudgetFields = {
  label: z.string().trim().min(1).max(120),
  category: z.enum(TRAVELER_BUDGET_CATEGORIES),
  amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  isPaid: z.boolean(),
};
export const travelerBudgetItemSchema = z.object({ ...travelerBudgetFields, isPaid: z.boolean().default(false) });
export const travelerBudgetUpdateSchema = z
  .object(travelerBudgetFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

const travelerPackingFields = {
  label: z.string().trim().min(1).max(120),
  category: z.enum(TRAVELER_PACKING_CATEGORIES),
  isChecked: z.boolean(),
};
export const travelerPackingItemSchema = z.object({ ...travelerPackingFields, isChecked: z.boolean().default(false) });
export const travelerPackingUpdateSchema = z
  .object(travelerPackingFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update");

export const travelerNoteSchema = z.object({ body: z.string().trim().min(1).max(4_000) });
export const travelerNoteUpdateSchema = z.object({ body: z.string().trim().min(1).max(4_000) });

export const travelerShareSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).default(30),
  includeBudget: z.boolean().default(true),
});
