"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Hotel } from "lucide-react";
import { toast } from "sonner";
import { Alert, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import { useCan } from "@/lib/session";
import { PropertyForm, type PropertyPayload } from "@/features/hotels/property-form";
import type { Property } from "@/features/hotels/types";

export default function NewHotelPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();

  if (!can("hotels:write"))
    return (
      <div>
        <PageHeader title="Add hotel" />
        <Alert tone="warning" title="You do not have permission to add hotels">
          Ask an organisation owner or manager for the hotels:write permission.
        </Alert>
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add hotel"
        icon={Hotel}
        description="Create a property you own. You can add room types, images, rates and inventory on the next screen."
        actions={
          <Button asChild variant="outline">
            <Link href="/hotels">
              <ArrowLeft /> Back to catalogue
            </Link>
          </Button>
        }
      />
      <PropertyForm
        mode="create"
        submitLabel="Create hotel"
        onCancel={() => router.push("/hotels")}
        onSubmit={async (payload: PropertyPayload) => {
          const created = await apiPost<Property>("/hotels", payload);
          await qc.invalidateQueries({ queryKey: ["hotels"] });
          toast.success(`${created.name} created`);
          router.push(`/hotels/${created.id}`);
        }}
      />
    </div>
  );
}
