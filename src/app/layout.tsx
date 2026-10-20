import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Legacy font. The variable font covers weights 200-900; 950 (used by the legacy CSS) renders as 900.
const sourceSans = Source_Sans_3({ subsets: ["latin", "latin-ext"], variable: "--font-source-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Chusetts Gestión",
  description: "Gestión del bar",
  icons: { icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🍺</text></svg>" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={sourceSans.variable}>
      <body>{children}</body>
    </html>
  );
}
