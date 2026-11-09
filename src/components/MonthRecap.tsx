"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { MONTHS, MonthStory } from "@/components/MonthStory";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { BENCHMARKS } from "@/lib/benchmarks";
import { fmtSignedEur, fmtSignedPct } from "@/lib/format";
import { priceOn } from "@/lib/recurring";
import { dismissAlert } from "@/lib/store";
import { monthEnd, monthWrap, previousMonth } from "@/lib/wrap";

/** La scheda resta visibile solo nei primi giorni del mese. */
const VISIBLE_DAYS = 7;
/** Eccezioni una tantum: il primo riepilogo (ottobre 2026) resta fino al 10 novembre. */
const EXTRA_DAYS: Record<string, number> = { "2026-10": 10 };
const BENCH = BENCHMARKS[0];

/**
 * Riquadro sotto il grafico di Analisi nella prima settimana del mese: com'è andato il
 * mese appena chiuso. Toccandolo si apre il racconto a schermate; con la X
 * sparisce per quel mese, su tutti i dispositivi.
 */
export function MonthRecap() {
  const { history, data, priceSeries, fxSeries } = usePortfolioView();
  const [open, setOpen] = useState(false);
  const [bench, setBench] = useState<{ label: string; ret: number } | null>(null);
  const now = new Date();
  const key = previousMonth(now);
  const id = `recap-${key}`;
  const dismissed = (data.alertsDismissed ?? []).includes(id);
  const visible = now.getDate() <= (EXTRA_DAYS[key] ?? VISIBLE_DAYS) && !dismissed;

  const wrap = useMemo(
    () => (visible && history?.length ? monthWrap(key, history, data.transactions, data.instruments, priceSeries, fxSeries) : null),
    [visible, history, key, data.transactions, data.instruments, priceSeries, fxSeries],
  );

  // Indice di confronto per lo stesso mese (chiusura del mese prima → chiusura del mese).
  useEffect(() => {
    if (!wrap) return;
    let stop = false;
    const [y, m] = key.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, -10)).toISOString().slice(0, 10);
    fetch(`/api/history?from=${from}&t=${BENCH.value}`)
      .then((r) => r.json())
      .then((j: { series: Record<string, [string, number][]> }) => {
        const s = j.series?.[BENCH.value];
        const a = priceOn(s, new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10)); // ultimo giorno del mese prima
        const b = priceOn(s, monthEnd(key));
        if (!stop && a && b) setBench({ label: BENCH.label, ret: b / a - 1 });
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [wrap, key]);

  const close = useCallback(() => setOpen(false), []);

  if (!wrap) return null;
  const month = MONTHS[Number(key.slice(5, 7)) - 1];
  const up = wrap.ret >= 0;
  return (
    <>
      <div className="relative mx-4 mb-2 mt-6 overflow-hidden rounded-[18px] bg-panel">
        <button onClick={() => setOpen(true)} className="flex min-h-[104px] w-full items-center gap-4 px-5 py-4 pr-24 text-left active:opacity-80">
          <div className="min-w-0">
            <p className="text-[17px] font-bold">{month.replace(/^./, (c) => c.toUpperCase())} in breve</p>
            <p className="mt-1 text-[15px] leading-snug text-mut">
              Il portafoglio ha fatto <span className={`num sensitive font-semibold ${up ? "text-up" : "text-dn"}`}>{fmtSignedPct(wrap.ret)}</span>,{" "}
              <span className="num sensitive">{fmtSignedEur(wrap.gain)}</span>.
            </p>
            <p className="mt-2 flex items-center gap-0.5 text-[15px] font-semibold text-accent">
              Guarda il tuo {month} <ChevronRight size={16} strokeWidth={2.6} />
            </p>
          </div>
        </button>
        {/* Decorazione: tre barre, in grande e tagliate dal bordo. */}
        <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute -bottom-3 -right-2 h-[96px] w-[96px]">
          <rect x="14" y="52" width="18" height="48" rx="5" fill="var(--chip)" className="grow-y" />
          <rect x="41" y="24" width="18" height="76" rx="5" fill={up ? "var(--up)" : "var(--dn)"} opacity="0.85" className="grow-y" style={{ animationDelay: "80ms" }} />
          <rect x="68" y="40" width="18" height="60" rx="5" fill="var(--chip)" className="grow-y" style={{ animationDelay: "160ms" }} />
        </svg>
        <button
          aria-label="Chiudi il riepilogo del mese"
          onClick={() => dismissAlert(id)}
          className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center text-mut active:opacity-50"
        >
          <X size={18} />
        </button>
      </div>
      {open && <MonthStory wrap={wrap} bench={bench} instruments={data.instruments} onClose={close} />}
    </>
  );
}
