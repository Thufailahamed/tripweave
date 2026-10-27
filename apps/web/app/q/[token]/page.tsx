import { PublicProposal } from "@/features/quotes/public-proposal";

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicProposal token={token} />;
}
