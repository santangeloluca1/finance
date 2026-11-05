"use client";

import { usePathname } from "next/navigation";

/** Contenitore delle pagine: la schermata di accesso occupa tutto lo schermo, senza barra in basso. */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/accedi")) return <main>{children}</main>;
  return <main className="mx-auto max-w-xl pt-safe pb-tabbar">{children}</main>;
}
