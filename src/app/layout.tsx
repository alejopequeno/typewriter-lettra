import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Máquina de escribir",
  description:
    "Una hoja, un rodillo y un teclado. El carro no vuelve atrás y nada se borra.",
};

export const viewport: Viewport = {
  themeColor: "#17150f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
