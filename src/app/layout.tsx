import type { Metadata, Viewport } from "next";

import "./globals.css";

const SITE_URL = "https://typewriter-lettra.vercel.app";
const DESCRIPTION =
  "A sheet, a platen and a keyboard. The carriage never goes back and nothing is erased.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Typewriter",
  description: DESCRIPTION,
  // The images themselves come from opengraph-image.jpg and twitter-image.jpg
  // in this folder; Next wires them in by file name.
  openGraph: {
    title: "Typewriter",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Typewriter",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Typewriter",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#17150f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
