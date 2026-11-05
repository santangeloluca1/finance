import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import { TabBar } from "@/components/TabBar";

export const metadata: Metadata = {
  title: "Portafoglio",
  description: "Il tuo portafoglio Fineco, Isybank e Revolut in un unico posto, con il prezzo medio all'italiana.",
  appleWebApp: { capable: true, title: "Portafoglio", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#06080c" },
    { media: "(prefers-color-scheme: light)", color: "#f3f4f8" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <PortfolioProvider>
          <main className="mx-auto max-w-xl px-4 pt-safe pb-tabbar">{children}</main>
          <TabBar />
        </PortfolioProvider>
      </body>
    </html>
  );
}
