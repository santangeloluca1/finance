import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";

/** Rimando al consulente da altre pagine (Salute, Fisco, scheda titolo). */
export function AdvisorCard({ href, title, subtitle, className = "" }: { href: string; title: string; subtitle: string; className?: string }) {
  return (
    <Link href={href} className={`press mx-4 flex min-h-[68px] items-center gap-3.5 rounded-[18px] bg-accent/10 px-4 py-3 ${className}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
        <Sparkles size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold">{title}</span>
        <span className="block text-[13px] leading-snug text-mut">{subtitle}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-accent" />
    </Link>
  );
}
