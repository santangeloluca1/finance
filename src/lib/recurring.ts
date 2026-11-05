import type { AccountId, Transaction } from "./engine/types";

/**
 * Operazioni ricorrenti (stipendio, bonifici, PAC). Non registrano mai nulla
 * da sole: a ogni scadenza preparano una rata "da confermare", precompilata
 * con una stima che l'utente conferma, corregge o salta.
 */

export type RecurringKind = "deposit" | "transfer" | "pac";

/** Cosa fare se il giorno cade di sabato, domenica o festivo di Borsa. */
export type HolidayRule = "same" | "next" | "previous";

export interface RecurringPlan {
  id: string;
  kind: RecurringKind;
  /** Nome mostrato, es. "Stipendio", "PAC MSCI World". */
  label: string;
  /** Giorno del mese (1-31; nei mesi più corti diventa l'ultimo giorno). */
  day: number;
  holiday: HolidayRule;
  /** Conto che riceve (versamento, PAC) o da cui parte il bonifico. */
  account: AccountId;
  /** Conto di destinazione del bonifico. */
  toAccount?: AccountId;
  /** Versamento: importo indicativo; bonifico: importo fisso. */
  amount?: number;
  /** PAC: titolo e importo massimo per rata (quote intere). */
  isin?: string;
  budget?: number;
  /** Prima scadenza da proporre (YYYY-MM-DD): i mesi precedenti sono già registrati. */
  since: string;
  active: boolean;
}

export interface Occurrence {
  /** Identificativo stabile della rata: `${planId}:${YYYY-MM}`. */
  id: string;
  plan: RecurringPlan;
  /** Data prevista, già spostata per festivi se richiesto. */
  date: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Pasqua (algoritmo di Gauss/Meeus), in UTC. */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Giorni di chiusura di Borsa Italiana (oltre ai weekend). */
export function marketHolidays(year: number): Set<string> {
  const e = easter(year);
  const shift = (days: number) => iso(new Date(e.getTime() + days * 86400_000));
  return new Set([
    `${year}-01-01`,
    shift(-2), // Venerdì Santo
    shift(1), // Lunedì dell'Angelo
    `${year}-05-01`,
    `${year}-08-15`,
    `${year}-12-24`,
    `${year}-12-25`,
    `${year}-12-26`,
    `${year}-12-31`,
  ]);
}

export function isBusinessDay(date: string): boolean {
  const d = new Date(`${date}T12:00:00Z`);
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !marketHolidays(d.getUTCFullYear()).has(date);
}

function addDays(date: string, n: number) {
  return iso(new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000));
}

/** Data della rata nel mese indicato (YYYY-MM), con la regola sui festivi. */
export function dueDate(plan: Pick<RecurringPlan, "day" | "holiday">, month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let d = `${month}-${String(Math.min(plan.day, last)).padStart(2, "0")}`;
  if (plan.holiday === "same") return d;
  const step = plan.holiday === "next" ? 1 : -1;
  while (!isBusinessDay(d)) d = addDays(d, step);
  return d;
}

/** Rate scadute (data <= oggi) dal mese di partenza in poi. */
export function occurrences(plan: RecurringPlan, today: string): Occurrence[] {
  if (!plan.active) return [];
  const out: Occurrence[] = [];
  let [y, m] = plan.since.slice(0, 7).split("-").map(Number);
  for (let guard = 0; guard < 120; guard++) {
    const month = `${y}-${String(m).padStart(2, "0")}`;
    const date = dueDate(plan, month);
    if (date > today) break;
    if (date >= plan.since) out.push({ id: `${plan.id}:${month}`, plan, date });
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Rate da confermare: scadute, non ancora registrate e non saltate. */
export function pendingOccurrences(plans: RecurringPlan[], transactions: Transaction[], skipped: string[], today: string): Occurrence[] {
  const done = new Set(transactions.map((t) => t.plan).filter(Boolean));
  const skip = new Set(skipped);
  return plans
    .flatMap((p) => occurrences(p, today))
    .filter((o) => !done.has(o.id) && !skip.has(o.id))
    .sort((a, b) => a.date.localeCompare(b.date) || kindOrder(a.plan.kind) - kindOrder(b.plan.kind));
}

/** A parità di data: prima entrano i soldi, poi si spostano, poi si investono. */
function kindOrder(k: RecurringKind) {
  return k === "deposit" ? 0 : k === "transfer" ? 1 : 2;
}

/** Quote intere che stanno nel budget al prezzo indicato. */
export function pacQuantity(budget: number, price: number): number {
  return price > 0 ? Math.floor((budget + 1e-9) / price) : 0;
}

/** Importo proposto per un versamento: l'ultimo registrato con questo piano, altrimenti quello indicato. */
export function lastAmount(plan: RecurringPlan, transactions: Transaction[]): number | undefined {
  const last = transactions
    .filter((t) => t.plan?.startsWith(`${plan.id}:`) && t.type === "deposit")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return last?.amount ?? plan.amount;
}

/** Ultimo prezzo disponibile fino alla data (chiusura del giorno o precedente). */
export function priceOn(series: [string, number][] | undefined, date: string): number | undefined {
  if (!series?.length) return undefined;
  let p: number | undefined;
  for (const [d, v] of series) {
    if (d > date) break;
    p = v;
  }
  return p;
}
