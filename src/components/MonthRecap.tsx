"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, X } from "lucide-react";
import { COVER, MONTHS, MonthStory } from "@/components/MonthStory";
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
  const rank = wrap.rank ? (wrap.rank.pos === 1 ? `il mese migliore del ${key.slice(0, 4)}` : `${wrap.rank.pos}° mese su ${wrap.rank.of}`) : null;
  return (
    <>
      {/* Anteprima del racconto: stesso sfondo della copertina e le barre delle storie. */}
      <div className="relative mx-4 mb-2 mt-6 overflow-hidden rounded-[22px] text-white" style={{ background: COVER }}>
        <button onClick={() => setOpen(true)} className="block w-full px-5 pb-5 pt-4 text-left active:opacity-90">
          <span className="flex gap-1 pr-12" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className={`h-[3px] flex-1 rounded-full ${i === 0 ? "bg-white" : "bg-white/30"}`} />
            ))}
          </span>
          <span className="mt-4 block text-[13px] font-semibold uppercase tracking-[0.14em] text-white/70">Il tuo {month}</span>
          <span className="num sensitive mt-1 block text-[46px] font-extrabold leading-none tracking-[-0.04em]">{fmtSignedPct(wrap.ret)}</span>
          <span className="num sensitive mt-2 block text-[15px] text-white/80">
            {fmtSignedEur(wrap.gain)}
            {rank ? ` · ${rank}` : ""}
          </span>
          <span className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white pl-3.5 pr-4 text-[15px] font-bold text-[#1e1145]">
            <Play size={14} fill="currentColor" strokeWidth={0} /> Guarda il riepilogo
          </span>
        </button>
        {/* Decorazione: tre barre grandi, tagliate dal bordo. */}
        <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute -bottom-4 -right-3 h-[120px] w-[120px]">
          <rect x="14" y="52" width="18" height="48" rx="5" fill="rgb(255 255 255 / 0.14)" className="grow-y" />
          <rect x="41" y="24" width="18" height="76" rx="5" fill="rgb(255 255 255 / 0.32)" className="grow-y" style={{ animationDelay: "80ms" }} />
          <rect x="68" y="40" width="18" height="60" rx="5" fill="rgb(255 255 255 / 0.14)" className="grow-y" style={{ animationDelay: "160ms" }} />
        </svg>
        <button
          aria-label="Chiudi il riepilogo del mese"
          onClick={() => dismissAlert(id)}
          className="hit absolute right-1.5 top-1.5 flex h-10 w-10 items-center justify-center text-white/80 active:opacity-50"
        >
          <X size={19} />
        </button>
      </div>
      {open && <MonthStory wrap={wrap} bench={bench} instruments={data.instruments} onClose={close} />}
    </>
  );
}
