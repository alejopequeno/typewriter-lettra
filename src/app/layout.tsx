import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Typewriter",
  description:
    "A sheet, a platen and a keyboard. The carriage never goes back and nothing is erased.",
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
