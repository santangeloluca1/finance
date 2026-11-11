import Link from "next/link";

/** Indirizzo inesistente (o titolo non più in portafoglio). */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-full rounded-[16px] bg-panel px-4 py-8">
        <p className="num text-[40px] font-bold leading-none tracking-[-0.03em] text-faint">404</p>
        <h1 className="mt-3 text-[22px] font-bold tracking-[-0.025em]">Pagina non trovata</h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-snug text-mut">L&apos;indirizzo non corrisponde a nessuna schermata di Basis.</p>
        <Link href="/" className="press mt-6 inline-block rounded-full bg-accent px-6 py-2.5 text-[16px] font-semibold text-accent-ink">
          Torna alla Home
        </Link>
      </div>
    </div>
  );
}
