import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Orb } from "./Orb";

/** Rimando al consulente da altre pagine (Salute, Fisco, scheda titolo). */
export function AdvisorCard({ href, title, subtitle, className = "" }: { href: string; title: string; subtitle: string; className?: string }) {
  return (
    <Link href={href} className={`press mx-4 flex min-h-[68px] items-center gap-3.5 rounded-[18px] bg-panel px-4 py-3 ${className}`}>
      <Orb size={40} />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold">{title}</span>
        <span className="block text-[13px] leading-snug text-mut">{subtitle}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink-2" />
    </Link>
  );
}
