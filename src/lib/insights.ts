/**
 * Statistiche e dividendi di un titolo, calcolati dallo storico dei prezzi e
 * dei pagamenti. Modulo puro (testato).
 */

const DAY = 86400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const shiftYears = (d: string, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`;

/** Ultimo prezzo disponibile a una data (o prima). */
function priceAt(series: [string, number][], date: string): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let ans: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= date) {
      ans = series[mid][1];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export interface PriceStats {
  high52: number;
  low52: number;
  /** Rendimento a 1 anno, e annualizzato a 3 e 5 anni (null se lo storico è più corto). */
  r1: number | null;
  r3: number | null;
  r5: number | null;
  /** Volatilità annualizzata dell'ultimo anno. */
  volatility: number | null;
  /** Calo massimo dal picco negli ultimi 5 anni (negativo) e quando è avvenuto. */
  maxDrawdown: number;
  drawdownDate: string | null;
  /** Rendimento per anno solare (gli ultimi 6, l'anno in corso fino a oggi). */
  years: { year: string; ret: number }[];
}

export function priceStats(series: [string, number][], price: number | null, today = iso(Date.now())): PriceStats | null {
  if (series.length < 20) return null;
  const last = price ?? series[series.length - 1][1];
  const ago = (y: number) => priceAt(series, shiftYears(today, -y));
  const first = series[0][0];
  const ret = (y: number) => {
    if (shiftYears(today, -y) < first) return null;
    const p = ago(y);
    return p ? Math.pow(last / p, 1 / y) - 1 : null;
  };

  const yearAgo = shiftYears(today, -1);
  const lastYear = series.filter(([d]) => d >= yearAgo).map(([, p]) => p);
  const window = lastYear.length ? [...lastYear, last] : [last];

  let volatility: number | null = null;
  if (lastYear.length > 30) {
    const rets = lastYear.slice(1).map((p, i) => Math.log(p / lastYear[i]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
    volatility = Math.sqrt(variance * 252);
  }

  let peak = -Infinity;
  let maxDrawdown = 0;
  let drawdownDate: string | null = null;
  for (const [d, p] of series.filter(([d]) => d >= shiftYears(today, -5))) {
    peak = Math.max(peak, p);
    const dd = p / peak - 1;
    if (dd < maxDrawdown) {
      maxDrawdown = dd;
      drawdownDate = d;
    }
  }

  const years: { year: string; ret: number }[] = [];
  const thisYear = Number(today.slice(0, 4));
  for (let y = thisYear - 5; y <= thisYear; y++) {
    const start = priceAt(series, `${y - 1}-12-31`);
    if (!start || `${y - 1}-12-31` < first) continue;
    const end = y === thisYear ? last : priceAt(series, `${y}-12-31`);
    if (end) years.push({ year: String(y), ret: end / start - 1 });
  }

  return { high52: Math.max(...window), low52: Math.min(...window), r1: ret(1), r3: ret(3), r5: ret(5), volatility, maxDrawdown, drawdownDate, years };
}

export interface DividendInfo {
  /** Somma degli ultimi 12 mesi, per azione. */
  trailing: number;
  /** Rendimento sugli ultimi 12 mesi rispetto al prezzo attuale. */
  yield: number | null;
  frequency: "mensile" | "trimestrale" | "semestrale" | "annuale" | "irregolare";
  /** Crescita media annua del dividendo negli ultimi anni completi (null se non calcolabile). */
  growth: number | null;
  growthYears: number;
  last: { date: string; amount: number } | null;
  /** Totale per anno solare. */
  byYear: { year: string; amount: number; estimate: number }[];
  /** Prossimi pagamenti stimati: stesse date e importi dell'anno scorso. */
  upcoming: { date: string; amount: number }[];
  /** Crescita media annua del dividendo su 1, 3, 5 e 10 anni (anni solari completi). */
  growthBy: { years: number; rate: number }[];
}

/** Giudizio sulla crescita del dividendo, come etichetta. */
export function growthLabel(rate: number) {
  return rate >= 0.1 ? "Forte crescita" : rate >= 0.03 ? "Crescita" : rate > -0.01 ? "Stabile" : "In calo";
}

export function dividendInfo(divs: [string, number][], price: number | null, today = iso(Date.now())): DividendInfo | null {
  if (!divs.length) return null;
  const yearAgo = shiftYears(today, -1);
  const lastYear = divs.filter(([d]) => d > yearAgo && d <= today);
  const trailing = lastYear.reduce((a, [, v]) => a + v, 0);
  const twoYears = divs.filter(([d]) => d > shiftYears(today, -2) && d <= today).length / 2;
  const frequency = twoYears >= 10 ? "mensile" : twoYears >= 3 ? "trimestrale" : twoYears >= 1.5 ? "semestrale" : twoYears >= 0.75 ? "annuale" : "irregolare";

  // Stima: ogni pagamento degli ultimi 12 mesi si ripete un anno dopo con lo stesso importo.
  const upcoming = lastYear
    .map(([d, v]) => ({ date: shiftYears(d, 1), amount: v }))
    .filter((u) => u.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const thisYear = Number(today.slice(0, 4));
  const totals = new Map<number, number>();
  for (const [d, v] of divs) totals.set(Number(d.slice(0, 4)), (totals.get(Number(d.slice(0, 4))) ?? 0) + v);
  const firstYear = Number(divs[0][0].slice(0, 4));
  const byYear: DividendInfo["byYear"] = [];
  for (let y = Math.max(firstYear, thisYear - 5); y <= thisYear; y++) {
    const est = y === thisYear ? upcoming.filter((u) => u.date.startsWith(String(y))).reduce((a, u) => a + u.amount, 0) : 0;
    byYear.push({ year: String(y), amount: totals.get(y) ?? 0, estimate: est });
  }

  // Crescita: tra il primo e l'ultimo anno completo con pagamenti (fino a 5 anni).
  const full = byYear.filter((b) => Number(b.year) < thisYear && b.amount > 0 && Number(b.year) > firstYear);
  let growth: number | null = null;
  let growthYears = 0;
  if (full.length >= 3) {
    const a = full[0];
    const b = full[full.length - 1];
    growthYears = Number(b.year) - Number(a.year);
    growth = Math.pow(b.amount / a.amount, 1 / growthYears) - 1;
  }

  // Crescita su più orizzonti: dall'anno completo n anni prima all'ultimo anno completo.
  const lastFull = thisYear - 1;
  const growthBy = [1, 3, 5, 10]
    .map((n) => {
      const a = totals.get(lastFull - n);
      const b = totals.get(lastFull);
      return a && b && lastFull - n > firstYear ? { years: n, rate: Math.pow(b / a, 1 / n) - 1 } : null;
    })
    .filter((g): g is { years: number; rate: number } => g !== null);

  const lastPay = divs.filter(([d]) => d <= today).at(-1);
  return {
    trailing,
    yield: price ? trailing / price : null,
    frequency,
    growth,
    growthYears,
    last: lastPay ? { date: lastPay[0], amount: lastPay[1] } : null,
    byYear,
    upcoming,
    growthBy,
  };
}

export { DAY };
