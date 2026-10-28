"use client";
import * as React from "react";
import { Renderer } from "@openuidev/react-lang";
import type { PackageShowcaseSnapshot } from "@tripweave/planning-contract";
import { Alert } from "@/components/ui/card";
import { PackageShowcaseProvider } from "./context";
import { getPackageShowcaseRenderLibrary } from "./library";
import type { HotelPhoto } from "./photos";

const lang = (value: string) => JSON.stringify(value);

/**
 * The OpenUI Lang program for the package gallery: one PackageCard per package, in the order the reader
 * chose, or one PackageCompare for the table view. Built only from snapshot refs, so it always resolves.
 */
export function buildGalleryProgram({ refs, leadRef, view, title, subtitle }: { refs: string[]; leadRef: string | null; view: "cards" | "compare"; title: string; subtitle: string }): string {
  const defs: string[] = [];
  const blocks: string[] = [];
  if (view === "compare") {
    blocks.push("compare");
    defs.push(`compare = PackageCompare([${refs.map(lang).join(", ")}])`);
  } else {
    refs.forEach((ref, i) => {
      blocks.push(`card${i + 1}`);
      defs.push(`card${i + 1} = PackageCard(${lang(ref)}, ${lang(ref === leadRef ? "lead" : "standard")})`);
    });
  }
  return [`root = PackageShowcase(${lang(title)}, [${blocks.join(", ")}], ${lang(subtitle)})`, ...defs].join("\n");
}

class GalleryBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return <Alert tone="warning" title="The package cards could not be displayed">Reload the page. The comparison table still lists every package.</Alert>;
    return this.props.children;
  }
}

/** Every package in the run, drawn by the same OpenUI blocks the AI story uses. */
export function PackageGallery({
  snapshot,
  program,
  pending,
  photos,
  onAction,
}: {
  snapshot: PackageShowcaseSnapshot;
  program: string;
  pending: string | null;
  photos?: Record<string, HotelPhoto[]>;
  onAction: (event: { type: string; params?: Record<string, unknown> }) => void;
}) {
  const library = React.useMemo(() => getPackageShowcaseRenderLibrary(), []);
  return (
    <GalleryBoundary>
      <PackageShowcaseProvider snapshot={snapshot} pending={pending} photos={photos} surface="gallery">
        <Renderer library={library} response={program} isStreaming={false} publishObservability={false} onAction={(event) => onAction(event as { type: string; params?: Record<string, unknown> })} />
      </PackageShowcaseProvider>
    </GalleryBoundary>
  );
}
