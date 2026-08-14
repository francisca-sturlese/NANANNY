import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3100";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NaNanny UAE. Find the right nanny for your family",
    template: "%s · NaNanny UAE",
  },
  description:
    "Connect directly with nannies across the UAE. Browse profiles for free, contact your first 3 nannies at no cost, and hire on your own terms.",
  applicationName: "NaNanny UAE",
  openGraph: {
    title: "NaNanny UAE. Find the right nanny for your family",
    description: "Connect directly with nannies across the UAE. Your first contacts are free.",
    siteName: "NaNanny UAE",
    locale: "en_AE",
    type: "website",
    url: siteUrl,
    // Built once by scripts/make-og-image.mjs rather than rendered per request:
    // it never changes, and next/og would put a font shaper and an SVG renderer
    // in a server bundle that has a hard size ceiling.
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "NaNanny UAE. Find the right nanny for your family.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NaNanny UAE. Find the right nanny for your family",
    description: "Connect directly with nannies across the UAE. Your first contacts are free.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
