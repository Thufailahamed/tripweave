"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Hotel, Lock } from "lucide-react";
import { ErrorState, LoadingBlock, PageHeader, StatusBadge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { ApiError, apiGet } from "@/lib/api";
import { useCan } from "@/lib/session";
import { AccessBadge } from "@/features/hotels/hotel-card";
import { CATEGORY_LABEL } from "@/features/hotels/lib";
import { OverviewTab } from "@/features/hotels/overview-tab";
import { RoomsTab } from "@/features/hotels/rooms-tab";
import { ImagesTab } from "@/features/hotels/images-tab";
import { RatesTab } from "@/features/hotels/rates-tab";
import { InventoryTab } from "@/features/hotels/inventory-tab";
import type { HotelDetail } from "@/features/hotels/types";

const TABS = ["overview", "rooms", "images", "rates", "inventory"] as const;

function HotelDetailView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const can = useCan();
  const initial = params.get("tab");
  const [tab, setTab] = React.useState<string>(TABS.includes(initial as (typeof TABS)[number]) ? (initial as string) : "overview");
  const q = useQuery({ queryKey: ["hotel", id], queryFn: () => apiGet<HotelDetail>(`/hotels/${id}`), enabled: !!id, retry: (n, e) => !(e instanceof ApiError && [403, 404].includes(e.status)) && n < 2 });

  if (q.isLoading) return <LoadingBlock label="Loading hotel" />;
  if (q.error) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex flex-col gap-4">
        <ErrorState error={q.error} onRetry={notFound ? undefined : () => q.refetch()} title={notFound ? "Hotel not found" : "Could not load this hotel"} />
        <div>
          <Button asChild variant="outline">
            <Link href="/hotels">
              <ArrowLeft /> Back to catalogue
            </Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!q.data) return null;
  const { property, images, rooms, ratePlans, canEdit } = q.data;
  const canEditHotel = canEdit && can("hotels:write");
  const canEditInventory = canEdit && can("inventory:write");

  return (
    <div>
      <PageHeader
        eyebrow={`${CATEGORY_LABEL[property.category] ?? property.category} · ${property.city}`}
        title={property.name}
        icon={Hotel}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <AccessBadge access={property.access} />
            <StatusBadge status={property.status} />
            {!canEdit ? (
              <span className="inline-flex items-center gap-1 text-xs">
                <Lock className="size-3" aria-hidden /> Read-only
              </span>
            ) : null}
          </span>
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/hotels">
              <ArrowLeft /> Catalogue
            </Link>
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Hotel sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="rooms">Rooms ({rooms.length})</TabsTrigger>
          <TabsTrigger value="images">Images ({images.length})</TabsTrigger>
          <TabsTrigger value="rates">Rates</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab property={property} ratePlans={ratePlans} canEdit={canEditHotel} />
        </TabsContent>
        <TabsContent value="rooms">
          <RoomsTab propertyId={property.id} rooms={rooms} canEdit={canEditHotel} />
        </TabsContent>
        <TabsContent value="images">
          <ImagesTab propertyId={property.id} images={images} canEdit={canEditHotel} />
        </TabsContent>
        <TabsContent value="rates">
          <RatesTab propertyId={property.id} rooms={rooms} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="inventory">
          <InventoryTab propertyId={property.id} rooms={rooms} canEdit={canEditInventory} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function HotelDetailPage() {
  return (
    <React.Suspense fallback={<LoadingBlock label="Loading hotel" />}>
      <HotelDetailView />
    </React.Suspense>
  );
}
