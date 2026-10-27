"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorState, Spinner } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiBlob, openBlob } from "@/lib/api";

/** Generates the PDF on demand (each generation is audited server-side) and previews it in an iframe. */
export function PdfPreview({ quoteId, quoteNumber, version }: { quoteId: string; quoteNumber: string; version: number }) {
  const [requested, setRequested] = React.useState<number | null>(null);
  const enabled = requested === version;
  const q = useQuery({
    queryKey: ["quotes", "pdf", quoteId, version],
    queryFn: () => apiBlob(`/quotes/${quoteId}/pdf`, { version }),
    enabled,
    staleTime: 60_000,
    gcTime: 60_000,
  });
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!q.data) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(q.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [q.data]);

  const filename = `${quoteNumber}-v${version}.pdf`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>PDF proposal</CardTitle>
        <CardDescription>The client-facing document for version {version}. It contains selling prices only.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!enabled ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">Generate the PDF to preview, open or download it.</p>
            <Button onClick={() => setRequested(version)}>
              <FileText /> Generate PDF preview
            </Button>
          </div>
        ) : q.isLoading || q.isFetching ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Generating PDF…
          </p>
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not generate the PDF" />
        ) : q.data && url ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank", "noopener")}>
                <ExternalLink /> Open in new tab
              </Button>
              <Button variant="outline" size="sm" onClick={() => q.data && openBlob(q.data, filename)}>
                <Download /> Download
              </Button>
            </div>
            <iframe title={`PDF preview of ${quoteNumber} version ${version}`} src={url} className="h-[70vh] min-h-96 w-full rounded-md border border-border bg-muted" />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
