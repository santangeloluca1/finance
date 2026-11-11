"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartLine, ChartPie, House, Landmark, Sparkles } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", icon: House },
  // Movimenti si apre dall'intestazione di Titoli: la scheda resta accesa anche lì.
  { href: "/posizioni", label: "Titoli", icon: ChartPie, also: ["/movimenti"] },
  { href: "/analisi", label: "Analisi", icon: ChartLine },
  { href: "/fisco", label: "Fisco", icon: Landmark },
  { href: "/consulente", label: "Basis AI", icon: Sparkles },
];

export function TabBar() {
  const path = usePathname();
  // Niente barra sulla schermata di accesso, mentre si compila un movimento (si esce con "Annulla") e nella chat.
  if (path.startsWith("/accedi") || path.startsWith("/movimenti/nuovo") || path.startsWith("/consulente/chat")) return null;
  return (
    <nav
      aria-label="Sezioni"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sep bg-panel/80 backdrop-blur-xl backdrop-saturate-150"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map(({ href, label, icon: Icon, also }) => {
          const active =
            href === "/" ? path === "/" || path.startsWith("/impostazioni") : [href, ...(also ?? [])].some((h) => path.startsWith(h));
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
