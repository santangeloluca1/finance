import type { PositionView } from "./analytics";
import type { Instrument, Transaction } from "./engine/types";
import { priceOn } from "./recurring";

/**
 * Cosa ha mosso il rendimento in un periodo: per ogni titolo, anche se venduto
 * nel frattempo, il guadagno in euro e la sua variazione.
 * Guadagno = valore oggi − valore a inizio periodo − acquisti + vendite del periodo.
 * Cedole e dividendi non sono compresi.
 */
export interface Contribution {
  isin: string;
  instrument: Instrument;
  /** Guadagno o perdita nel periodo, in euro. */
  change: number;
  /** Variazione rispetto al capitale nel titolo (valore iniziale + acquisti). */
  pct: number;
  /** Quanto ha mosso il portafoglio: guadagno sul capitale di tutti i titoli nel periodo. */
  share: number;
  /** Non più in portafoglio oggi. */
  sold: boolean;
}

const dayBefore = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);

export function contributions(
  from: string | "oggi",
  views: PositionView[],
  transactions: Transaction[],
  instruments: Instrument[],
  priceSeries: Record<string, [string, number][]>,
  fxSeries: Record<string, [string, number][]>,
): Contribution[] {
  const byIsin = new Map(instruments.map((i) => [i.isin, i]));
  const now = new Map<string, { value: number; day: number; prev: number }>();
  for (const v of views) {
    const cur = now.get(v.instrument.isin) ?? { value: 0, day: 0, prev: 0 };
    now.set(v.instrument.isin, { value: cur.value + v.value, day: cur.day + v.dayChange, prev: cur.prev + v.value - v.dayChange });
  }

  const rows: (Omit<Contribution, "share"> & { capital: number })[] = [];
  if (from === "oggi") {
    for (const [isin, n] of now) {
      const instrument = byIsin.get(isin);
      if (instrument) rows.push({ isin, instrument, change: n.day, pct: n.prev > 0 ? n.day / n.prev : 0, sold: false, capital: n.prev });
    }
  } else {
    const startDay = dayBefore(from);
    const isins = new Set([...now.keys(), ...transactions.filter((t) => (t.type === "buy" || t.type === "sell") && t.date >= from).map((t) => t.isin)]);
    for (const isin of isins) {
      const instrument = byIsin.get(isin);
      if (!instrument) continue;
      let qtyStart = 0;
      let buys = 0;
      let sells = 0;
      for (const t of transactions.filter((x) => x.isin === isin).sort((a, b) => a.date.localeCompare(b.date))) {
        const amount = ((t.quantity ?? 0) * (t.price ?? 0)) / (t.fxRate ?? 1);
        if (t.date < from) {
          if (t.type === "buy") qtyStart += t.quantity ?? 0;
          else if (t.type === "sell") qtyStart -= t.quantity ?? 0;
          else if (t.type === "split") qtyStart *= t.splitRatio ?? 1;
        } else if (t.type === "buy") buys += amount + (t.fees ?? 0);
        else if (t.type === "sell") sells += amount - (t.fees ?? 0);
      }
      let startValue = 0;
      if (qtyStart > 1e-9) {
        const p = priceOn(priceSeries[instrument.ticker], startDay);
        const fx = instrument.currency === "EUR" ? 1 : priceOn(fxSeries[instrument.currency], startDay);
        // Senza prezzo di inizio periodo il titolo non si può misurare: meglio saltarlo che inventare.
        if (!p || !fx) continue;
        startValue = (qtyStart * p) / fx;
      }
      const end = now.get(isin)?.value ?? 0;
      const change = end + sells - startValue - buys;
      const capital = startValue + buys;
      if (Math.abs(change) < 0.005 && capital === 0) continue;
      rows.push({ isin, instrument, change, pct: capital > 0 ? change / capital : 0, sold: !now.has(isin), capital });
    }
  }

  // Base per il contributo in punti: capitale di tutti i titoli nel periodo.
  const base = rows.reduce((a, r) => a + r.capital, 0);
  return rows.map(({ capital: _, ...r }) => ({ ...r, share: base > 0 ? r.change / base : 0 })).sort((a, b) => b.change - a.change);
}
