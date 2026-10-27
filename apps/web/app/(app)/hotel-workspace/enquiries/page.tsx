"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Reply } from "lucide-react";
import { toast } from "sonner";
import { Alert, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { dateRange, formatDateTime } from "@/lib/utils";
import { apiFieldErrors } from "@/features/hotels/lib";
import type { Enquiry } from "@/features/hotels/types";

function RespondForm({ enquiry, onDone }: { enquiry: Enquiry; onDone: () => void }) {
  const qc = useQueryClient();
  const [response, setResponse] = React.useState(enquiry.response ?? "");
  const [close, setClose] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const send = useMutation({
    mutationFn: async () => {
      if (response.trim().length === 0) {
        setFieldError("Write a response first");
        throw new Error("Please fix the highlighted fields.");
      }
      setFieldError(undefined);
      return apiPost(`/enquiries/${enquiry.id}/respond`, { response: response.trim(), close });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["enquiries"] });
      toast.success(close ? "Response sent and enquiry closed" : "Response sent");
      onDone();
    },
    onError: (e) => {
      setFieldError(apiFieldErrors(e).response ?? fieldError);
      setError(errorMessage(e));
    },
  });
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="rounded-md bg-muted/60 p-3 text-sm">
        <p className="font-semibold">{enquiry.subject}</p>
        {enquiry.message ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{enquiry.message}</p> : null}
      </div>
      <Field label="Your response" htmlFor="rs-text" error={fieldError} required>
        <Textarea id="rs-text" rows={5} maxLength={4000} value={response} onChange={(e) => setResponse(e.target.value)} aria-invalid={!!fieldError} />
      </Field>
      <Checkbox label="Close this enquiry after responding" checked={close} onChange={(e) => setClose(e.target.checked)} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={send.isPending}><Reply /> Send response</Button>
      </div>
    </form>
  );
}

function EnquiryList({ direction }: { direction: "received" | "sent" }) {
  const can = useCan();
  const [responding, setResponding] = React.useState<Enquiry | null>(null);
  const q = useQuery({ queryKey: ["enquiries", direction], queryFn: () => apiGet<Enquiry[]>("/enquiries", { direction }) });

  if (q.isLoading) return <LoadingBlock label="Loading enquiries" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load enquiries" />;
  if (!q.data || q.data.length === 0)
    return (
      <EmptyState
        icon={Inbox}
        title={direction === "received" ? "No enquiries received" : "No enquiries sent"}
        description={direction === "received" ? "When a partner you have shared inventory with asks a question, it appears here." : "Send an enquiry from a property a partner has shared with you."}
        action={direction === "sent" ? <Button asChild variant="outline"><Link href="/hotel-workspace/partners">See what is shared with you</Link></Button> : undefined}
      />
    );
  return (
    <>
      <ul className="flex flex-col gap-3">
        {q.data.map((e) => (
          <li key={e.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold">{e.subject}</h3>
                  <p className="text-xs text-muted-foreground">
                    {direction === "received" ? `From ${e.fromName ?? "partner"}` : `To ${e.toName ?? "partner"}`} · {formatDateTime(e.createdAt)}
                  </p>
                </div>
                <StatusBadge status={e.status} />
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {e.propertyId ? (
                  <div><dt className="inline text-muted-foreground">Property: </dt><dd className="inline"><Link href={`/hotels/${e.propertyId}`} className="text-primary hover:underline">{e.propertyName ?? "View property"}</Link></dd></div>
                ) : null}
                {e.stayStart || e.stayEnd ? <div><dt className="inline text-muted-foreground">Stay: </dt><dd className="tw-num inline">{dateRange(e.stayStart, e.stayEnd)}</dd></div> : null}
                {e.guests ? <div><dt className="inline text-muted-foreground">Guests: </dt><dd className="tw-num inline">{e.guests}</dd></div> : null}
              </dl>
              {e.message ? <p className="mt-3 whitespace-pre-wrap text-sm">{e.message}</p> : null}
              {e.response ? (
                <div className="mt-3 rounded-md border-l-4 border-primary bg-primary-soft/50 p-3 text-sm">
                  <p className="text-xs font-semibold text-primary">Response</p>
                  <p className="mt-1 whitespace-pre-wrap">{e.response}</p>
                </div>
              ) : null}
              {direction === "received" && can("partners:manage") && e.status !== "closed" ? (
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant={e.status === "open" ? "default" : "outline"} onClick={() => setResponding(e)}>
                    <Reply /> {e.status === "open" ? "Respond" : "Respond again / close"}
                  </Button>
                </div>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      <Dialog open={responding !== null} onOpenChange={(o) => !o && setResponding(null)}>
        {responding ? (
          <DialogContent title="Respond to enquiry" description={`From ${responding.fromName ?? "partner"}`}>
            <RespondForm enquiry={responding} onDone={() => setResponding(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

export default function EnquiriesPage() {
  const can = useCan();
  if (!can("trips:read"))
    return (
      <div>
        <PageHeader title="Enquiries" />
        <Alert tone="warning" title="Not available to your role">You need the trips:read permission to see enquiries.</Alert>
      </div>
    );
  return (
    <div>
      <PageHeader title="Enquiries" icon={Inbox} description="Questions exchanged with partners who share inventory with you." />
      <Tabs defaultValue="received">
        <TabsList aria-label="Enquiry direction">
          <TabsTrigger value="received">Received</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
        </TabsList>
        <TabsContent value="received">
          <EnquiryList direction="received" />
        </TabsContent>
        <TabsContent value="sent">
          <EnquiryList direction="sent" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
