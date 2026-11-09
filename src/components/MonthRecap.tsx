"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { fmtSignedEur, fmtSignedPct } from "@/lib/format";
import { monthlyReturns, twrSeries } from "@/lib/performance";

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/**
 * Riquadro in cima (come il "rewind" di getquin): com'è andato il mese appena
 * chiuso. Si chiude con la X e ricompare il mese dopo.
 */
export function MonthRecap() {
  const { history, totals, state } = usePortfolioView();
  const [hidden, setHidden] = useState(true);
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const key = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}`;
  const storeKey = `portafoglio:recap:${key}`;
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(storeKey) === "off");
    } catch {
      setHidden(false);
    }
  }, [storeKey]);

  const recap = useMemo(() => {
    if (!history?.length || !totals || !state) return null;
    const inMonth = history.filter((h) => h.date.startsWith(key));
    const before = history.filter((h) => h.date < `${key}-01`).at(-1);
    if (!inMonth.length || !before) return null;
    const ret = monthlyReturns(twrSeries(history.map((h) => ({ ...h, value: h.value - (h.cash ?? 0) }))))[key];
    if (ret === undefined) return null;
    return { ret, gain: inMonth[inMonth.length - 1].gain - before.gain };
  }, [history, totals, state, key]);

  if (hidden || !recap) return null;
  const up = recap.ret >= 0;
  return (
    <div className="relative mx-4 mb-2 mt-4 overflow-hidden rounded-[18px] bg-panel">
      <div className="flex min-h-[104px] items-center gap-4 px-5 py-4 pr-24">
        <div className="min-w-0">
          <p className="text-[17px] font-bold">{MONTHS[last.getMonth()].replace(/^./, (c) => c.toUpperCase())} in breve</p>
          <p className="mt-1 text-[15px] leading-snug text-mut">
            Il portafoglio ha fatto <span className={`num sensitive font-semibold ${up ? "text-up" : "text-dn"}`}>{fmtSignedPct(recap.ret)}</span>,{" "}
            <span className="num sensitive">{fmtSignedEur(recap.gain)}</span>.
          </p>
        </div>
      </div>
      {/* Decorazione: tre barre e la linea del logo, in grande e tagliate dal bordo. */}
      <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute -bottom-3 -right-2 h-[96px] w-[96px]">
        <rect x="14" y="52" width="18" height="48" rx="5" fill="var(--chip)" className="grow-y" />
        <rect x="41" y="24" width="18" height="76" rx="5" fill={up ? "var(--up)" : "var(--dn)"} opacity="0.85" className="grow-y" style={{ animationDelay: "80ms" }} />
        <rect x="68" y="40" width="18" height="60" rx="5" fill="var(--chip)" className="grow-y" style={{ animationDelay: "160ms" }} />
      </svg>
      <button
        aria-label="Chiudi il riepilogo del mese"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(storeKey, "off");
          } catch {}
        }}
        className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center text-mut active:opacity-50"
      >
        <X size={18} />
      </button>
    </div>
  );
}
