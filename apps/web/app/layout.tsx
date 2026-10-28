import type { Metadata, Viewport } from "next";
import { Caveat, Inter, Instrument_Serif, Plus_Jakarta_Sans, Unbounded } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta", display: "swap" });
// Generated planning interfaces read like a printed travel journal: a high-contrast serif for display
// type and a handwritten face for the assistant's asides. Both are self-hosted by next/font.
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-caveat", display: "swap" });
// Wide geometric display face for the marketing site's uppercase headlines.
const unbounded = Unbounded({ subsets: ["latin"], weight: "variable", variable: "--font-unbounded", display: "swap" });

export const metadata: Metadata = {
  title: { default: "TripWeave – Tour planning & quotation platform", template: "%s · TripWeave" },
  description: "Turn one tourist enquiry into several optimised, commercially accurate, client-ready accommodation packages in minutes.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#091b20" };

// Guarded so a second execution (React re-rendering <head>) cannot mistake this visit for a repeat one.
// App routes get their saved theme (default light) before first paint, so there is no dark flash.
const BOOT = `if(!window.__twBoot){window.__twBoot=1;document.documentElement.classList.add("js");try{if(/^\\/(dashboard|trips|quotes|customers|hotels|hotel-workspace|reports|settings|admin)(\\/|$)/.test(location.pathname))document.documentElement.dataset.theme=localStorage.getItem("tw.theme")==="dark"?"dark":"light";if(location.pathname==="/"){if(sessionStorage.getItem("tw.intro"))document.documentElement.dataset.introSeen="1";else sessionStorage.setItem("tw.intro","1")}}catch(e){}}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} ${jakarta.variable} ${instrument.variable} ${caveat.variable} ${unbounded.variable}`} suppressHydrationWarning>
      <body>
        {/* Enables reveal-on-scroll hidden states (content stays visible without JS) and plays the landing intro once per session. */}
        <Script id="tw-boot" strategy="beforeInteractive">
          {BOOT}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
