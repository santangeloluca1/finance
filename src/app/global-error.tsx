"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Errore nel layout principale: sostituisce tutta la pagina, quindi porta con sé
 * html e body. Niente componenti dell'app (potrebbero essere loro la causa):
 * solo i colori del tema e un link normale verso Dati e backup.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <html lang="it">
      <body className="bg-bg text-ink">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
          <div className="w-full rounded-[16px] bg-panel px-4 py-8">
            <h1 className="text-[22px] font-bold tracking-[-0.025em]">Qualcosa è andato storto</h1>
            <p className="mx-auto mt-2 max-w-sm break-words text-[13px] leading-snug text-mut">
              {error.message || "Errore imprevisto."}
              {error.digest ? ` (codice ${error.digest})` : ""}
            </p>
            <button type="button" onClick={reset} className="mt-6 rounded-full bg-accent px-6 py-2.5 text-[16px] font-semibold text-accent-ink">
              Riprova
            </button>
            <p className="mt-4 text-[14px]">
              {/* <a> e non <Link>: il router potrebbe essere proprio la parte rotta. */}
              <a href="/impostazioni/dati" className="text-accent">
                Impostazioni → Dati e backup
              </a>
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
