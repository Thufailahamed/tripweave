import { redirect } from "next/navigation";

/** Preserve the original admin deep links after the portal was split into sections. */
export default async function LegacyAdminOrganisationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/organizations/${id}`);
}
