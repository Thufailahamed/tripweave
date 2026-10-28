"use client";
import * as React from "react";
import type { PackageShowcaseSnapshot } from "@tripweave/planning-contract";

interface PackageShowcaseValue {
  snapshot: PackageShowcaseSnapshot;
  /** The key of the host action in flight (for example `validate:pkg_1`), so its button can show progress. */
  pending: string | null;
}

const PackageShowcaseContext = React.createContext<PackageShowcaseValue | null>(null);

export function PackageShowcaseProvider({ snapshot, pending, children }: PackageShowcaseValue & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ snapshot, pending }), [snapshot, pending]);
  return <PackageShowcaseContext.Provider value={value}>{children}</PackageShowcaseContext.Provider>;
}

export function usePackageShowcase(): PackageShowcaseValue {
  const value = React.useContext(PackageShowcaseContext);
  if (!value) throw new Error("Package presentation blocks must be rendered inside a PackageShowcaseProvider");
  return value;
}
