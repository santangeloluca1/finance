import type { Instrument, PortfolioState, Transaction } from "./engine/types";

export interface DividendEvent {
  date: string;
  isin: string;
  account: string;
  amount: number;
  /** true se è una stima basata sui pagamenti dell'anno precedente. */
  forecast: boolean;
}

/**
 * Cedole e dividendi incassati in un anno e, per l'anno in corso, previsione
 * dei pagamenti mancanti: si ripetono quelli dei 12 mesi precedenti per i
 * titoli ancora in portafoglio, con lo stesso importo.
 */
export function dividendsForYear(
  year: string,
  transactions: Transaction[],
  state: PortfolioState,
  instruments: Instrument[],
  today = new Date().toISOString().slice(0, 10),
): DividendEvent[] {
  const paid: DividendEvent[] = transactions
    .filter((t) => t.type === "dividend" && t.date.startsWith(year))
    .map((t) => ({ date: t.date, isin: t.isin, account: t.account, amount: t.amount ?? 0, forecast: false }));

  if (year !== today.slice(0, 4)) return paid;

  const held = new Map(state.positions.filter((p) => p.quantity > 0).map((p) => [`${p.account}|${p.isin}`, p.quantity]));
  const known = new Set(instruments.map((i) => i.isin));
  const forecast: DividendEvent[] = [];
  for (const t of transactions) {
    if (t.type !== "dividend" || !known.has(t.isin)) continue;
    const next = `${Number(t.date.slice(0, 4)) + 1}${t.date.slice(4)}`;
    if (!next.startsWith(year) || next <= today) continue;
    if (!held.has(`${t.account}|${t.isin}`)) continue;
    // Già pagato quest'anno nello stesso mese? Allora non serve stimarlo.
    if (paid.some((p) => p.isin === t.isin && p.account === t.account && p.date.slice(5, 7) === next.slice(5, 7))) continue;
    forecast.push({ date: next, isin: t.isin, account: t.account, amount: t.amount ?? 0, forecast: true });
  }
  return [...paid, ...forecast].sort((a, b) => a.date.localeCompare(b.date));
}

export interface DividendStat {
  isin: string;
  /** Incassato netto negli ultimi 12 mesi. */
  trailing: number;
  payments: number;
}

/** Cedole e dividendi netti degli ultimi 12 mesi per titolo. */
export function trailingDividends(transactions: Transaction[], today = new Date().toISOString().slice(0, 10)): DividendStat[] {
  const from = new Date(Date.parse(`${today}T12:00:00Z`) - 365 * 86400_000).toISOString().slice(0, 10);
  const map = new Map<string, DividendStat>();
  for (const t of transactions) {
    if (t.type !== "dividend" || t.date < from || t.date > today) continue;
    const s = map.get(t.isin) ?? { isin: t.isin, trailing: 0, payments: 0 };
    s.trailing += t.amount ?? 0;
    s.payments += 1;
    map.set(t.isin, s);
  }
  return [...map.values()].sort((a, b) => b.trailing - a.trailing);
}

/* ------------------------------------------------------------------ */
/* Dividendi staccati da confermare                                    */
/* ------------------------------------------------------------------ */

/** Stacchi recenti per ISIN: valuta e coppie [data di stacco, importo per azione]. */
export type DividendFeed = Record<string, { currency: string; dividends: [string, number][] }>;

/** Per quanti giorni dopo lo stacco si chiede di confermare l'accredito. */
export const PENDING_DAYS = 60;

/**
 * Ritenuta del Paese d'origine sui dividendi azionari pagati a un residente
 * italiano, come la applicano di solito le banche italiane (aliquote da
 * convenzione dove la banca le riconosce in automatico). Sui fondi e sugli
 * ETF non c'è ritenuta estera: il fondo incassa e distribuisce lordo.
 */
const FOREIGN_WITHHOLDING: Record<string, number> = {
  US: 0.15,
  DE: 0.26375,
  FR: 0.25,
  NL: 0.15,
  ES: 0.19,
  CH: 0.35,
  BE: 0.3,
  AT: 0.275,
  PT: 0.25,
  FI: 0.35,
  DK: 0.27,
  SE: 0.3,
  NO: 0.25,
  CA: 0.25,
};

export interface DividendTax {
  gross: number;
  /** Ritenuta del Paese d'origine. */
  foreign: number;
  /** Imposta italiana (26%, 12,5% sulla quota in titoli di Stato). */
  italian: number;
  net: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Lordo → netto: prima la ritenuta estera, poi l'imposta italiana sul resto. */
export function dividendTax(instrument: Instrument, gross: number): DividendTax {
  const stock = instrument.assetClass === "azione";
  const foreignRate = stock ? (FOREIGN_WITHHOLDING[instrument.isin.slice(0, 2)] ?? 0) : 0;
  const gov = Math.min(1, Math.max(0, instrument.govBondShare ?? 0));
  const italianRate = 0.26 * (1 - gov) + 0.125 * gov;
  const foreign = cents(gross * foreignRate);
  const italian = cents((gross - foreign) * italianRate);
  return { gross: cents(gross), foreign, italian, net: cents(gross - foreign - italian) };
}

export interface PendingDividend {
  id: string;
  isin: string;
  account: string;
  /** Data di stacco (ex-date). */
  exDate: string;
  /** Data di pagamento stimata. */
  payDate: string;
  /** Azioni possedute alla vigilia dello stacco. */
  quantity: number;
  /** Importo per azione nella valuta del titolo. */
  perShare: number;
  currency: string;
  tax: DividendTax;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Giorni lavorativi dopo una data (sabato e domenica esclusi). */
function addBusinessDays(d: string, n: number) {
  let out = d;
  while (n > 0) {
    out = addDays(out, 1);
    const wd = new Date(`${out}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) n--;
  }
  return out;
}

/**
 * Pagamento stimato: in Europa due giorni lavorativi dopo lo stacco (Borsa
 * Italiana, Xetra, Euronext); altrove, come negli Stati Uniti, qualche
 * settimana dopo.
 */
export function estimatedPayDate(isin: string, exDate: string) {
  const europe = ["IT", "DE", "FR", "NL", "ES", "BE", "AT", "PT", "FI", "IE", "LU", "DK", "SE", "NO", "CH"];
  return europe.includes(isin.slice(0, 2)) ? addBusinessDays(exDate, 2) : addDays(exDate, 14);
}

/** Quote possedute per conto alla chiusura del giorno prima dello stacco. */
function holdingsBefore(transactions: Transaction[], isin: string, exDate: string): Map<string, number> {
  const out = new Map<string, number>();
  const txs = transactions.filter((t) => t.isin === isin && t.date < exDate).sort((a, b) => a.date.localeCompare(b.date));
  for (const t of txs) {
    const q = out.get(t.account) ?? 0;
    if (t.type === "buy") out.set(t.account, q + (t.quantity ?? 0));
    else if (t.type === "sell") out.set(t.account, Math.max(0, q - (t.quantity ?? 0)));
    else if (t.type === "split" && t.splitRatio) out.set(t.account, q * t.splitRatio);
  }
  return out;
}

/**
 * Dividendi staccati sui titoli posseduti e non ancora registrati: compaiono
 * dalla data di pagamento stimata, per `PENDING_DAYS` giorni dallo stacco.
 * Un dividendo è già registrato se c'è una cedola dello stesso titolo e conto
 * tra pochi giorni prima dello stacco e la fine della finestra.
 */
export function pendingDividends(
  transactions: Transaction[],
  instruments: Instrument[],
  feed: DividendFeed,
  fx: Record<string, number>,
  today = new Date().toISOString().slice(0, 10),
): PendingDividend[] {
  const from = addDays(today, -PENDING_DAYS);
  const out: PendingDividend[] = [];
  for (const ins of instruments) {
    const f = feed[ins.isin];
    if (!f) continue;
    // Le borse di Londra quotano in pence.
    const pence = f.currency === "GBp" || f.currency === "GBX";
    const currency = pence ? "GBP" : f.currency || ins.currency;
    const rate = currency === "EUR" ? 1 : fx[currency];
    if (!rate || !Number.isFinite(rate)) continue;
    for (const [exDate, rawAmount] of f.dividends) {
      if (exDate < from || exDate > today || !(rawAmount > 0)) continue;
      const payDate = estimatedPayDate(ins.isin, exDate);
      if (payDate > today) continue;
      const perShare = pence ? rawAmount / 100 : rawAmount;
      for (const [account, quantity] of holdingsBefore(transactions, ins.isin, exDate)) {
        if (quantity <= 1e-9) continue;
        const recorded = transactions.some(
          (t) => t.type === "dividend" && t.isin === ins.isin && t.account === account && t.date >= addDays(exDate, -5) && t.date <= addDays(exDate, PENDING_DAYS),
        );
        if (recorded) continue;
        out.push({
          id: `dividendo-${account}-${ins.isin}-${exDate}`,
          isin: ins.isin,
          account,
          exDate,
          payDate,
          quantity,
          perShare,
          currency,
          tax: dividendTax(ins, (quantity * perShare) / rate),
        });
      }
    }
  }
  return out.sort((a, b) => a.exDate.localeCompare(b.exDate));
}

/** Indirizzo del modulo "Nuovo movimento" già compilato con il dividendo. */
export function pendingDividendHref(d: PendingDividend) {
  const p = new URLSearchParams({
    tipo: "dividend",
    conto: d.account,
    isin: d.isin,
    data: d.payDate,
    importo: d.tax.net.toFixed(2),
    lordo: d.tax.gross.toFixed(2),
    estera: d.tax.foreign.toFixed(2),
    quote: String(d.quantity),
    stacco: d.exDate,
  });
  return `/movimenti/nuovo?${p}`;
}

/**
 * Titoli di cui serve conoscere gli stacchi: quelli in portafoglio e quelli
 * con movimenti negli ultimi `PENDING_DAYS` giorni (venduti dopo lo stacco).
 */
export function dividendWatchlist(transactions: Transaction[], instruments: Instrument[], state: PortfolioState, today = new Date().toISOString().slice(0, 10)) {
  const from = addDays(today, -PENDING_DAYS - 5);
  const isins = new Set(state.positions.filter((p) => p.quantity > 0).map((p) => p.isin));
  for (const t of transactions) if (t.isin && t.date >= from && (t.type === "buy" || t.type === "sell")) isins.add(t.isin);
  return instruments.filter((i) => isins.has(i.isin) && i.assetClass !== "crypto" && i.assetClass !== "etc" && i.assetClass !== "certificato");
}
