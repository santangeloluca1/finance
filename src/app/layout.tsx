import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import { TabBar } from "@/components/TabBar";
import { BOOT_SCRIPT } from "@/lib/boot";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: "Basis",
  description: "I tuoi investimenti su Fineco, Isybank e Revolut, con il prezzo medio di carico all'italiana.",
  appleWebApp: { capable: true, title: "Basis", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f3f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={geist.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <PortfolioProvider>
          <main className="mx-auto max-w-xl pt-safe pb-tabbar">{children}</main>
          <TabBar />
        </PortfolioProvider>
      </body>
    </html>
  );
}
