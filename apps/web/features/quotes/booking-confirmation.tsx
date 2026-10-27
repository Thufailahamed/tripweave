"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { quoteKeys, type BookingConfirmationView, type QuoteSummary } from "./types";

interface BookingResponse {
  confirmation: BookingConfirmationView;
  checks: BookingConfirmationView["checks"];
  allConfirmed: boolean;
  changed: boolean;
}

export function BookingConfirmationCard({ quote, confirmation }: { quote: QuoteSummary; confirmation: BookingConfirmationView | null }) {
  const can = useCan();
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BookingResponse | null>(null);
  const shown = result?.confirmation ?? confirmation;
  const valid = shown?.status === "confirmed" && !!shown.validUntil && Date.parse(shown.validUntil) > Date.now();
  const failedChecks = (result?.checks ?? shown?.checks ?? []).filter((c) => c.status !== "confirmed" && c.status !== "not_required");

  const confirm = useMutation({
    mutationFn: () => apiPost<BookingResponse>(`/quotes/${quote.id}/confirm-booking`, {}),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      qc.invalidateQueries({ queryKey: quoteKeys.all });
      if (r.allConfirmed) toast.success("Live prices confirmed for booking");
      else toast.error("The booking cannot be confirmed at the quoted price");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (quote.status !== "accepted") return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-accent" aria-hidden /> Booking-time price confirmation
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Re-checks every external hotel against its live supplier rate immediately before booking. The confirmation is valid for a short window; if any price changed, a new quotation is required.
        </p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {shown ? (
          <Alert tone={valid ? "success" : "warning"} title={valid ? "Confirmed for booking" : "Booking confirmation needed"}>
            <p className="flex flex-wrap items-center gap-2">
              <Badge tone={valid ? "success" : "warning"}>{shown.status === "confirmed" ? (valid ? "Live-confirmed" : "Expired") : "Failed"}</Badge>
              <span className="tw-num font-semibold">{shown.reference}</span>
              <span className="text-xs">checked {formatDateTime(shown.checkedAt)}{shown.validUntil ? ` · valid until ${formatDateTime(shown.validUntil)}` : ""}</span>
            </p>
            {failedChecks.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {failedChecks.map((c) => (
                  <li key={`${c.stopId}:${c.offerId}`}>{c.propertyName ?? c.stopId}: {c.message ?? c.status}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="size-4" aria-hidden /> No pre-booking confirmation has been recorded for this version.
          </p>
        )}
        {can("quotes:write") ? (
          <div>
            <Button loading={confirm.isPending} onClick={() => confirm.mutate()}>
              <BadgeCheck /> {shown?.status === "confirmed" ? "Re-confirm live prices" : "Confirm live prices for booking"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
