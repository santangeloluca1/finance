"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Logo, SectionHeader } from "@/components/ui";
import { exchangeName, fmtPrice, fmtSignedPct } from "@/lib/format";
import { REFRESH_MS, type WatchItem } from "@/lib/store";

type Q = { price: number; previousClose: number; currency: string };

/** Indirizzo della scheda di un titolo osservato. */
export function watchHref(w: WatchItem) {
  const q = new URLSearchParams({ t: w.ticker, n: w.name, c: w.currency, k: w.type ?? "" });
  return `/posizioni/${encodeURIComponent(w.isin ?? w.ticker)}?${q}`;
}

/** Lista "Osservati": prezzo e variazione di oggi, aggiornati ogni 5 minuti. */
export function Watchlist({ items }: { items: WatchItem[] }) {
  const [quotes, setQuotes] = useState<Record<string, Q>>({});
  const key = items
    .map((w) => (w.currency === "EUR" && w.isin ? `${w.ticker}~${w.isin}` : w.ticker))
    .sort()
    .join(",");
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const load = () =>
      fetch(`/api/quotes?t=${encodeURIComponent(key)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { quotes: Record<string, Q> }) => !stop && setQuotes(j.quotes ?? {}))
        .catch(() => {});
    void load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [key]);

  if (!items.length) return null;
  return (
    <>
      <SectionHeader>Osservati</SectionHeader>
      <ul className="stagger">
        {items.map((w) => {
          const q = quotes[w.ticker];
          const ch = q?.previousClose ? q.price / q.previousClose - 1 : null;
          return (
            <li key={w.ticker}>
              <Link href={watchHref(w)} className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5 active:bg-panel-2">
                <Logo isin={w.isin ?? w.ticker} name={w.name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-semibold">{w.name}</p>
                  <p className="num flex items-center gap-1 truncate text-[14px] text-mut">
                    <Star size={11} className="shrink-0 fill-warn text-warn" />
                    {w.ticker.split(".")[0]} · {exchangeName(w.ticker)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {q ? (
                    <>
                      <p className="num text-[17px] font-medium">{fmtPrice(q.price, q.currency)}</p>
                      {ch !== null && <p className={`num text-[14px] font-medium ${ch > 0.00005 ? "text-up" : ch < -0.00005 ? "text-dn" : "text-mut"}`}>{fmtSignedPct(ch)}</p>}
                    </>
                  ) : (
                    <span className="flex flex-col items-end gap-1.5">
                      <span className="skeleton h-4 w-16" />
                      <span className="skeleton h-3 w-10" />
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
