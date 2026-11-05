import type { HistoryPoint } from "./analytics";
import type { Transaction } from "./engine/types";

/**
 * Rendimento ponderato nel tempo (TWR) giorno per giorno.
 * Il guadagno di ogni giorno (variazione di `gain`, che esclude versamenti e
 * prelievi) viene rapportato al valore di inizio giornata; i rendimenti
 * giornalieri si compongono. Restituisce la serie cumulata (0 = +0%).
 */
export function twrSeries(history: Pick<HistoryPoint, "date" | "value" | "gain">[]): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  let acc = 1;
  history.forEach((h, i) => {
    if (i > 0) {
      const prev = history[i - 1];
      if (prev.value > 0) acc *= 1 + (h.gain - prev.gain) / prev.value;
    }
    out.push({ date: h.date, value: acc - 1 });
  });
  return out;
}

/** Rendimenti mensili composti dalla serie TWR: chiave "YYYY-MM". */
export function monthlyReturns(twr: { date: string; value: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  let prevEnd = 0;
  for (let i = 0; i < twr.length; i++) {
    const m = twr[i].date.slice(0, 7);
    const lastOfMonth = i === twr.length - 1 || twr[i + 1].date.slice(0, 7) !== m;
    if (lastOfMonth) {
      out[m] = (1 + twr[i].value) / (1 + prevEnd) - 1;
      prevEnd = twr[i].value;
    }
  }
  return out;
}

export interface CashFlow {
  date: string;
  /** Negativo = soldi messi dentro, positivo = soldi tolti/incassati. */
  amount: number;
}

/**
 * Flussi di cassa dal punto di vista dell'investitore: acquisti e aumenti di
 * liquidità sono uscite (negative), vendite, cedole e diminuzioni di liquidità
 * sono entrate. Il valore finale va aggiunto come ultimo flusso positivo.
 */
export function cashFlows(transactions: Transaction[]): CashFlow[] {
  const lastCash = new Map<string, number>();
  const flows: CashFlow[] = [];
  for (const t of [...transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    const fx = t.fxRate ?? 1;
    if (t.type === "buy") flows.push({ date: t.date, amount: -((t.quantity ?? 0) * (t.price ?? 0)) / fx - (t.fees ?? 0) });
    else if (t.type === "sell") flows.push({ date: t.date, amount: ((t.quantity ?? 0) * (t.price ?? 0)) / fx - (t.fees ?? 0) });
    else if (t.type === "dividend") flows.push({ date: t.date, amount: t.amount ?? 0 });
    else if (t.type === "cash") {
      const prev = lastCash.get(t.account) ?? 0;
      const next = t.amount ?? 0;
      lastCash.set(t.account, next);
      if (next !== prev) flows.push({ date: t.date, amount: -(next - prev) });
    }
  }
  return flows;
}

/** Tasso interno di rendimento annuo (XIRR). Null se non calcolabile. */
export function xirr(flows: CashFlow[]): number | null {
  const fs = flows.filter((f) => f.amount !== 0);
  if (fs.length < 2 || !fs.some((f) => f.amount > 0) || !fs.some((f) => f.amount < 0)) return null;
  const t0 = Date.parse(fs[0].date);
  const years = fs.map((f) => (Date.parse(f.date) - t0) / (365.25 * 86400_000));
  const npv = (r: number) => fs.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, years[i]), 0);
  // Bisezione robusta tra -99% e +1000%.
  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (fLo * fHi > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/** Rendimento annualizzato da un rendimento cumulato su `days` giorni. */
export function annualize(total: number, days: number) {
  if (days < 365) return null;
  return Math.pow(1 + total, 365 / days) - 1;
}
