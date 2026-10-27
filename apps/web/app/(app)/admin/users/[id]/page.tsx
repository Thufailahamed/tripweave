"use client";
import { useParams } from "next/navigation";
import { AdminUserDetailView } from "@/features/admin/user-detail";

export default function AdminUserPage() {
  const params = useParams<{ id: string }>();
  return params?.id ? <AdminUserDetailView id={params.id} /> : null;
}
