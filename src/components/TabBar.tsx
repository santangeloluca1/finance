"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, ChartLine, ChartPie, House, Landmark } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/posizioni", label: "Titoli", icon: ChartPie },
  { href: "/analisi", label: "Analisi", icon: ChartLine },
  { href: "/fisco", label: "Fisco", icon: Landmark },
  { href: "/movimenti", label: "Movimenti", icon: ArrowLeftRight },
];

export function TabBar() {
  const path = usePathname();
  // Niente barra sulla schermata di accesso e mentre si compila un movimento (si esce con "Annulla").
  if (path.startsWith("/accedi") || path.startsWith("/movimenti/nuovo")) return null;
  return (
    <nav
      aria-label="Sezioni"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sep bg-panel/80 backdrop-blur-xl backdrop-saturate-150"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" || path === "/impostazioni" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pb-1 pt-2 text-[11px] font-medium ${active ? "text-accent" : "text-faint"}`}
              >
                <Icon size={24} strokeWidth={active ? 2.2 : 1.7} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
