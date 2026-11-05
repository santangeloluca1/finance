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
  /** Patrimonio: investimenti + liquidità. */
  value: number;
  /** Solo investimenti. */
  invested: number;
  cash: number;
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
  const investedValue = sum(views.map((v) => v.value));
  const cash = sum(Object.values(state.cash).map((c) => c.amount));
  const value = investedValue + cash;
  const cost = sum(views.map((v) => v.position.totalCost));
  const dayChange = sum(views.map((v) => v.dayChange));
  const realizedGross = sum(state.realized.map((r) => r.gain));
  const realizedTax = sum(state.realized.map((r) => r.tax));
  const income = sum(Object.values(state.incomeByYear));
  const taxIfSold = sum(views.map((v) => v.taxIfSold));
  return {
    value,
    invested: investedValue,
    cash,
    cost,
    unrealized: investedValue - cost,
    unrealizedPct: cost ? (investedValue - cost) / cost : 0,
    dayChange,
    dayChangePct: investedValue - dayChange ? dayChange / (investedValue - dayChange) : 0,
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
  etf_azionario: "#5468ff",
  etf_obbligazionario: "#22b8cf",
  azione: "#9b6bff",
  obbligazione: "#2dd4a7",
  certificato: "#f472b6",
  etc: "#f5a524",
  crypto: "#ff7a45",
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
  /** Guadagno totale cumulato: latente + realizzato (lordo) + cedole nette. */
  gain: number;
  /** Liquidità compresa in value e invested. */
  cash?: number;
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
  /** Con un filtro per banca: conta solo la liquidità di questo conto. */
  cashAccount?: string,
): HistoryPoint[] {
  const txs = sortTransactions(transactions);
  if (txs.length === 0) return [];
  const start = txs[0].date;
  // Giorni di borsa dei titoli più i giorni feriali: così il grafico esiste anche
  // per un portafoglio di sola liquidità o con titoli senza storico.
  const today = new Date().toISOString().slice(0, 10);
  const weekdays: string[] = [];
  for (let d = new Date(`${start}T12:00:00Z`); d.toISOString().slice(0, 10) < today; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) weekdays.push(d.toISOString().slice(0, 10));
  }
  const dates = [...new Set([...Object.values(series).flatMap((s) => s.map(([d]) => d)), ...weekdays])]
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
    const realized = state.realized.reduce((a, r) => a + r.gain, 0);
    const income = Object.values(state.incomeByYear).reduce((a, b) => a + b, 0);
    // La liquidità entra nel valore e nel capitale: non cambia il guadagno.
    const cashNow = Object.entries(state.cash)
      .filter(([acc]) => !cashAccount || acc === cashAccount)
      .reduce((a, [, c]) => a + c.amount, 0);
    value += cashNow;
    invested += cashNow;
    for (const p of state.positions) {
      if (p.quantity <= 0) continue;
      const ins = byIsin.get(p.isin)!;
      const px = priceAt.get(p.isin)?.(date);
      const rate = ins.currency === "EUR" ? 1 : fxAt.get(ins.currency)?.(date);
      value += px !== undefined && rate ? (p.quantity * px) / rate : p.totalCost;
      invested += p.totalCost;
    }
    out.push({ date, value, invested, gain: value - invested + realized + income, cash: cashNow });
  }
  return out;
}

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}

export type Period = "oggi" | "1S" | "1M" | "6M" | "1A" | "totale";

export const PERIOD_DAYS: Record<Exclude<Period, "oggi" | "totale">, number> = { "1S": 7, "1M": 31, "6M": 183, "1A": 366 };

export function cutoffDate(days: number) {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

/**
 * Variazione di una posizione nel periodo scelto, in EUR e in percentuale.
 * Se la posizione è stata aperta dopo l'inizio del periodo si usa il prezzo medio.
 */
export function positionChange(
  v: PositionView,
  period: Period,
  series: Record<string, [string, number][]>,
  fx: FxRates,
): { abs: number; pct: number } {
  if (period === "oggi") return { abs: v.dayChange, pct: v.dayChangePct };
  if (period === "totale" || v.price === null) return { abs: v.unrealized, pct: v.unrealizedPct };
  const from = cutoffDate(PERIOD_DAYS[period]);
  if (v.position.firstBuy >= from) return { abs: v.unrealized, pct: v.unrealizedPct };
  const s = series[v.instrument.ticker];
  const past = s?.filter(([d]) => d <= from).at(-1)?.[1];
  if (!past) return { abs: v.unrealized, pct: v.unrealizedPct };
  const rate = v.instrument.currency === "EUR" ? 1 : fx[v.instrument.currency] ?? 1;
  return { abs: (v.position.quantity * (v.price - past)) / rate, pct: (v.price - past) / past };
}
