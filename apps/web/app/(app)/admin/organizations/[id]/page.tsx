"use client";
import { useParams } from "next/navigation";
import { AdminOrganizationDetailView } from "@/features/admin/organization-detail";

export default function AdminOrganizationPage() {
  const params = useParams<{ id: string }>();
  return params?.id ? <AdminOrganizationDetailView id={params.id} /> : null;
}
