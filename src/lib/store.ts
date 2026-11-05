"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DEMO_ACCOUNTS, DEMO_INSTRUMENTS, DEMO_TRANSACTIONS } from "./demo";
import { buildPortfolio } from "./engine/portfolio";
import type { Account, Instrument, PortfolioState, Transaction } from "./engine/types";
import type { FxRates, Quotes } from "./analytics";

/**
 * Persistenza locale (localStorage) per la prima versione.
 * In una fase successiva verrà sostituita da Supabase per la
 * sincronizzazione tra dispositivi.
 */

export interface PortfolioData {
  accounts: Account[];
  instruments: Instrument[];
  transactions: Transaction[];
  isDemo: boolean;
}

const DATA_KEY = "portafoglio:data:v1";
const QUOTES_KEY = "portafoglio:quotes:v1";
export const REFRESH_MS = 5 * 60_000;

const DEMO: PortfolioData = {
  accounts: DEMO_ACCOUNTS,
  instruments: DEMO_INSTRUMENTS,
  transactions: DEMO_TRANSACTIONS,
  isDemo: true,
};

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage non disponibile (es. navigazione privata) */
  }
}

// ---- store dati (sottoscrivibile) ----
const listeners = new Set<() => void>();
let current: PortfolioData | null = null;

function getData(): PortfolioData {
  if (!current) current = (typeof window !== "undefined" && read<PortfolioData>(DATA_KEY)) || DEMO;
  return current;
}

export function setData(next: PortfolioData) {
  current = next;
  write(DATA_KEY, next);
  listeners.forEach((l) => l());
}

export function resetToDemo() {
  setData(DEMO);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePortfolioData(): PortfolioData {
  return useSyncExternalStore(subscribe, getData, () => DEMO);
}

export function usePortfolio() {
  const data = usePortfolioData();
  const state: PortfolioState | null = useMemo(() => {
    try {
      return buildPortfolio(data.transactions, data.instruments);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [data]);
  return { data, state };
}

// ---- quotazioni ----
interface QuotesSnapshot {
  quotes: Quotes;
  fx: FxRates;
  fetchedAt: number;
}

export function useQuotes(tickers: string[]) {
  const key = tickers.slice().sort().join(",");
  const [snap, setSnap] = useState<QuotesSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSnap(read<QuotesSnapshot>(QUOTES_KEY));
  }, []);

  const refresh = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes?t=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as QuotesSnapshot;
      setSnap((prev) => {
        const merged = { quotes: { ...prev?.quotes, ...json.quotes }, fx: { ...prev?.fx, ...json.fx }, fetchedAt: json.fetchedAt };
        write(QUOTES_KEY, merged);
        return merged;
      });
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const age = Date.now() - (read<QuotesSnapshot>(QUOTES_KEY)?.fetchedAt ?? 0);
      if (age > REFRESH_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { quotes: snap?.quotes ?? {}, fx: snap?.fx ?? {}, fetchedAt: snap?.fetchedAt ?? null, loading, error, refresh };
}
