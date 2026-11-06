"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push-client";

/** Contenitore delle pagine: la schermata di accesso occupa tutto lo schermo, senza barra in basso. */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // Service worker per le notifiche push (anche ad app chiusa).
  useEffect(() => registerServiceWorker(), []);
  if (path.startsWith("/accedi")) return <main>{children}</main>;
  return <main className="mx-auto max-w-xl pt-safe pb-tabbar">{children}</main>;
}
