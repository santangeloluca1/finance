"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { getCurrentData, saveTransaction, setData, usePortfolio, useQuotes, type PortfolioData } from "@/lib/store";
import { autoTransaction, isAuto, pendingOccurrences } from "@/lib/recurring";
import { usePathname } from "next/navigation";
import { useCloudSync } from "@/lib/sync";

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
  useCloudSync(!onLogin);
  const tickers = useMemo(() => {
    if (onLogin) return [];
    const open = new Set(state?.positions.filter((p) => p.quantity > 0).map((p) => p.isin));
    // Per i titoli in euro si passa anche l'ISIN: abilita Tradegate la sera.
    return data.instruments.filter((i) => open.has(i.isin)).map((i) => (i.currency === "EUR" ? `${i.ticker}~${i.isin}` : i.ticker));
  }, [data.instruments, state, onLogin]);

  const { quotes, fx, fetchedAt, loading, error, refresh } = useQuotes(tickers);
  const series = useHistorySeries(data, onLogin);
  useTickerRepair(data, state, quotes, fetchedAt, loading);
  useAutoRecurring(data, series, onLogin);

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

/**
 * Se un titolo aperto non riceve quotazioni (simbolo Yahoo sbagliato o non più
 * valido), chiede al server un simbolo funzionante per lo stesso ISIN e lo
 * salva nella scheda del titolo. Una sola prova per titolo e sessione.
 */
function useTickerRepair(data: PortfolioData, state: PortfolioState | null, quotes: Quotes, fetchedAt: number | null, loading: boolean) {
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (data.isDemo || !state || !fetchedAt || loading) return;
    const open = state.positions.filter((p) => p.quantity > 0);
    for (const ins of data.instruments) {
      const pos = open.filter((p) => p.isin === ins.isin);
      if (!pos.length || quotes[ins.ticker] || tried.current.has(ins.isin)) continue;
      tried.current.add(ins.isin);
      const qty = pos.reduce((a, p) => a + p.quantity, 0);
      const avg = pos.reduce((a, p) => a + p.totalCost, 0) / qty;
      const params = new URLSearchParams({ isin: ins.isin, currency: ins.currency, name: ins.name, current: ins.ticker });
      // Il prezzo medio è in euro: vale come riferimento di scala solo per i titoli in euro.
      if (ins.currency === "EUR" && avg > 0) params.set("ref", String(avg));
      fetch(`/api/resolve?${params}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((res: { ticker: string | null } | null) => {
          if (!res?.ticker || res.ticker === ins.ticker) return;
          const cur = getCurrentData();
          setData({ ...cur, instruments: cur.instruments.map((i) => (i.isin === ins.isin ? { ...i, ticker: res.ticker! } : i)) });
        })
        .catch(() => {});
    }
  }, [data, state, quotes, fetchedAt, loading]);
}

/**
 * Registra le rate scadute dei piani automatici. L'id del movimento deriva
 * dalla rata, così due dispositivi che la registrano insieme non la doppiano.
 * Se una rata non si può registrare (es. liquidità insufficiente, prezzo del
 * PAC non ancora noto) resta tra quelle da confermare.
 */
function useAutoRecurring(data: PortfolioData, series: { prices: Series; fx: Series } | null, disabled: boolean) {
  const failed = useRef(new Set<string>());
  useEffect(() => {
    if (disabled || data.isDemo || !data.recurring?.some(isAuto)) return;
    const today = new Date().toISOString().slice(0, 10);
    const due = pendingOccurrences(data.recurring, data.transactions, data.recurringSkipped ?? [], today).filter((o) => isAuto(o.plan) && !failed.current.has(o.id));
    for (const occ of due) {
      const tx = autoTransaction(occ, today, data.instruments, series?.prices ?? {}, series?.fx ?? {});
      if (!tx) continue;
      try {
        saveTransaction(tx);
      } catch {
        failed.current.add(occ.id);
      }
    }
  }, [data, series, disabled]);
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
        (filter.account === "all" || t.account === filter.account || t.toAccount === filter.account) &&
        (filter.asset === "all" || (filter.asset === "liquidita" ? ["cash", "deposit", "withdrawal", "transfer"].includes(t.type) : assetOf.get(t.isin) === filter.asset)),
    );
  }, [data, filter.account, filter.asset]);

  const state = useMemo(() => {
    if (filter.account === "all" && filter.asset === "all") return ctx.state;
    try {
      const s = buildPortfolio(txs, data.instruments);
      // Un bonifico verso questo conto non deve mostrare il conto di partenza.
      if (filter.account !== "all") s.cash = Object.fromEntries(Object.entries(s.cash).filter(([acc]) => acc === filter.account));
      return s;
    } catch {
      return null;
    }
  }, [txs, data.instruments, ctx.state, filter.account, filter.asset]);

  const views: PositionView[] = useMemo(() => (state ? valuePositions(state, data.instruments, quotes, fx) : []), [state, data.instruments, quotes, fx]);
  const totals: Totals | null = useMemo(() => (state ? computeTotals(views, state) : null), [views, state]);
  const history: HistoryPoint[] | null = useMemo(
    () => (ctx.historyReady ? buildHistory(txs, data.instruments, priceSeries, fxSeries, filter.account === "all" ? undefined : filter.account) : null),
    [ctx.historyReady, txs, data.instruments, priceSeries, fxSeries, filter.account],
  );

  return { ...ctx, state, views, totals, history };
}

function useHistorySeries(data: PortfolioData, disabled = false) {
  const [series, setSeries] = useState<{ prices: Series; fx: Series } | null>(null);

  const request = useMemo(() => {
    const first = data.transactions.map((t) => t.date).sort()[0];
    if (!first || disabled) return null;
    const tickers = [...new Set(data.instruments.map((i) => `${i.ticker}~${i.isin}`))].sort();
    const currencies = [...new Set(data.instruments.map((i) => i.currency).filter((c) => c !== "EUR"))].sort();
    return `/api/history?from=${first}&t=${encodeURIComponent(tickers.join(","))}&c=${currencies.join(",")}`;
  }, [data, disabled]);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    // Apertura immediata: lo storico dell'ultima volta (se è per gli stessi titoli), poi quello aggiornato.
    const cached = readHistoryCache(request);
    if (cached) setSeries(cached);
    fetch(request)
      .then((r) => r.json())
      .then((j: { series: Series; fx: Series }) => {
        if (cancelled || !j.series) return;
        const next = { prices: j.series, fx: j.fx ?? {} };
        setSeries(next);
        writeHistoryCache(request, next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [request]);

  return series;
}

const HISTORY_KEY = "portafoglio:history:v1";

function readHistoryCache(request: string): { prices: Series; fx: Series } | null {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { request: string; prices: Series; fx: Series };
    return c.request === request ? { prices: c.prices, fx: c.fx } : null;
  } catch {
    return null;
  }
}

function writeHistoryCache(request: string, s: { prices: Series; fx: Series }) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ request, ...s }));
  } catch {
    /* spazio esaurito o storage non disponibile: si riscarica ogni volta */
  }
}
