"use client";
import { createLibrary } from "@openuidev/react-lang";
import { packageShowcaseComponentGroups } from "@tripweave/planning-contract";
import { Lead, Note, PackageShowcase } from "./components/showcase";
import { PackageCard } from "./components/package-card";
import { PackageCompare } from "./components/compare";
import { HotelStay } from "./components/stay";
import { BudgetFit, PriceBreakdown } from "./components/money";
import { LivePriceStatus } from "./components/live";
import { NextSteps, PackageInsight } from "./components/insight";

type PackageShowcaseRenderLibrary = ReturnType<typeof createLibrary>;
let cached: PackageShowcaseRenderLibrary | null = null;

/**
 * Renderer library for the package presentation. Its component names and prop schemas come from the
 * shared contract, so the browser can only draw what the server validated.
 */
export function getPackageShowcaseRenderLibrary(): PackageShowcaseRenderLibrary {
  cached ??= createLibrary({
    id: "tripweave-package-showcase",
    root: "PackageShowcase",
    components: [PackageShowcase, Lead, Note, PackageCard, PackageCompare, HotelStay, PriceBreakdown, BudgetFit, LivePriceStatus, PackageInsight, NextSteps],
    componentGroups: packageShowcaseComponentGroups,
  });
  return cached;
}
