import { buildPortfolio, simulateSale, sortTransactions } from "./engine/portfolio";
import type { AssetClass, Instrument, PortfolioState, Position, Transaction } from "./engine/types";

export interface QuoteLite {
  price: number;
  previousClose: number;
  currency: string;
  time: number;
}

export type Quotes = Record<string, QuoteLite>;
export type FxRates = Record<string, number>;

export interface PositionView {
  position: Position;
  instrument: Instrument;
  /** Prezzo corrente in valuta dello strumento (null se non disponibile). */
  price: number | null;
  value: number;
  dayChange: number;
  dayChangePct: number;
  unrealized: number;
  unrealizedPct: number;
  /** Imposta stimata se vendessi tutto oggi. */
  taxIfSold: number;
  stale: boolean;
}

export interface Totals {
  value: number;
  cost: number;
  unrealized: number;
  unrealizedPct: number;
  dayChange: number;
  dayChangePct: number;
  realizedNet: number;
  realizedTax: number;
  income: number;
  taxIfSold: number;
  netLiquidation: number;
}

const fxOf = (fx: FxRates, currency: string) => (currency === "EUR" ? 1 : fx[currency] ?? NaN);

export function valuePositions(
  state: PortfolioState,
  instruments: Instrument[],
  quotes: Quotes,
  fx: FxRates,
): PositionView[] {
  const byIsin = new Map(instruments.map((i) => [i.isin, i]));
  return state.positions
    .filter((p) => p.quantity > 0)
    .map((position) => {
      const instrument = byIsin.get(position.isin)!;
      const q = quotes[instrument.ticker];
      const rate = fxOf(fx, instrument.currency);
      const hasQuote = q && Number.isFinite(rate);
      const priceEur = hasQuote ? q.price / rate : position.avgCost;
      const prevEur = hasQuote ? q.previousClose / rate : priceEur;
      const value = position.quantity * priceEur;
      const unrealized = value - position.totalCost;
      let taxIfSold = 0;
      try {
        taxIfSold = simulateSale(state, instrument, position.account, position.quantity, priceEur).tax;
      } catch {
        taxIfSold = 0;
      }
      return {
        position,
        instrument,
        price: hasQuote ? q.price : null,
        value,
        dayChange: position.quantity * (priceEur - prevEur),
        dayChangePct: prevEur ? (priceEur - prevEur) / prevEur : 0,
        unrealized,
        unrealizedPct: position.totalCost ? unrealized / position.totalCost : 0,
        taxIfSold,
        stale: !hasQuote,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export function totals(views: PositionView[], state: PortfolioState): Totals {
  const value = sum(views.map((v) => v.value));
  const cost = sum(views.map((v) => v.position.totalCost));
  const dayChange = sum(views.map((v) => v.dayChange));
  const realizedGross = sum(state.realized.map((r) => r.gain));
  const realizedTax = sum(state.realized.map((r) => r.tax));
  const income = sum(Object.values(state.incomeByYear));
  const taxIfSold = sum(views.map((v) => v.taxIfSold));
  return {
    value,
    cost,
    unrealized: value - cost,
    unrealizedPct: cost ? (value - cost) / cost : 0,
    dayChange,
    dayChangePct: value - dayChange ? dayChange / (value - dayChange) : 0,
    realizedNet: realizedGross - realizedTax,
    realizedTax,
    income,
    taxIfSold,
    netLiquidation: value - taxIfSold,
  };
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  etf_azionario: "ETF azionari",
  etf_obbligazionario: "ETF obbligazionari",
  azione: "Azioni",
  obbligazione: "Obbligazioni",
  certificato: "Certificati",
  etc: "ETC",
  crypto: "Crypto",
};

export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  etf_azionario: "#5B8CFF",
  etf_obbligazionario: "#2DD4BF",
  azione: "#F59E0B",
  obbligazione: "#A3E635",
  certificato: "#F472B6",
  etc: "#FBBF24",
  crypto: "#C084FC",
};

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function groupBy(views: PositionView[], by: (v: PositionView) => { key: string; label: string; color: string }): Slice[] {
  const map = new Map<string, Slice>();
  for (const v of views) {
    const g = by(v);
    const s = map.get(g.key) ?? { ...g, value: 0 };
    s.value += v.value;
    map.set(g.key, s);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export interface HistoryPoint {
  date: string;
  value: number;
  invested: number;
}

/**
 * Ricostruisce il valore giornaliero del portafoglio dalle chiusure storiche.
 * `invested` è il costo di carico delle posizioni aperte in quella data.
 */
export function buildHistory(
  transactions: Transaction[],
  instruments: Instrument[],
  series: Record<string, [string, number][]>,
  fxSeries: Record<string, [string, number][]>,
): HistoryPoint[] {
  const txs = sortTransactions(transactions);
  if (txs.length === 0) return [];
  const start = txs[0].date;
  const dates = [...new Set(Object.values(series).flatMap((s) => s.map(([d]) => d)))]
    .filter((d) => d >= start)
    .sort();
  if (dates.length === 0) return [];

  const cursor = (s: [string, number][] | undefined) => {
    let i = 0;
    let last: number | undefined;
    return (date: string) => {
      if (!s) return undefined;
      while (i < s.length && s[i][0] <= date) last = s[i++][1];
      return last;
    };
  };
  const priceAt = new Map(instruments.map((ins) => [ins.isin, cursor(series[ins.ticker])]));
  const fxAt = new Map(Object.entries(fxSeries).map(([c, s]) => [c, cursor(s)]));
  const byIsin = new Map(instruments.map((i) => [i.isin, i]));

  const out: HistoryPoint[] = [];
  let txIdx = 0;
  let state: PortfolioState | null = null;
  for (const date of dates) {
    let changed = false;
    while (txIdx < txs.length && txs[txIdx].date <= date) {
      txIdx++;
      changed = true;
    }
    if (changed || !state) state = buildPortfolio(txs.slice(0, txIdx), instruments);
    let value = 0;
    let invested = 0;
    for (const p of state.positions) {
      if (p.quantity <= 0) continue;
      const ins = byIsin.get(p.isin)!;
      const px = priceAt.get(p.isin)?.(date);
      const rate = ins.currency === "EUR" ? 1 : fxAt.get(ins.currency)?.(date);
      value += px !== undefined && rate ? (p.quantity * px) / rate : p.totalCost;
      invested += p.totalCost;
    }
    out.push({ date, value, invested });
  }
  return out;
}

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}
