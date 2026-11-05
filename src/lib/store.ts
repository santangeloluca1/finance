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

export interface Goal {
  id: string;
  name: string;
  target: number;
  /** Scadenza YYYY-MM-DD. */
  date: string;
  /** Cosa conta per l'obiettivo: tutto il patrimonio, un conto o solo la liquidità. */
  scope: "tutto" | "liquidita" | string;
}

export interface Plan {
  monthly: number;
  /** Rendimento annuo atteso, es. 0.05. */
  expectedReturn: number;
  years: number;
}

export interface PortfolioData {
  accounts: Account[];
  instruments: Instrument[];
  transactions: Transaction[];
  isDemo: boolean;
  goals?: Goal[];
  plan?: Plan;
  /** Allocazione obiettivo per asset class (pesi 0..1). */
  targets?: Record<string, number>;
}

const DATA_KEY = "portafoglio:data:v1";
const SYNC_KEY = "portafoglio:sync:v1";
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

export function getCurrentData(): PortfolioData {
  return getData();
}

/** Stato della sincronizzazione locale: versione del server di partenza e modifiche non inviate. */
export interface SyncMeta {
  updatedAt: string | null;
  dirty: boolean;
}

export function getSyncMeta(): SyncMeta {
  return (typeof window !== "undefined" && read<SyncMeta>(SYNC_KEY)) || { updatedAt: null, dirty: false };
}

export function setSyncMeta(meta: SyncMeta) {
  write(SYNC_KEY, meta);
}

/**
 * Aggiorna i dati. Le modifiche dell'utente (non quelle arrivate dal server)
 * vengono segnate come da inviare; il portafoglio di esempio non si sincronizza mai.
 */
export function setData(next: PortfolioData, opts: { fromServer?: boolean } = {}) {
  current = next;
  write(DATA_KEY, next);
  if (!opts.fromServer && !next.isDemo) setSyncMeta({ ...getSyncMeta(), dirty: true });
  listeners.forEach((l) => l());
}

export function resetToDemo() {
  current = DEMO;
  write(DATA_KEY, DEMO);
  listeners.forEach((l) => l());
}

/** Cancella i dati dal dispositivo (all'uscita dall'account). */
export function clearLocalData() {
  try {
    localStorage.removeItem(DATA_KEY);
    localStorage.removeItem(SYNC_KEY);
    localStorage.removeItem("portafoglio:quotes:v1");
  } catch {}
  current = DEMO;
  listeners.forEach((l) => l());
}

export function subscribeData(cb: () => void) {
  return subscribe(cb);
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

// ---- modifiche manuali ----

export class SaveError extends Error {}

/**
 * Salva (aggiunge o sostituisce) un movimento. Se l'app mostra ancora il
 * portafoglio di esempio, lo sostituisce con un portafoglio vuoto.
 * Verifica che lo storico resti coerente (es. vendite non superiori al posseduto).
 */
export function saveTransaction(tx: Transaction, instrument?: Instrument) {
  const current = getData();
  const base: PortfolioData = current.isDemo
    ? { accounts: current.accounts, instruments: [], transactions: [], isDemo: false }
    : current;
  // Se il titolo arriva dal portafoglio di esempio, la sua scheda va portata nei dati veri.
  const needed = instrument ?? (tx.isin ? current.instruments.find((i) => i.isin === tx.isin) : undefined);
  const instruments =
    needed && !base.instruments.some((i) => i.isin === needed.isin) ? [...base.instruments, needed] : base.instruments;
  const exists = base.transactions.some((t) => t.id === tx.id);
  const transactions = exists ? base.transactions.map((t) => (t.id === tx.id ? tx : t)) : [...base.transactions, tx];
  try {
    buildPortfolio(transactions, instruments);
  } catch (e) {
    throw new SaveError(humanize((e as Error).message));
  }
  setData({ ...base, instruments, transactions });
}

export function deleteTransaction(id: string) {
  const current = getData();
  const transactions = current.transactions.filter((t) => t.id !== id);
  try {
    buildPortfolio(transactions, current.instruments);
  } catch (e) {
    throw new SaveError(humanize((e as Error).message));
  }
  // Rimuove gli strumenti non più usati da nessun movimento.
  const used = new Set(transactions.map((t) => t.isin));
  setData({ ...current, transactions, instruments: current.instruments.filter((i) => used.has(i.isin)) });
}

export function newId() {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function humanize(msg: string) {
  if (msg.includes("quantità disponibile")) return "Stai vendendo più quote di quelle possedute su questo conto a quella data.";
  return msg;
}

// ---- obiettivi e pianificazione ----

/** Dati di partenza per le modifiche: l'esempio viene sostituito da un portafoglio vuoto. */
function editableBase(): PortfolioData {
  const current = getData();
  return current.isDemo ? { accounts: current.accounts, instruments: [], transactions: [], isDemo: false } : current;
}

export function saveGoal(goal: Goal) {
  const base = editableBase();
  const goals = base.goals ?? [];
  setData({ ...base, goals: goals.some((g) => g.id === goal.id) ? goals.map((g) => (g.id === goal.id ? goal : g)) : [...goals, goal] });
}

export function deleteGoal(id: string) {
  const base = getData();
  setData({ ...base, goals: (base.goals ?? []).filter((g) => g.id !== id) });
}

export function savePlan(plan: Plan) {
  const base = getData();
  // La pianificazione funziona anche sull'esempio, senza sostituirlo.
  if (base.isDemo) {
    current = { ...base, plan };
    listeners.forEach((l) => l());
    return;
  }
  setData({ ...base, plan });
}

export function saveTargets(targets: Record<string, number>) {
  const base = getData();
  if (base.isDemo) {
    current = { ...base, targets };
    listeners.forEach((l) => l());
    return;
  }
  setData({ ...base, targets });
}
