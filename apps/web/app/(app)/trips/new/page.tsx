"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { parseTripSchema } from "@tripweave/shared";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingBlock, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { ApiError, apiPost, errorMessage } from "@/lib/api";
import { useCan } from "@/lib/session";
import { defaultTripForm, TripFormFields, validateTripForm, type TripFormState } from "@/features/trips/trip-form";
import { tripKeys } from "@/features/trips/hooks";
import type { ParseResponse, Trip } from "@/features/trips/types";

function NewTripInner() {
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const sp = useSearchParams();
  const [form, setForm] = React.useState<TripFormState>(() => defaultTripForm({ customerId: sp.get("customerId") ?? "" }));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [topError, setTopError] = React.useState<string | null>(null);
  const [enquiry, setEnquiry] = React.useState("");
  const [enquiryError, setEnquiryError] = React.useState<string | null>(null);

  const afterCreate = (id: string) => {
    qc.invalidateQueries({ queryKey: tripKeys.all });
    router.push(`/trips/${id}`);
  };

  const create = useMutation({
    mutationFn: (payload: unknown) => apiPost<Trip>("/trips", payload),
    onSuccess: (trip) => {
      toast.success("Trip request created");
      afterCreate(trip.id);
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors((prev) => ({ ...prev, ...e.fieldErrors }));
      setTopError(errorMessage(e));
    },
  });

  const fromEnquiry = useMutation({
    mutationFn: async () => {
      const text = enquiry.trim();
      const title = form.title.trim().length >= 2 ? form.title.trim() : `New enquiry ${new Date().toISOString().slice(0, 10)}`;
      const trip = await apiPost<Trip>("/trips", { title, description: text, customerId: form.customerId || null });
      try {
        const parsed = await apiPost<ParseResponse>(`/trips/${trip.id}/parse`, { text, apply: true });
        return { trip, parsed, parseError: null as string | null };
      } catch (e) {
        return { trip, parsed: null, parseError: errorMessage(e) };
      }
    },
    onSuccess: ({ trip, parsed, parseError }) => {
      if (parseError) toast.error(`Trip created, but requirements could not be extracted: ${parseError}`);
      else toast.success(`Requirements extracted with ${parsed!.engine === "rules" ? "the rules engine" : "AI"}. Review them below.`);
      afterCreate(trip.id);
    },
    onError: (e) => setEnquiryError(errorMessage(e)),
  });

  const submitEnquiry = () => {
    setEnquiryError(null);
    const r = parseTripSchema.safeParse({ text: enquiry, apply: true });
    if (!r.success) {
      setEnquiryError(enquiry.trim().length < 10 ? "Write at least 10 characters so there is something to extract." : r.error.issues[0]?.message ?? "Invalid enquiry");
      return;
    }
    fromEnquiry.mutate();
  };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setTopError(null);
    const r = validateTripForm(form);
    if (!r.ok) {
      setErrors(r.errors);
      setTopError("Some fields need attention. Fix the highlighted fields and try again.");
      return;
    }
    setErrors({});
    create.mutate(r.payload);
  };

  if (!can("trips:write")) {
    return <Alert tone="warning" title="You do not have permission to create trip requests">Ask an administrator for the trips:write permission.</Alert>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={<Link href="/trips" className="hover:underline">Trip requests</Link>} title="New trip request" icon={Sparkles} description="Paste the customer's message and let TripWeave extract the requirements, or fill the form yourself. Nothing is final until you confirm the itinerary." />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Start from an enquiry</CardTitle>
          <CardDescription>The extraction never invents details: anything unclear becomes a question for you. You can review and edit every extracted value afterwards.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {enquiryError ? <Alert tone="danger">{enquiryError}</Alert> : null}
          <Field label="Customer enquiry" htmlFor="enquiry" hint="e.g. “Family of 4 (kids 8 and 11), 10 nights in Sri Lanka from 5 March 2027, Kandy, Ella and the south coast, around USD 4,000 for hotels, breakfast included.” The title and customer from the form below are used.">
            <Textarea id="enquiry" rows={6} value={enquiry} maxLength={8000} onChange={(e) => setEnquiry(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button onClick={submitEnquiry} loading={fromEnquiry.isPending} disabled={create.isPending}>
              <Sparkles /> Create trip and extract requirements
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center gap-3 text-xs font-medium text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> Or enter the requirements <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submitForm} noValidate className="flex flex-col gap-6">
        {topError ? <Alert tone="danger">{topError}</Alert> : null}
        <TripFormFields value={form} onChange={setForm} errors={errors} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link href="/trips">Cancel</Link>
          </Button>
          <Button type="submit" loading={create.isPending} disabled={fromEnquiry.isPending}>
            Create trip request
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewTripPage() {
  return (
    <React.Suspense fallback={<LoadingBlock label="Loading form" />}>
      <NewTripInner />
    </React.Suspense>
  );
}
