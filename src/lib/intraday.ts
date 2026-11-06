import type { FxRates, PositionView } from "./analytics";
import { romeClock } from "./notify";

export interface IntradaySeries {
  points: [string, number][];
  previousClose: number;
}

export interface PortfolioIntraday {
  /** Istanti ISO. */
  dates: string[];
  /** Valore degli investimenti in euro a ogni istante. */
  values: number[];
  /** Valore alla chiusura precedente: base della variazione. */
  base: number;
  /** La seduta mostrata è quella di oggi (altrimenti l'ultima disponibile). */
  today: boolean;
}

/**
 * Valore degli investimenti durante la giornata: per ogni istante somma
 * quantità × ultimo prezzo noto di ogni titolo (convertito in euro). Prima del
 * primo prezzo di un titolo vale la chiusura di ieri; i titoli senza dati
 * restano fermi al prezzo di ieri e passano al prezzo attuale con l'ultimo punto.
 */
export function portfolioIntraday(views: PositionView[], series: Record<string, IntradaySeries>, fx: FxRates, now = Date.now()): PortfolioIntraday {
  const rows = views.map((v) => {
    const rate = v.instrument.currency === "EUR" ? 1 : fx[v.instrument.currency] ?? NaN;
    const qty = v.position.quantity;
    const priceEur = qty ? v.value / qty : 0;
    const prevEur = qty ? (v.value - v.dayChange) / qty : 0;
    const s = series[v.instrument.ticker];
    const usable = !v.stale && s?.points.length && Number.isFinite(rate);
    // La variazione resta quella delle quotazioni dell'app: la serie della borsa ne dà solo la forma.
    const prevSeries = usable ? s!.previousClose / rate || s!.points[0][1] / rate : 0;
    const scale = usable && prevSeries ? prevEur / prevSeries : 1;
    const points = usable ? s!.points.map(([d, p]) => [Date.parse(d), (p / rate) * scale] as [number, number]) : [];
    return { qty, priceEur, prevEur, points, j: 0, last: prevEur };
  });
  const base = rows.reduce((a, r) => a + r.qty * r.prevEur, 0);
  const current = rows.reduce((a, r) => a + r.qty * r.priceEur, 0);
  const times = [...new Set(rows.flatMap((r) => r.points.map((p) => p[0])))].filter((t) => t < now - 60_000).sort((a, b) => a - b);
  if (!times.length) return { dates: [], values: [], base, today: false };

  const dates: string[] = [];
  const values: number[] = [];
  for (const t of times) {
    let total = 0;
    for (const r of rows) {
      while (r.j < r.points.length && r.points[r.j][0] <= t) r.last = r.points[r.j++][1];
      total += r.qty * r.last;
    }
    dates.push(new Date(t).toISOString());
    values.push(total);
  }
  // Seduta di oggi: l'ultimo punto sono le quotazioni attuali, così il grafico finisce sul totale mostrato.
  // Prima dell'apertura si vede l'ultima seduta così com'è, senza mescolare prezzi di giorni diversi.
  const today = romeClock(new Date(times[times.length - 1])).date === romeClock(new Date(now)).date;
  if (today) {
    dates.push(new Date(Math.max(now, times[times.length - 1] + 60_000)).toISOString());
    values.push(current);
  }
  return { dates, values, base, today };
}

/** Allinea un'altra serie intraday (es. un indice) agli istanti del portafoglio: rendimento sulla chiusura di ieri. */
export function alignIntraday(dates: string[], s: IntradaySeries | null | undefined): (number | null)[] | undefined {
  if (!s?.points.length) return undefined;
  const base = s.previousClose || s.points[0][1];
  let j = 0;
  let last: number | null = null;
  return dates.map((d) => {
    const t = Date.parse(d);
    while (j < s.points.length && Date.parse(s.points[j][0]) <= t) last = s.points[j++][1];
    return last === null ? 0 : last / base - 1;
  });
}
