import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ASSISTANT } from "@/components/advisor/Orb";

/** Messaggio quando il servizio non è configurato: i dettagli tecnici stanno in Impostazioni → Informazioni. */
export const NOT_ACTIVE = `${ASSISTANT} non è ancora attivo.`;

/** Collegamento alla spiegazione su come si attiva. */
export function HowToActivate({ className = "" }: { className?: string }) {
  return (
    <Link href="/impostazioni/info#basis-ai" className={`flex min-h-[44px] w-fit items-center gap-0.5 text-[15px] font-semibold text-accent active:opacity-50 ${className}`}>
      Come si attiva <ChevronRight size={17} />
    </Link>
  );
}
