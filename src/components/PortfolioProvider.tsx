"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  buildHistory,
  totals as computeTotals,
  valuePositions,
  type FxRates,
  type HistoryPoint,
  type PositionView,
  type Quotes,
  type Totals,
} from "@/lib/analytics";
import type { PortfolioState } from "@/lib/engine/types";
import { usePortfolio, useQuotes, type PortfolioData } from "@/lib/store";

interface Ctx {
  data: PortfolioData;
  state: PortfolioState | null;
  quotes: Quotes;
  fx: FxRates;
  views: PositionView[];
  totals: Totals | null;
  fetchedAt: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  history: HistoryPoint[] | null;
  priceSeries: Record<string, [string, number][]>;
}

const PortfolioContext = createContext<Ctx | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { data, state } = usePortfolio();
  const tickers = useMemo(() => {
    const open = new Set(state?.positions.filter((p) => p.quantity > 0).map((p) => p.isin));
    return data.instruments.filter((i) => open.has(i.isin)).map((i) => i.ticker);
  }, [data.instruments, state]);

  const { quotes, fx, fetchedAt, loading, error, refresh } = useQuotes(tickers);

  const views = useMemo(() => (state ? valuePositions(state, data.instruments, quotes, fx) : []), [state, data.instruments, quotes, fx]);
  const totals = useMemo(() => (state ? computeTotals(views, state) : null), [views, state]);

  const { history, priceSeries } = useHistory(data);

  return (
    <PortfolioContext.Provider
      value={{ data, state, quotes, fx, views, totals, fetchedAt, loading, error, refresh, history, priceSeries }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolioCtx() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolioCtx fuori da PortfolioProvider");
  return ctx;
}

function useHistory(data: PortfolioData) {
  const [series, setSeries] = useState<{ prices: Record<string, [string, number][]>; fx: Record<string, [string, number][]> } | null>(null);

  const request = useMemo(() => {
    const first = data.transactions.map((t) => t.date).sort()[0];
    if (!first) return null;
    const tickers = [...new Set(data.instruments.map((i) => i.ticker))].sort();
    const currencies = [...new Set(data.instruments.map((i) => i.currency).filter((c) => c !== "EUR"))].sort();
    return `/api/history?from=${first}&t=${encodeURIComponent(tickers.join(","))}&c=${currencies.join(",")}`;
  }, [data]);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    fetch(request)
      .then((r) => r.json())
      .then((j: { series: Record<string, [string, number][]>; fx: Record<string, [string, number][]> }) => {
        if (!cancelled) setSeries({ prices: j.series, fx: j.fx });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [request]);

  const history = useMemo(
    () => (series ? buildHistory(data.transactions, data.instruments, series.prices, series.fx) : null),
    [series, data],
  );
  return { history, priceSeries: series?.prices ?? {} };
}
