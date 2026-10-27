import type { Metadata } from "next";

/**
 * Public client proposal. It lives outside the authenticated app group (no shell, no session calls),
 * is never indexed, and does not leak the secret link through the Referer header.
 */
export const metadata: Metadata = {
  title: "Your travel proposal",
  description: "A private travel proposal prepared for you.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  referrer: "no-referrer",
};

export default function PublicQuoteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
