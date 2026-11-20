import { sortTransactions } from "./engine/portfolio";
import type { Account, AccountId, Transaction } from "./engine/types";

/**
 * Spese ricavate dai saldi. Su un conto usato anche per le spese quotidiane
 * non si registrano i singoli pagamenti: a ogni stipendio si inserisce il saldo
 * che si legge nell'app della banca, e tra due saldi
 *
 *   spese = saldo precedente + entrate − investito − saldo attuale
 *
 * dove "investito" sono i soldi spostati verso altri conti o messi in titoli
 * (al netto di quelli rientrati). Il resto è uscito: pagamenti, prelievi, bollette.
 */

export interface SpendingPeriod {
  account: AccountId;
  /** Data del saldo di partenza (YYYY-MM-DD). */
  from: string;
  /** Data del saldo di arrivo. */
  to: string;
  /** Versamenti (stipendio) e dividendi accreditati sul conto. */
  income: number;
  /** Bonifici verso altri conti e acquisti di titoli, al netto di rientri e vendite. */
  invested: number;
  /** Uscite ricavate dalla differenza di saldo. */
  spent: number;
  /** Variazione del saldo: quanto è rimasto in più (o in meno) sul conto. */
  saved: number;
}

export interface SpendingMonth {
  /** Mese del saldo che chiude il periodo (YYYY-MM). */
  month: string;
  from: string;
  to: string;
  income: number;
  invested: number;
  spent: number;
  saved: number;
}

export interface SpendingSummary {
  months: number;
  income: number;
  invested: number;
  spent: number;
  saved: number;
  /** Quota delle entrate non spesa (investita o rimasta sul conto). */
  savingsRate: number | null;
}

export const spendingAccounts = (accounts: Account[]) => accounts.filter((a) => a.spending);

export const isSpendingAccount = (accounts: Account[], id: AccountId) => accounts.some((a) => a.id === id && a.spending);

/** Effetto di un movimento sul conto: entrate e soldi spostati verso gli investimenti. */
function flows(tx: Transaction, account: AccountId): { income: number; invested: number } {
  const amount = tx.amount ?? 0;
  if (tx.type === "transfer") {
    if (tx.account === account) return { income: 0, invested: amount };
    if (tx.toAccount === account) return { income: 0, invested: -amount };
    return { income: 0, invested: 0 };
  }
  if (tx.account !== account) return { income: 0, invested: 0 };
  switch (tx.type) {
    case "deposit":
    case "dividend":
      return { income: amount, invested: 0 };
    case "buy":
      return { income: 0, invested: ((tx.quantity ?? 0) * (tx.price ?? 0)) / (tx.fxRate ?? 1) + (tx.fees ?? 0) };
    case "sell":
      return { income: 0, invested: -(((tx.quantity ?? 0) * (tx.price ?? 0)) / (tx.fxRate ?? 1) - (tx.fees ?? 0)) };
    default:
      // I prelievi non hanno una voce: finiscono nelle spese tramite il saldo.
      return { income: 0, invested: 0 };
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Periodi tra due saldi consecutivi di un conto, dal più vecchio. */
export function spendingPeriods(transactions: Transaction[], account: AccountId): SpendingPeriod[] {
  const sorted = sortTransactions(transactions);
  const out: SpendingPeriod[] = [];
  let start: Transaction | null = null;
  let income = 0;
  let invested = 0;
  for (const tx of sorted) {
    if (tx.type === "cash" && tx.account === account) {
      if (start) {
        const s0 = start.amount ?? 0;
        const s1 = tx.amount ?? 0;
        out.push({
          account,
          from: start.date,
          to: tx.date,
          income: round2(income),
          invested: round2(invested),
          spent: round2(s0 + income - invested - s1),
          saved: round2(s1 - s0),
        });
      }
      start = tx;
      income = 0;
      invested = 0;
      continue;
    }
    if (!start) continue;
    const f = flows(tx, account);
    income += f.income;
    invested += f.invested;
  }
  return out;
}

/** Movimenti dall'ultimo saldo a oggi: le spese si sapranno al prossimo saldo. */
export function openPeriod(transactions: Transaction[], account: AccountId) {
  const sorted = sortTransactions(transactions);
  let start: Transaction | null = null;
  let income = 0;
  let invested = 0;
  for (const tx of sorted) {
    if (tx.type === "cash" && tx.account === account) {
      start = tx;
      income = 0;
      invested = 0;
      continue;
    }
    if (!start) continue;
    const f = flows(tx, account);
    income += f.income;
    invested += f.invested;
  }
  return start ? { account, from: start.date, balance: start.amount ?? 0, income: round2(income), invested: round2(invested) } : null;
}

/**
 * Riepilogo mensile di tutti i conti di spesa. Ogni periodo va nel mese del
 * saldo che lo chiude; più periodi nello stesso mese si sommano. I bonifici tra
 * due conti di spesa si annullano nella somma.
 */
export function spendingByMonth(transactions: Transaction[], accounts: Account[]): SpendingMonth[] {
  const byMonth = new Map<string, SpendingMonth>();
  for (const a of spendingAccounts(accounts)) {
    for (const p of spendingPeriods(transactions, a.id)) {
      const month = p.to.slice(0, 7);
      const m = byMonth.get(month) ?? { month, from: p.from, to: p.to, income: 0, invested: 0, spent: 0, saved: 0 };
      m.from = p.from < m.from ? p.from : m.from;
      m.to = p.to > m.to ? p.to : m.to;
      m.income = round2(m.income + p.income);
      m.invested = round2(m.invested + p.invested);
      m.spent = round2(m.spent + p.spent);
      m.saved = round2(m.saved + p.saved);
      byMonth.set(month, m);
    }
  }
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** Totali e media degli ultimi `n` mesi (dal più recente). */
export function spendingSummary(months: SpendingMonth[], n = 12): SpendingSummary | null {
  const last = months.slice(0, n);
  if (!last.length) return null;
  const sum = (k: "income" | "invested" | "spent" | "saved") => round2(last.reduce((a, m) => a + m[k], 0));
  const income = sum("income");
  const spent = sum("spent");
  return {
    months: last.length,
    income,
    invested: sum("invested"),
    spent,
    saved: sum("saved"),
    savingsRate: income > 0 ? (income - spent) / income : null,
  };
}
