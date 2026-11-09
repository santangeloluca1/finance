import type { HistoryPoint } from "./analytics";
import { buildPortfolio } from "./engine/portfolio";
import type { Instrument, Transaction } from "./engine/types";
import { monthlyReturns, twrSeries } from "./performance";
import { priceOn } from "./recurring";

/**
 * Riepilogo di un mese chiuso, per la scheda "in breve" e il racconto a
 * schermo intero: rendimento, giorni migliori, titoli protagonisti, cedole e
 * operazioni. Solo dati già presenti nell'app; l'indice di confronto si
 * aggiunge a parte.
 */
export interface MonthWrap {
  /** Mese, YYYY-MM. */
  key: string;
  /** Rendimento ponderato nel tempo degli investimenti. */
  ret: number;
  /** Guadagno del mese (latente + realizzato + cedole), in euro. */
  gain: number;
  /** Patrimonio (titoli + liquidità) a fine mese e a fine mese precedente. */
  endValue: number;
  startValue: number;
  /** Posizione del mese tra quelli dell'anno con dati (1 = il migliore). */
  rank: { pos: number; of: number } | null;
  bestDay: Day | null;
  worstDay: Day | null;
  /** Titoli per guadagno del mese, dal migliore al peggiore. */
  titles: Mover[];
  dividends: { total: number; items: { isin: string; amount: number; date: string }[] };
  bought: { total: number; count: number };
  sold: { total: number; count: number };
  deposits: number;
}

export interface Day {
  date: string;
  pct: number;
  gain: number;
}

export interface Mover {
  isin: string;
  /** Guadagno o perdita del mese sul titolo, in euro (acquisti e vendite del mese esclusi). */
  change: number;
  /** Variazione rispetto al capitale nel titolo durante il mese. */
  pct: number;
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Ultimo giorno del mese (YYYY-MM-DD). */
export function monthEnd(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Mese appena chiuso rispetto alla data indicata, YYYY-MM. */
export function previousMonth(today: Date) {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthWrap(
  key: string,
  history: HistoryPoint[],
  transactions: Transaction[],
  instruments: Instrument[],
  priceSeries: Record<string, [string, number][]>,
  fxSeries: Record<string, [string, number][]>,
): MonthWrap | null {
  const start = `${key}-01`;
  const end = monthEnd(key);
  const inMonth = history.filter((h) => h.date >= start && h.date <= end);
  const before = history.filter((h) => h.date < start).at(-1);
  if (!inMonth.length || !before) return null;

  // Rendimento sugli investimenti (la liquidità resta fuori), come in Analisi.
  const invested = history.map((h) => ({ ...h, value: h.value - (h.cash ?? 0) }));
  const months = monthlyReturns(twrSeries(invested));
  const ret = months[key];
  if (ret === undefined) return null;
  const last = inMonth[inMonth.length - 1];

  const sameYear = Object.entries(months).filter(([m]) => m.startsWith(key.slice(0, 4)) && m <= key);
  const rank = sameYear.length >= 3 ? { pos: sameYear.filter(([, r]) => r > ret).length + 1, of: sameYear.length } : null;

  // Giorni: variazione di ogni seduta sul valore investito del giorno prima.
  const days: Day[] = [];
  const all = [before, ...inMonth];
  for (let i = 1; i < all.length; i++) {
    const prev = all[i - 1];
    const base = prev.value - (prev.cash ?? 0);
    const g = all[i].gain - prev.gain;
    if (base > 0 && Math.abs(g) > 0.005) days.push({ date: all[i].date, pct: g / base, gain: g });
  }
  const byGain = [...days].sort((a, b) => b.gain - a.gain);
  const bestDay = byGain[0] && byGain[0].gain > 0 ? byGain[0] : null;
  const worstDay = byGain.at(-1) && byGain.at(-1)!.gain < 0 ? byGain.at(-1)! : null;

  // Titoli: valore a fine mese − valore a inizio mese − soldi messi (acquisti − vendite) nel mese.
  const priorDay = addDays(start, -1);
  const atStart = buildPortfolio(transactions, instruments, { asOf: priorDay });
  const atEnd = buildPortfolio(transactions, instruments, { asOf: end });
  const byIsin = new Map(instruments.map((i) => [i.isin, i]));
  const qty = (s: typeof atStart, isin: string) => s.positions.filter((p) => p.isin === isin).reduce((a, p) => a + p.quantity, 0);
  const eurPrice = (ins: Instrument, date: string) => {
    const p = priceOn(priceSeries[ins.ticker], date);
    if (p === undefined) return undefined;
    if (ins.currency === "EUR") return p;
    const fx = priceOn(fxSeries[ins.currency], date);
    return fx ? p / fx : undefined;
  };
  const txInMonth = transactions.filter((t) => t.date >= start && t.date <= end);
  const tradeEur = (t: Transaction) => ((t.quantity ?? 0) * (t.price ?? 0)) / (t.fxRate ?? 1);
  const isins = new Set([...atStart.positions, ...atEnd.positions].filter((p) => p.quantity > 0).map((p) => p.isin));
  const titles: Mover[] = [];
  for (const isin of isins) {
    const ins = byIsin.get(isin);
    if (!ins) continue;
    const q0 = qty(atStart, isin);
    const q1 = qty(atEnd, isin);
    const p0 = q0 > 0 ? eurPrice(ins, priorDay) : 0;
    const p1 = q1 > 0 ? eurPrice(ins, end) : 0;
    if (p0 === undefined || p1 === undefined) continue;
    const trades = txInMonth.filter((t) => t.isin === isin);
    const bought = trades.filter((t) => t.type === "buy").reduce((a, t) => a + tradeEur(t), 0);
    const sold = trades.filter((t) => t.type === "sell").reduce((a, t) => a + tradeEur(t), 0);
    const change = q1 * p1 - q0 * p0 - bought + sold;
    const capital = q0 * p0 + bought;
    if (Math.abs(change) < 0.5) continue;
    titles.push({ isin, change, pct: capital > 0 ? change / capital : 0 });
  }
  titles.sort((a, b) => b.change - a.change);

  const divs = txInMonth.filter((t) => t.type === "dividend");
  const buys = txInMonth.filter((t) => t.type === "buy");
  const sells = txInMonth.filter((t) => t.type === "sell");
  return {
    key,
    ret,
    gain: last.gain - before.gain,
    endValue: last.value,
    startValue: before.value,
    rank,
    bestDay,
    worstDay,
    titles,
    dividends: { total: divs.reduce((a, t) => a + (t.amount ?? 0), 0), items: divs.map((t) => ({ isin: t.isin, amount: t.amount ?? 0, date: t.date })) },
    bought: { total: buys.reduce((a, t) => a + tradeEur(t) + (t.fees ?? 0), 0), count: buys.length },
    sold: { total: sells.reduce((a, t) => a + tradeEur(t) - (t.fees ?? 0), 0), count: sells.length },
    deposits: txInMonth.filter((t) => t.type === "deposit").reduce((a, t) => a + (t.amount ?? 0), 0),
  };
}
