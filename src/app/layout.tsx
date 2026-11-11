import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import { TabBar } from "@/components/TabBar";
import { Shell } from "@/components/Shell";
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
        {/* Logo all'apertura: si compone (barre, poi la linea verde) e si dissolve. Solo CSS, nessuna attesa. */}
        <div className="splash" aria-hidden>
          <svg viewBox="0 0 180 180">
            <rect width="180" height="180" rx="40" fill="#000" />
            <rect className="bar" x="40" y="98" width="25" height="44" rx="7" fill="#3c3f47" />
            <rect className="bar" x="77.5" y="52" width="25" height="90" rx="7" fill="#f5f6f8" />
            <rect className="bar" x="115" y="76" width="25" height="66" rx="7" fill="#3c3f47" />
            <line className="trend" pathLength={1} x1="30" y1="86" x2="150" y2="86" stroke="#3bd98a" strokeWidth="7" strokeLinecap="round" />
          </svg>
        </div>
        <PortfolioProvider>
          <Shell>{children}</Shell>
          <TabBar />
        </PortfolioProvider>
      </body>
    </html>
  );
}
