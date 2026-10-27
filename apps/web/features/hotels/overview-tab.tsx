"use client";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet, apiPatch } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/utils";
import { AmenityChips, ReviewScore } from "./hotel-card";
import { CATEGORY_LABEL } from "./lib";
import { PropertyForm, type PropertyPayload } from "./property-form";
import type { PartnerShare, Property, RatePlan } from "./types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = { manual: "Entered manually by the owner", provider: "Imported from a supplier provider", seed: "Platform catalogue", mock: "Illustrative demo data" };

export function OverviewTab({ property, ratePlans, canEdit }: { property: Property; ratePlans: RatePlan[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const shared = property.access === "shared";
  const received = useQuery({ queryKey: ["partners", "received"], queryFn: () => apiGet<PartnerShare[]>("/partners/received"), enabled: shared, staleTime: 60_000 });
  const sharesForThis = (received.data ?? []).filter((s) => (s.resourceType === "property" && s.resourceId === property.id) || (s.resourceType === "rate_plan" && ratePlans.some((p) => p.id === s.resourceId)));
  const sharers = [...new Set(sharesForThis.map((s) => s.sourceOrganizationName).filter(Boolean))];

  if (editing && canEdit)
    return (
      <PropertyForm
        mode="edit"
        initial={property}
        submitLabel="Save changes"
        onCancel={() => setEditing(false)}
        onSubmit={async (payload: PropertyPayload) => {
          await apiPatch(`/hotels/${property.id}`, payload);
          await Promise.all([qc.invalidateQueries({ queryKey: ["hotel", property.id] }), qc.invalidateQueries({ queryKey: ["hotels"] })]);
          toast.success("Hotel updated");
          setEditing(false);
        }}
      />
    );

  return (
    <div className="flex flex-col gap-5">
      {shared ? (
        <Alert tone="info" title="Shared by a partner: read-only">
          {sharers.length > 0 ? `${sharers.join(", ")} shared this property with you.` : received.isLoading ? "Checking who shared this property…" : "A partner organisation shared this property with you."} You can view what they shared but not change it.
        </Alert>
      ) : null}
      {property.access === "provider" ? <Alert tone="info" title="Provider listing: read-only">This property comes from a supplier catalogue and cannot be edited here.</Alert> : null}

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Property details</CardTitle>
            <CardDescription>{property.description || "No description yet."}</CardDescription>
          </div>
          {canEdit ? (
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit details
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Category">{CATEGORY_LABEL[property.category] ?? property.category}</Row>
            <Row label="Star classification">{property.starClassification ? `${property.starClassification}-star` : "Not classified"}</Row>
            <Row label="Review score">
              <ReviewScore score={property.reviewScore} />
              {property.reviewScore !== null ? <span className="block text-xs text-muted-foreground">Supplied by the owning organisation{property.reviewSource && property.reviewSource !== "organisation_supplied" ? ` (${property.reviewSource})` : ""}; not verified by TripWeave.</span> : null}
            </Row>
            <Row label="Location">
              {[property.address, property.city, property.region, property.country].filter(Boolean).join(", ")}
            </Row>
            <Row label="Coordinates">{property.latitude !== null && property.longitude !== null ? `${property.latitude}, ${property.longitude}` : "Not set"}</Row>
            <Row label="Check-in / check-out">
              {property.checkInTime} / {property.checkOutTime}
            </Row>
            <Row label="Contact">
              {[property.contact.email, property.contact.phone, property.contact.website].filter(Boolean).join(" · ") || "Not provided"}
            </Row>
            <Row label="Preferred partner">{property.preferredPartner ? "Yes" : "No"}</Row>
            <Row label="Status">{property.status}</Row>
          </dl>
          <div className="mt-4">
            <p className="mb-1.5 text-xs text-muted-foreground">Amenities</p>
            <AmenityChips amenities={property.amenities} max={60} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provenance</CardTitle>
          <CardDescription>Where this record comes from and when it last changed.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Row label="Source">{SOURCE_LABEL[property.source] ?? property.source}</Row>
            <Row label="Ownership">{property.access === "owner" ? "Owned by your organisation" : property.access === "shared" ? "Owned by a partner" : "Provider catalogue"}</Row>
            <Row label="Created">{formatDate(property.createdAt)}</Row>
            <Row label="Last updated">{formatDateTime(property.updatedAt)}</Row>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
