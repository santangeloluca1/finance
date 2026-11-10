/**
 * Rischio del portafoglio di oggi rivisto sugli ultimi anni di prezzi reali.
 *
 * Si tengono fissi i pesi attuali (ribilanciati ogni giorno) e si ricostruisce
 * come sarebbe andato: calo massimo, oscillazione, peggior anno. Per decidere
 * conta il portafoglio che hai adesso, non quello che avevi due anni fa.
 * Dove un titolo non ha storico abbastanza lungo si usa un indice simile.
 * Modulo puro (testato).
 */

export type Series = [string, number][];

export interface Leg {
  /** Peso nel portafoglio (si normalizza). */
  weight: number;
  /** Prezzi in euro. */
  prices: Series | undefined;
  /** Indice simile da usare dove il titolo non ha ancora prezzi. */
  proxy?: Series;
}

export interface Backtest {
  /** Livello del portafoglio, 1 alla prima data. */
  index: Series;
  /** Quota del portafoglio che per una parte del periodo usa un indice simile. */
  proxied: number;
}

/** Rendimenti giornalieri di una serie, per data (dal secondo punto). */
function returnsByDate(s: Series | undefined) {
  const out = new Map<string, number>();
  if (!s) return out;
  for (let i = 1; i < s.length; i++) if (s[i - 1][1] > 0) out.set(s[i][0], s[i][1] / s[i - 1][1] - 1);
  return out;
}

/**
 * Portafoglio a pesi fissi: ogni giorno il rendimento è la media pesata dei
 * rendimenti dei titoli; senza dati né indice simile, il peso si ridistribuisce.
 */
export function backtest(legs: Leg[], from: string): Backtest | null {
  const live = legs.filter((l) => l.weight > 0 && (l.prices?.length || l.proxy?.length));
  const tot = live.reduce((a, l) => a + l.weight, 0);
  if (!tot) return null;
  const rets = live.map((l) => ({ w: l.weight / tot, own: returnsByDate(l.prices), proxy: returnsByDate(l.proxy), first: l.prices?.[0]?.[0] ?? "9999" }));
  const dates = [...new Set(live.flatMap((l) => [...(l.prices ?? []), ...(l.proxy ?? [])].map(([d]) => d)))].filter((d) => d >= from).sort();
  if (dates.length < 2) return null;

  let level = 1;
  const index: Series = [[dates[0], 1]];
  for (let k = 1; k < dates.length; k++) {
    const d = dates[k];
    let sum = 0;
    let wsum = 0;
    for (const r of rets) {
      const x = r.own.get(d) ?? (d <= r.first ? r.proxy.get(d) : undefined);
      // Un giorno senza scambi per quel titolo vale 0 (prezzo invariato), se ha già uno storico.
      const v = x ?? (d > r.first ? 0 : undefined);
      if (v === undefined) continue;
      sum += r.w * v;
      wsum += r.w;
    }
    if (wsum > 0) level *= 1 + sum / wsum;
    index.push([d, level]);
  }
  const proxied = rets.filter((r) => r.first > dates[0] && r.proxy.size).reduce((a, r) => a + r.w, 0);
  return { index, proxied };
}

/** Ultimo valore di ogni mese. */
export function monthEnds(s: Series): Series {
  const out: Series = [];
  for (let i = 0; i < s.length; i++) if (i === s.length - 1 || s[i + 1][0].slice(0, 7) !== s[i][0].slice(0, 7)) out.push(s[i]);
  return out;
}

export function monthlyReturns(s: Series): number[] {
  const m = monthEnds(s);
  const out: number[] = [];
  for (let i = 1; i < m.length; i++) out.push(m[i][1] / m[i - 1][1] - 1);
  return out;
}

export interface Drawdown {
  depth: number;
  peak: string;
  trough: string;
  /** Data in cui è tornato al massimo precedente (null se non ancora). */
  recovered: string | null;
}

/** Calo massimo dal punto più alto, con le date. */
export function maxDrawdown(s: Series): Drawdown | null {
  if (s.length < 2) return null;
  let peakIdx = 0;
  let best = { depth: 0, peak: 0, trough: 0 };
  for (let i = 1; i < s.length; i++) {
    if (s[i][1] > s[peakIdx][1]) peakIdx = i;
    const dd = s[i][1] / s[peakIdx][1] - 1;
    if (dd < best.depth) best = { depth: dd, peak: peakIdx, trough: i };
  }
  if (best.depth === 0) return null;
  let rec: string | null = null;
  for (let i = best.trough + 1; i < s.length; i++)
    if (s[i][1] >= s[best.peak][1]) {
      rec = s[i][0];
      break;
    }
  return { depth: best.depth, peak: s[best.peak][0], trough: s[best.trough][0], recovered: rec };
}

/** Distanza di oggi dal massimo (0 se ai massimi). */
export function fromPeak(s: { value: number }[]) {
  if (!s.length) return 0;
  const peak = Math.max(...s.map((p) => p.value));
  return peak > 0 ? s[s.length - 1].value / peak - 1 : 0;
}

/** Oscillazione annua: deviazione standard dei rendimenti mensili × √12. */
export function volatility(monthly: number[]) {
  if (monthly.length < 3) return null;
  const mean = monthly.reduce((a, b) => a + b, 0) / monthly.length;
  const v = monthly.reduce((a, r) => a + (r - mean) ** 2, 0) / (monthly.length - 1);
  return Math.sqrt(v * 12);
}

/** Rendimento annuo composto tra il primo e l'ultimo punto. */
export function cagr(s: Series) {
  if (s.length < 2) return null;
  const years = (Date.parse(s[s.length - 1][0]) - Date.parse(s[0][0])) / (365.25 * 86400_000);
  return years > 0.5 ? Math.pow(s[s.length - 1][1] / s[0][1], 1 / years) - 1 : null;
}

export interface Window {
  from: string;
  to: string;
  ret: number;
}

/** Tutti i periodi di 12 mesi, da una fine mese all'altra. */
export function rollingYears(s: Series): Window[] {
  const m = monthEnds(s);
  const out: Window[] = [];
  for (let i = 12; i < m.length; i++) out.push({ from: m[i - 12][0], to: m[i][0], ret: m[i][1] / m[i - 12][1] - 1 });
  return out;
}

/** Quantile (0..1) di un elenco, con interpolazione lineare. */
export function quantile(xs: number[], q: number) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export interface RiskReport {
  from: string;
  years: number;
  drawdown: Drawdown | null;
  vol: number | null;
  cagr: number | null;
  worst: Window | null;
  /** Rendimento a 12 mesi superato in peggio una volta su 20. */
  bad: number | null;
  windows: Window[];
  proxied: number;
}

export function riskReport(bt: Backtest): RiskReport {
  const s = bt.index;
  const windows = rollingYears(s);
  const worst = windows.reduce<Window | null>((w, x) => (!w || x.ret < w.ret ? x : w), null);
  return {
    from: s[0][0],
    years: (Date.parse(s[s.length - 1][0]) - Date.parse(s[0][0])) / (365.25 * 86400_000),
    drawdown: maxDrawdown(s),
    vol: volatility(monthlyReturns(s)),
    cagr: cagr(s),
    worst,
    bad: windows.length >= 12 ? quantile(windows.map((w) => w.ret), 0.05) : null,
    windows,
    proxied: bt.proxied,
  };
}

/** Prezzi in euro: divide per il cambio del giorno (EUR→valuta). */
export function toEur(prices: Series | undefined, fx: Series | undefined): Series | undefined {
  if (!prices || !fx?.length) return prices;
  let j = 0;
  let rate = fx[0][1];
  return prices.map(([d, p]) => {
    while (j < fx.length && fx[j][0] <= d) rate = fx[j++][1];
    return [d, p / rate] as [string, number];
  });
}
