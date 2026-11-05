import type { Instrument, PortfolioState, Transaction } from "./engine/types";

export interface DividendEvent {
  date: string;
  isin: string;
  account: string;
  amount: number;
  /** true se è una stima basata sui pagamenti dell'anno precedente. */
  forecast: boolean;
}

/**
 * Cedole e dividendi incassati in un anno e, per l'anno in corso, previsione
 * dei pagamenti mancanti: si ripetono quelli dei 12 mesi precedenti per i
 * titoli ancora in portafoglio, con lo stesso importo.
 */
export function dividendsForYear(
  year: string,
  transactions: Transaction[],
  state: PortfolioState,
  instruments: Instrument[],
  today = new Date().toISOString().slice(0, 10),
): DividendEvent[] {
  const paid: DividendEvent[] = transactions
    .filter((t) => t.type === "dividend" && t.date.startsWith(year))
    .map((t) => ({ date: t.date, isin: t.isin, account: t.account, amount: t.amount ?? 0, forecast: false }));

  if (year !== today.slice(0, 4)) return paid;

  const held = new Map(state.positions.filter((p) => p.quantity > 0).map((p) => [`${p.account}|${p.isin}`, p.quantity]));
  const known = new Set(instruments.map((i) => i.isin));
  const forecast: DividendEvent[] = [];
  for (const t of transactions) {
    if (t.type !== "dividend" || !known.has(t.isin)) continue;
    const next = `${Number(t.date.slice(0, 4)) + 1}${t.date.slice(4)}`;
    if (!next.startsWith(year) || next <= today) continue;
    if (!held.has(`${t.account}|${t.isin}`)) continue;
    // Già pagato quest'anno nello stesso mese? Allora non serve stimarlo.
    if (paid.some((p) => p.isin === t.isin && p.account === t.account && p.date.slice(5, 7) === next.slice(5, 7))) continue;
    forecast.push({ date: next, isin: t.isin, account: t.account, amount: t.amount ?? 0, forecast: true });
  }
  return [...paid, ...forecast].sort((a, b) => a.date.localeCompare(b.date));
}

export interface DividendStat {
  isin: string;
  /** Incassato netto negli ultimi 12 mesi. */
  trailing: number;
  payments: number;
}

/** Cedole e dividendi netti degli ultimi 12 mesi per titolo. */
export function trailingDividends(transactions: Transaction[], today = new Date().toISOString().slice(0, 10)): DividendStat[] {
  const from = new Date(Date.parse(`${today}T12:00:00Z`) - 365 * 86400_000).toISOString().slice(0, 10);
  const map = new Map<string, DividendStat>();
  for (const t of transactions) {
    if (t.type !== "dividend" || t.date < from || t.date > today) continue;
    const s = map.get(t.isin) ?? { isin: t.isin, trailing: 0, payments: 0 };
    s.trailing += t.amount ?? 0;
    s.payments += 1;
    map.set(t.isin, s);
  }
  return [...map.values()].sort((a, b) => b.trailing - a.trailing);
}
