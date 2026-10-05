import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const DESCRIPTION =
  "Monitors Indonesian public-company competitors and connects competitive activity with verified Sectors financial context — so teams see not just what changed, but why it may matter.";

export const metadata: Metadata = {
  // Set NEXT_PUBLIC_SITE_URL once deployed so social cards resolve absolutely.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "RivalPulse — AI competitive intelligence",
    template: "%s · RivalPulse",
  },
  description: DESCRIPTION,
  applicationName: "RivalPulse",
  openGraph: {
    type: "website",
    siteName: "RivalPulse",
    title: "RivalPulse — AI competitive intelligence",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "RivalPulse — AI competitive intelligence",
    description: DESCRIPTION,
  },
};

/**
 * The document shell only.
 *
 * Providers and the app chrome live in `(app)/layout.tsx`, so signed-out
 * routes like `/login` render without the sidebar — and without mounting the
 * store, which would otherwise fetch dashboard data for a visitor who has not
 * signed in yet.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full`}>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) add
          their own attributes to <body> before React hydrates. Ignoring
          attribute drift here is safe — React still owns all children. */}
      <body className="min-h-full" suppressHydrationWarning>{children}</body>
    </html>
  );
}
