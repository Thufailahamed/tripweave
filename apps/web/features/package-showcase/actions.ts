"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PackageShowcaseSnapshot } from "@tripweave/planning-contract";
import { apiPost, errorMessage } from "@/lib/api";
import { tripKeys } from "@/features/trips/hooks";
import { needsLiveCheck, resolveShowcasePackage } from "./helpers";

export type PackageEdit = "replace_hotel" | "reprice_package";

/**
 * Performs the fixed host actions that generated package blocks may request. Every action is checked
 * again by the server; checking here only explains a refusal before the round trip.
 */
export function useShowcaseActions({
  tripId,
  snapshot,
  onValidated,
  onFocusPackage,
  onEditPackage,
}: {
  tripId: string;
  snapshot: PackageShowcaseSnapshot | null;
  /** Called after a live check so the caller can refresh the snapshot it renders from. */
  onValidated?: () => Promise<void> | void;
  onFocusPackage?: (packageId: string) => void;
  onEditPackage?: (packageId: string, edit: PackageEdit) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, setPending] = React.useState<string | null>(null);

  const run = async (key: string, work: () => Promise<void>) => {
    setPending(key);
    try {
      await work();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setPending(null);
    }
  };

  const validate = (packageId: string, ref: string) =>
    run(`validate_package:${ref}`, async () => {
      const result = await apiPost<{ verification: { allVerified: boolean }; changed: boolean }>(`/packages/${packageId}/validate`, {});
      await onValidated?.();
      void qc.invalidateQueries({ queryKey: ["trips", "packages", tripId] });
      void qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      if (result.verification.allVerified) toast.success(result.changed ? "Live prices checked; package totals updated" : "Live prices checked");
      else toast.error("Live price check failed. The package cannot be quoted.");
    });

  const createQuote = (packageId: string, ref: string) =>
    run(`create_quote:${ref}`, async () => {
      const quote = await apiPost<{ id: string }>("/quotes", { tripRequestId: tripId, packageId });
      void qc.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
      toast.success("Quotation created");
      router.push(`/quotes/${quote.id}`);
    });

  const handleAction = (event: { type: string; params?: Record<string, unknown> }) => {
    const ref = typeof event.params?.packageId === "string" ? event.params.packageId : null;
    const pkg = ref && snapshot ? resolveShowcasePackage(snapshot, ref) : null;
    switch (event.type) {
      case "focus_package":
        if (pkg) onFocusPackage?.(pkg.id);
        return;
      case "validate_package":
        if (pkg) void validate(pkg.id, pkg.ref);
        return;
      case "create_quote":
        if (!pkg) return;
        if (needsLiveCheck(pkg)) {
          toast.error("Check live prices before creating a quotation.");
          return;
        }
        void createQuote(pkg.id, pkg.ref);
        return;
      case "replace_hotel":
      case "reprice_package":
        if (pkg) onEditPackage?.(pkg.id, event.type);
        return;
      case "open_itinerary":
        router.push(`/trips/${tripId}/itinerary`);
        return;
      case "open_optimise":
        router.push(`/trips/${tripId}/optimise`);
        return;
      default:
        toast.info("That action is not available here.");
    }
  };

  return { pending, handleAction, validate };
}
