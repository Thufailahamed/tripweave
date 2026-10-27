"use client";
import * as React from "react";
import Link from "next/link";
import { Alert, LoadingBlock } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";

/** Renders children only for platform admins; everyone else sees a notice. The API enforces this independently. */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  if (!session) return <LoadingBlock label="Checking access" />;
  if (!session.user.platformAdmin) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Alert tone="warning" title="Platform administrators only">
          This area is restricted to TripWeave platform staff. If you manage an organisation, your settings are under Settings.
        </Alert>
        <div className="mt-4">
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  organizationType: "tour_operator" | "hotel_management";
  status: string;
  defaultCurrency: string;
  timezone: string;
  country: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}
