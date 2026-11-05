"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Home, Landmark, Layers } from "lucide-react";

const TABS = [
  { href: "/", label: "Panoramica", icon: Home },
  { href: "/posizioni", label: "Posizioni", icon: Layers },
  { href: "/fisco", label: "Fisco", icon: Landmark },
  { href: "/movimenti", label: "Movimenti", icon: ArrowLeftRight },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/75 backdrop-blur-xl backdrop-saturate-150"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4 px-2 pt-2">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors ${
                  active ? "text-accent" : "text-faint hover:text-muted"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.3 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
