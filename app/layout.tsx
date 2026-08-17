import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Navigation } from "@/components/Navigation";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Lunch Match",
  description: "Finde jemanden für eine gemeinsame Mittagspause in deiner Nähe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Providers>
          <Navigation />
          {children}
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
