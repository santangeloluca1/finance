"use client";

import { useEffect, useMemo, useState } from "react";
import type { PositionView } from "./analytics";
import { groupOf, type Group } from "./allocation";
import { backtest, monthEnds, riskReport, toEur, type RiskReport, type Series } from "./risk";

/** Indici simili per gruppo, dove un titolo non ha storico abbastanza lungo. */
export const PROXY: Partial<Record<Group, { ticker: string; key: string }>> = {
  azioni: { ticker: "SWDA.MI", key: "SWDA.MI~IE00B4L5Y983" },
  obbligazioni: { ticker: "SEGA.MI", key: "SEGA.MI~IE00B4WXJJ64" },
};

type History = { series: Record<string, Series>; fx: Record<string, Series> };

/** Cache in memoria condivisa tra le pagine (Home e Analisi chiedono gli stessi dati). */
const memo = new Map<string, Promise<History>>();

function yearsAgo(n: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return `${d.toISOString().slice(0, 7)}-01`;
}

/** Storico lungo dei prezzi (e dei cambi) per un elenco di simboli. */
export function useLongHistory(entries: string[], currencies: string[], years: number) {
  const url = entries.length
    ? `/api/history?from=${yearsAgo(years)}&t=${encodeURIComponent([...new Set(entries)].sort().join(","))}&c=${[...new Set(currencies)].sort().join(",")}`
    : null;
  const [data, setData] = useState<{ url: string; h: History } | null>(null);
  useEffect(() => {
    if (!url) return;
    let stop = false;
    if (!memo.has(url))
      memo.set(
        url,
        fetch(url)
          .then((r) => r.json() as Promise<History>)
          .catch((e) => {
            memo.delete(url);
            throw e;
          }),
      );
    memo
      .get(url)!
      .then((h) => !stop && setData({ url, h }))
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [url]);
  return data?.url === url ? data.h : null;
}

const keyOf = (v: PositionView) => (v.instrument.currency === "EUR" ? `${v.instrument.ticker}~${v.instrument.isin}` : v.instrument.ticker);

export interface RiskView {
  report: RiskReport;
  /** Lo stesso calcolo sull'indice di confronto, nello stesso periodo. */
  bench: RiskReport | null;
  /** Valore investito su cui tradurre le percentuali in euro. */
  invested: number;
}

/**
 * Rischio del portafoglio di oggi sugli ultimi 10 anni: titoli e pesi attuali,
 * prezzi reali in euro, indice simile dove un titolo è più giovane.
 */
export function useRisk(views: PositionView[], bench: string | null = null): { risk: RiskView | null; loading: boolean } {
  const held = useMemo(() => views.filter((v) => v.value > 0), [views]);
  const entries = useMemo(
    () => [...held.map(keyOf), ...Object.values(PROXY).map((p) => p!.key), ...(bench ? [bench] : [])],
    [held, bench],
  );
  const currencies = useMemo(() => held.map((v) => v.instrument.currency).filter((c) => c !== "EUR"), [held]);
  const h = useLongHistory(held.length ? entries : [], currencies, 10);

  const risk = useMemo(() => {
    if (!h?.series) return null;
    const from = yearsAgo(10);
    const legs = held.map((v) => ({
      weight: v.value,
      prices: toEur(h.series[v.instrument.ticker], v.instrument.currency === "EUR" ? undefined : h.fx?.[v.instrument.currency]),
      proxy: h.series[PROXY[groupOf(v.instrument.assetClass)]?.ticker ?? ""],
    }));
    const bt = backtest(legs, from);
    if (!bt || bt.index.length < 260) return null;
    const report = riskReport(bt);
    const b = bench ? backtest([{ weight: 1, prices: h.series[bench.split("~")[0]] }], report.from) : null;
    return { report, bench: b && b.index.length > 260 ? riskReport(b) : null, invested: held.reduce((a, v) => a + v.value, 0) };
  }, [h, held, bench]);

  return { risk, loading: held.length > 0 && !h };
}

/**
 * Rendimenti mensili storici degli indici di riferimento dei gruppi, sugli stessi mesi:
 * la materia prima delle simulazioni degli obiettivi.
 */
export function useGroupReturns() {
  const h = useLongHistory(
    Object.values(PROXY).map((p) => p!.key),
    [],
    15,
  );
  return useMemo(() => {
    if (!h?.series) return null;
    const groups = Object.entries(PROXY).map(([g, p]) => ({ group: g as Group, months: new Map(monthEnds(h.series[p!.ticker] ?? []).map(([d, v]) => [d.slice(0, 7), v])) }));
    // Solo mesi completi presenti per tutti, senza l'ultimo (ancora in corso).
    const common = [...groups[0].months.keys()].filter((m) => groups.every((g) => g.months.has(m))).sort().slice(0, -1);
    if (common.length < 37) return null;
    const out = {} as Partial<Record<Group, number[]>>;
    for (const g of groups) out[g.group] = common.slice(1).map((m, i) => g.months.get(m)! / g.months.get(common[i])! - 1);
    return { returns: out, from: common[0], months: common.length - 1 };
  }, [h]);
}
