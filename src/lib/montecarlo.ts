/**
 * Simulazione Monte Carlo del patrimonio futuro.
 *
 * I mesi si pescano dalla storia reale dei mercati a blocchi di 12 mesi
 * consecutivi (così crisi e recuperi restano in sequenza, come sono andati),
 * poi si riportano al rendimento atteso del piano: la storia dà la forma e
 * l'ampiezza delle oscillazioni, non la media, che dipende dal decennio scelto.
 * Generatore con seme fisso: a parità di dati i numeri non cambiano a ogni apertura.
 * Modulo puro (testato).
 */

/** Generatore pseudo-casuale veloce con seme (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scarti mensili del portafoglio rispetto alla propria media storica:
 * per ogni mese, la somma pesata degli scarti dei gruppi.
 */
export function portfolioShocks(groups: { weight: number; returns: number[] }[]) {
  const live = groups.filter((g) => g.weight > 0 && g.returns.length);
  const n = Math.min(...live.map((g) => g.returns.length));
  if (!live.length || !Number.isFinite(n) || n < 24) return null;
  const tot = live.reduce((a, g) => a + g.weight, 0);
  const parts = live.map((g) => {
    const r = g.returns.slice(-n);
    const mean = r.reduce((a, b) => a + b, 0) / n;
    return { w: g.weight / tot, r, mean };
  });
  return Array.from({ length: n }, (_, t) => parts.reduce((a, p) => a + p.w * (p.r[t] - p.mean), 0));
}

export interface SimInput {
  start: number;
  monthly: number;
  months: number;
  /** Rendimento annuo atteso (composto). */
  rate: number;
  /** Scarti mensili storici del portafoglio (media zero). */
  shocks: number[];
  /** Orizzonti (in mesi) per cui servono i rendimenti annui di ogni percorso. */
  horizons?: number[];
  paths?: number;
  seed?: number;
  block?: number;
}

export interface SimResult {
  /** Percentili del valore mese per mese (indice 0 = oggi). */
  p10: number[];
  p50: number[];
  p90: number[];
  /** Quota di percorsi che finiscono sotto quanto versato. */
  belowPaid: number;
  /** Per ogni orizzonte, i rendimenti annui composti dei percorsi, in ordine crescente. */
  rates: Map<number, Float64Array>;
  paths: number;
}

export function simulate({ start, monthly, months, rate, shocks, horizons = [], paths = 4000, seed = 20261110, block = 12 }: SimInput): SimResult {
  const n = shocks.length;
  const variance = shocks.reduce((a, s) => a + s * s, 0) / Math.max(1, n - 1);
  // Media aritmetica mensile tale che la crescita tipica (mediana) sia quella attesa.
  const mu = Math.pow(1 + rate, 1 / 12) - 1 + variance / 2;
  const rand = rng(seed);
  const values = Array.from({ length: months + 1 }, () => new Float64Array(paths));
  const want = [...new Set(horizons.filter((h) => h > 0 && h <= months))];
  const rates = new Map(want.map((h) => [h, new Float64Array(paths)]));
  const paid = start + monthly * months;
  let below = 0;

  for (let p = 0; p < paths; p++) {
    let v = start;
    let growth = 1;
    let pos = 0;
    let left = 0;
    values[0][p] = v;
    for (let m = 1; m <= months; m++) {
      if (left === 0) {
        pos = Math.floor(rand() * n);
        left = block;
      }
      const r = Math.max(-0.95, mu + shocks[pos]);
      pos = (pos + 1) % n;
      left--;
      v = v * (1 + r) + monthly;
      growth *= 1 + r;
      values[m][p] = v;
      const slot = rates.get(m);
      if (slot) slot[p] = Math.pow(growth, 12 / m) - 1;
    }
    if (v < paid) below++;
  }

  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];
  for (const col of values) {
    col.sort();
    p10.push(col[Math.floor(0.1 * (paths - 1))]);
    p50.push(col[Math.floor(0.5 * (paths - 1))]);
    p90.push(col[Math.floor(0.9 * (paths - 1))]);
  }
  for (const r of rates.values()) r.sort();
  return { p10, p50, p90, belowPaid: below / paths, rates, paths };
}

/** Quota di valori (ordinati) maggiori o uguali a x. */
export function shareAtLeast(sorted: Float64Array, x: number) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return (sorted.length - lo) / sorted.length;
}

/** Valore al quantile q di un elenco ordinato. */
export function at(sorted: Float64Array, q: number) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

/**
 * Il rendimento annuo minimo con cui `ok(r)` diventa vero, per bisezione
 * (si assume che rendere di più non peggiori mai le cose).
 */
export function minRate(ok: (r: number) => boolean, lo = -0.3, hi = 0.4) {
  if (ok(lo)) return lo;
  if (!ok(hi)) return Infinity;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
