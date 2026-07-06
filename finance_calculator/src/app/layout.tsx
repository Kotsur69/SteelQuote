import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Kalkulator Dopłat do Stali",
  description: "Steel Surcharge Calculator - pricing tool for steel products",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
