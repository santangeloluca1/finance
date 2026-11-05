import type { Transaction } from "./engine/types";

export interface Pac {
  monthly: number;
  installments: number;
  since: string;
  last: string;
}

/**
 * Riconosce un piano di accumulo: almeno 3 acquisti dello stesso titolo sullo
 * stesso conto a circa un mese di distanza (20-40 giorni) con importi simili.
 */
export function detectPac(transactions: Transaction[], isin: string, account: string): Pac | null {
  const buys = transactions
    .filter((t) => t.type === "buy" && t.isin === isin && t.account === account)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({ date: t.date, amount: ((t.quantity ?? 0) * (t.price ?? 0)) / (t.fxRate ?? 1) + (t.fees ?? 0) }));
  if (buys.length < 3) return null;
  // Cerca la sequenza mensile più lunga che termina con l'ultimo acquisto.
  let run = [buys[buys.length - 1]];
  for (let i = buys.length - 2; i >= 0; i--) {
    const gap = (Date.parse(run[0].date) - Date.parse(buys[i].date)) / 86400_000;
    if (gap < 20 || gap > 40) break;
    run = [buys[i], ...run];
  }
  if (run.length < 3) return null;
  const avg = run.reduce((a, b) => a + b.amount, 0) / run.length;
  if (run.some((b) => Math.abs(b.amount - avg) / avg > 0.35)) return null;
  return { monthly: avg, installments: run.length, since: run[0].date, last: run[run.length - 1].date };
}
