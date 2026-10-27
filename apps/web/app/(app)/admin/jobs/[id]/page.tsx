"use client";
import { useParams } from "next/navigation";
import { AdminJobDetailView } from "@/features/admin/job-detail";

export default function AdminJobPage() {
  const params = useParams<{ id: string }>();
  return params?.id ? <AdminJobDetailView id={params.id} /> : null;
}
