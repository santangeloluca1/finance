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
import { buildPortfolio } from "@/lib/engine/portfolio";
import type { AssetClass, PortfolioState } from "@/lib/engine/types";
import { usePortfolio, useQuotes, type PortfolioData } from "@/lib/store";
import { usePathname } from "next/navigation";

type Series = Record<string, [string, number][]>;

interface Ctx {
  data: PortfolioData;
  state: PortfolioState | null;
  quotes: Quotes;
  fx: FxRates;
  fetchedAt: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  priceSeries: Series;
  fxSeries: Series;
  historyReady: boolean;
}

const PortfolioContext = createContext<Ctx | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { data, state } = usePortfolio();
  const onLogin = usePathname().startsWith("/accedi");
  const tickers = useMemo(() => {
    if (onLogin) return [];
    const open = new Set(state?.positions.filter((p) => p.quantity > 0).map((p) => p.isin));
    return data.instruments.filter((i) => open.has(i.isin)).map((i) => i.ticker);
  }, [data.instruments, state, onLogin]);

  const { quotes, fx, fetchedAt, loading, error, refresh } = useQuotes(tickers);
  const series = useHistorySeries(data, onLogin);

  return (
    <PortfolioContext.Provider
      value={{
        data,
        state,
        quotes,
        fx,
        fetchedAt,
        loading,
        error,
        refresh,
        priceSeries: series?.prices ?? {},
        fxSeries: series?.fx ?? {},
        historyReady: series !== null,
      }}
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

export interface Filter {
  account: string | "all";
  /** Asset class, "liquidita" per i soli saldi di cassa, "all" per tutto. */
  asset: AssetClass | "liquidita" | "all";
}

export const ALL: Filter = { account: "all", asset: "all" };

/**
 * Vista filtrata per banca e asset class: posizioni, totali e storico.
 * Il prezzo medio resta calcolato per singolo conto, quindi il filtro è esatto.
 */
export function usePortfolioView(filter: Filter = ALL) {
  const ctx = usePortfolioCtx();
  const { data, quotes, fx, priceSeries, fxSeries } = ctx;

  const txs = useMemo(() => {
    const assetOf = new Map(data.instruments.map((i) => [i.isin, i.assetClass]));
    return data.transactions.filter(
      (t) =>
        (filter.account === "all" || t.account === filter.account) &&
        (filter.asset === "all" || (filter.asset === "liquidita" ? t.type === "cash" : assetOf.get(t.isin) === filter.asset)),
    );
  }, [data, filter.account, filter.asset]);

  const state = useMemo(() => {
    if (filter.account === "all" && filter.asset === "all") return ctx.state;
    try {
      return buildPortfolio(txs, data.instruments);
    } catch {
      return null;
    }
  }, [txs, data.instruments, ctx.state, filter.account, filter.asset]);

  const views: PositionView[] = useMemo(() => (state ? valuePositions(state, data.instruments, quotes, fx) : []), [state, data.instruments, quotes, fx]);
  const totals: Totals | null = useMemo(() => (state ? computeTotals(views, state) : null), [views, state]);
  const history: HistoryPoint[] | null = useMemo(
    () => (ctx.historyReady ? buildHistory(txs, data.instruments, priceSeries, fxSeries) : null),
    [ctx.historyReady, txs, data.instruments, priceSeries, fxSeries],
  );

  return { ...ctx, state, views, totals, history };
}

function useHistorySeries(data: PortfolioData, disabled = false) {
  const [series, setSeries] = useState<{ prices: Series; fx: Series } | null>(null);

  const request = useMemo(() => {
    const first = data.transactions.map((t) => t.date).sort()[0];
    if (!first || disabled) return null;
    const tickers = [...new Set(data.instruments.map((i) => i.ticker))].sort();
    const currencies = [...new Set(data.instruments.map((i) => i.currency).filter((c) => c !== "EUR"))].sort();
    return `/api/history?from=${first}&t=${encodeURIComponent(tickers.join(","))}&c=${currencies.join(",")}`;
  }, [data, disabled]);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    fetch(request)
      .then((r) => r.json())
      .then((j: { series: Series; fx: Series }) => {
        if (!cancelled) setSeries({ prices: j.series, fx: j.fx });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [request]);

  return series;
}
