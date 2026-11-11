"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Errore in una pagina: il resto dell'app (barra in basso, dati) resta in piedi.
 * I dati sono sul dispositivo e nell'account: da Impostazioni → Dati si possono
 * esportare o ripristinare una versione precedente.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-full rounded-[16px] bg-panel px-4 py-8">
        <AlertTriangle size={32} className="mx-auto text-warn" />
        <h1 className="mt-3 text-[22px] font-bold tracking-[-0.025em]">Qualcosa è andato storto</h1>
        <p className="mx-auto mt-2 max-w-sm break-words text-[13px] leading-snug text-mut">
          {error.message || "Errore imprevisto."}
          {error.digest ? ` (codice ${error.digest})` : ""}
        </p>
        <button type="button" onClick={reset} className="press mt-6 rounded-full bg-accent px-6 py-2.5 text-[16px] font-semibold text-accent-ink">
          Riprova
        </button>
        <p className="mt-4 text-[14px]">
          <Link href="/impostazioni/dati" className="text-accent">
            Impostazioni → Dati e backup
          </Link>
        </p>
      </div>
    </div>
  );
}
