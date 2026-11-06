"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push-client";
import { trackPath } from "@/components/ui";

/** Contenitore delle pagine: la schermata di accesso occupa tutto lo schermo, senza barra in basso. */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // Service worker per le notifiche push (anche ad app chiusa).
  useEffect(() => registerServiceWorker(), []);
  // Pagina precedente per i pulsanti "indietro".
  trackPath(path);
  if (path.startsWith("/accedi")) return <main>{children}</main>;
  const noBar = path.startsWith("/movimenti/nuovo");
  return (
    <main className={`mx-auto max-w-xl pt-safe ${noBar ? "pb-[calc(env(safe-area-inset-bottom)+24px)]" : "pb-tabbar"}`}>
      <div key={path} className="page-in">
        {children}
      </div>
    </main>
  );
}
