"use client";

import { useEffect, useMemo, useState } from "react";
import type { FxRates, PositionView } from "./analytics";
import { portfolioIntraday, type IntradaySeries, type PortfolioIntraday } from "./intraday";

const REFRESH_MS = 5 * 60_000;

/** Serie intraday dei titoli indicati (aggiornata ogni 5 minuti finché serve). */
export function useIntradaySeries(entries: string[], enabled: boolean) {
  const key = [...new Set(entries)].sort().join(",");
  const [state, setState] = useState<{ key: string; series: Record<string, IntradaySeries> } | null>(null);
  useEffect(() => {
    if (!enabled || !key) return;
    let stop = false;
    const load = () =>
      fetch(`/api/intraday?batch=1&t=${encodeURIComponent(key)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { series?: Record<string, IntradaySeries> }) => !stop && setState({ key, series: j.series ?? {} }))
        .catch(() => !stop && setState((s) => (s?.key === key ? s : { key, series: {} })));
    void load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [key, enabled]);
  return state?.key === key ? state.series : null;
}

/** Andamento di oggi del portafoglio (solo investimenti). null finché carica. */
export function usePortfolioIntraday(views: PositionView[], fx: FxRates, enabled: boolean): PortfolioIntraday | null {
  const entries = useMemo(() => views.map((v) => (v.instrument.currency === "EUR" ? `${v.instrument.ticker}~${v.instrument.isin}` : v.instrument.ticker)), [views]);
  const series = useIntradaySeries(entries, enabled && entries.length > 0);
  return useMemo(() => (series ? portfolioIntraday(views, series, fx) : null), [series, views, fx]);
}
