import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell } from "@/components/shell/AppShell";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full`}>
      {/* The shell owns scrolling, so the document itself never scrolls. */}
      <body className="h-full overflow-hidden">
        <ToastProvider>
          <StoreProvider>
            <AppShell>{children}</AppShell>
          </StoreProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
