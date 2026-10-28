"use client";
import * as React from "react";
import type { PackageShowcaseSnapshot } from "@tripweave/planning-contract";
import type { HotelPhoto } from "./photos";

interface PackageShowcaseValue {
  snapshot: PackageShowcaseSnapshot;
  /** The key of the host action in flight (for example `validate:pkg_1`), so its button can show progress. */
  pending: string | null;
  /** Photos looked up for stays stored before offers carried their own, keyed by Google property token. */
  photos?: Record<string, HotelPhoto[]>;
  /** Where the blocks are drawn: the package gallery already lists every package, the story may not. */
  surface?: "gallery" | "story";
}

const PackageShowcaseContext = React.createContext<PackageShowcaseValue | null>(null);

export function PackageShowcaseProvider({ snapshot, pending, photos, surface = "story", children }: PackageShowcaseValue & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ snapshot, pending, photos, surface }), [snapshot, pending, photos, surface]);
  return <PackageShowcaseContext.Provider value={value}>{children}</PackageShowcaseContext.Provider>;
}

export function usePackageShowcase(): PackageShowcaseValue {
  const value = React.useContext(PackageShowcaseContext);
  if (!value) throw new Error("Package presentation blocks must be rendered inside a PackageShowcaseProvider");
  return value;
}
