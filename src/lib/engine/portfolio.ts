import {
  TAX_RATE,
  incomeKind,
  lossExpiry,
  taxableFraction,
} from "./tax";
import type {
  AccountId,
  Instrument,
  LossLot,
  PortfolioState,
  Position,
  RealizedEvent,
  Transaction,
} from "./types";

/** Tolleranza per considerare chiusa una posizione (quote frazionarie). */
const EPSILON = 1e-9;

export class PortfolioError extends Error {}

type InstrumentMap = Map<string, Instrument>;

function key(account: AccountId, isin: string) {
  return `${account}|${isin}`;
}

function toEur(amount: number, fxRate = 1) {
  return amount / fxRate;
}

/** Ordina per data; a parità di data mantiene l'ordine di inserimento. */
export function sortTransactions(txs: Transaction[]): Transaction[] {
  return txs
    .map((tx, i) => ({ tx, i }))
    .sort((a, b) => a.tx.date.localeCompare(b.tx.date) || a.i - b.i)
    .map(({ tx }) => tx);
}

/**
 * Ricostruisce il portafoglio applicando il metodo del costo medio ponderato
 * (art. 68 TUIR), separatamente per ogni conto/intermediario, come fanno le
 * banche in regime amministrato.
 */
export function buildPortfolio(
  transactions: Transaction[],
  instruments: Instrument[],
  options: { asOf?: string } = {},
): PortfolioState {
  const byIsin: InstrumentMap = new Map(instruments.map((i) => [i.isin, i]));
  const positions = new Map<string, Position>();
  const realized: RealizedEvent[] = [];
  const losses: LossLot[] = [];
  const incomeByYear: Record<string, number> = {};
  const cash: PortfolioState["cash"] = {};

  for (const tx of sortTransactions(transactions)) {
    if (options.asOf && tx.date > options.asOf) break;
    if (tx.type === "cash") {
      cash[tx.account] = { date: tx.date, amount: tx.amount ?? 0 };
      continue;
    }
    const instrument = byIsin.get(tx.isin);
    if (!instrument) throw new PortfolioError(`Strumento sconosciuto: ${tx.isin}`);
    const k = key(tx.account, tx.isin);
    let pos = positions.get(k);

    switch (tx.type) {
      case "buy": {
        const qty = requirePositive(tx.quantity, tx, "quantity");
        const price = requireNonNegative(tx.price, tx, "price");
        const cost = toEur(qty * price, tx.fxRate) + (tx.fees ?? 0);
        if (!pos || pos.quantity <= EPSILON) {
          pos = {
            account: tx.account,
            isin: tx.isin,
            quantity: 0,
            totalCost: 0,
            avgCost: 0,
            income: pos?.income ?? 0,
            firstBuy: tx.date,
          };
          positions.set(k, pos);
        }
        pos.quantity += qty;
        pos.totalCost += cost;
        pos.avgCost = pos.totalCost / pos.quantity;
        break;
      }

      case "sell": {
        const qty = requirePositive(tx.quantity, tx, "quantity");
        const price = requireNonNegative(tx.price, tx, "price");
        if (!pos || pos.quantity + EPSILON < qty) {
          throw new PortfolioError(
            `Vendita di ${qty} ${tx.isin} su ${tx.account} il ${tx.date}: quantità disponibile ${pos?.quantity ?? 0}`,
          );
        }
        const proceeds = toEur(qty * price, tx.fxRate) - (tx.fees ?? 0);
        const event = realize({
          instrument,
          account: tx.account,
          date: tx.date,
          quantity: qty,
          avgCost: pos.avgCost,
          proceeds,
          losses,
          commit: true,
        });
        realized.push({ txId: tx.id, isin: tx.isin, ...event });

        pos.quantity -= qty;
        pos.totalCost -= pos.avgCost * qty;
        if (pos.quantity <= EPSILON) {
          pos.quantity = 0;
          pos.totalCost = 0;
        }
        break;
      }

      case "dividend": {
        const amount = tx.amount ?? 0;
        if (pos) pos.income += amount;
        else
          positions.set(k, {
            account: tx.account,
            isin: tx.isin,
            quantity: 0,
            totalCost: 0,
            avgCost: 0,
            income: amount,
            firstBuy: tx.date,
          });
        const year = tx.date.slice(0, 4);
        incomeByYear[year] = (incomeByYear[year] ?? 0) + amount;
        break;
      }

      case "split": {
        const ratio = requirePositive(tx.splitRatio, tx, "splitRatio");
        if (pos && pos.quantity > EPSILON) {
          pos.quantity *= ratio;
          pos.avgCost = pos.totalCost / pos.quantity;
        }
        break;
      }
    }
  }

  return {
    positions: [...positions.values()],
    realized,
    losses,
    incomeByYear,
    cash,
  };
}

interface RealizeInput {
  instrument: Instrument;
  account: AccountId;
  date: string;
  quantity: number;
  avgCost: number;
  proceeds: number;
  losses: LossLot[];
  /** Se false non modifica lo zainetto (usato dal simulatore). */
  commit: boolean;
}

function realize(input: RealizeInput): Omit<RealizedEvent, "txId" | "isin"> {
  const { instrument, account, date, quantity, avgCost, proceeds, losses } = input;
  const gain = proceeds - avgCost * quantity;
  const kind = incomeKind(instrument, gain);
  const taxableGain = gain * taxableFraction(instrument);
  let lossesUsed = 0;
  let tax = 0;

  if (taxableGain < 0) {
    if (input.commit) {
      losses.push({
        account,
        date,
        amount: -taxableGain,
        remaining: -taxableGain,
        expires: lossExpiry(date),
        sourceIsin: instrument.isin,
      });
    }
  } else if (kind === "redditi_diversi") {
    // Compensa con le minus più vecchie ancora valide sullo stesso conto.
    let toOffset = taxableGain;
    for (const lot of usableLosses(losses, account, date)) {
      if (toOffset <= 0) break;
      const used = Math.min(lot.remaining, toOffset);
      if (input.commit) lot.remaining -= used;
      toOffset -= used;
      lossesUsed += used;
    }
    tax = toOffset * TAX_RATE;
  } else {
    tax = taxableGain * TAX_RATE;
  }

  return {
    date,
    account,
    quantity,
    avgCost,
    proceeds,
    gain,
    kind,
    taxableGain,
    lossesUsed,
    tax: round2(tax),
  };
}

/** Minus utilizzabili su un conto a una certa data, dalla più vecchia. */
export function usableLosses(losses: LossLot[], account: AccountId, date: string) {
  return losses
    .filter((l) => l.account === account && l.remaining > EPSILON && l.expires >= date && l.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface SaleSimulation {
  quantity: number;
  gross: number;
  proceeds: number;
  gain: number;
  kind: RealizedEvent["kind"];
  lossesUsed: number;
  /** Minus che verrebbe aggiunta allo zainetto (se la vendita è in perdita). */
  lossCreated: number;
  tax: number;
  net: number;
}

/**
 * Simula la vendita di `quantity` quote al prezzo indicato, senza modificare
 * lo stato: quante tasse pagherei e quanto incasserei?
 */
export function simulateSale(
  state: PortfolioState,
  instrument: Instrument,
  account: AccountId,
  quantity: number,
  price: number,
  opts: { fxRate?: number; fees?: number; date?: string } = {},
): SaleSimulation {
  const pos = state.positions.find((p) => p.account === account && p.isin === instrument.isin);
  if (!pos || pos.quantity + EPSILON < quantity) {
    throw new PortfolioError("Quantità non disponibile per la simulazione");
  }
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const gross = toEur(quantity * price, opts.fxRate);
  const proceeds = gross - (opts.fees ?? 0);
  const ev = realize({
    instrument,
    account,
    date,
    quantity,
    avgCost: pos.avgCost,
    proceeds,
    losses: state.losses,
    commit: false,
  });
  return {
    quantity,
    gross,
    proceeds,
    gain: ev.gain,
    kind: ev.kind,
    lossesUsed: ev.lossesUsed,
    lossCreated: ev.taxableGain < 0 ? -ev.taxableGain : 0,
    tax: ev.tax,
    net: proceeds - ev.tax,
  };
}

function requirePositive(v: number | undefined, tx: Transaction, field: string): number {
  if (v === undefined || !(v > 0)) {
    throw new PortfolioError(`Transazione ${tx.id}: "${field}" deve essere > 0`);
  }
  return v;
}

function requireNonNegative(v: number | undefined, tx: Transaction, field: string): number {
  if (v === undefined || v < 0) {
    throw new PortfolioError(`Transazione ${tx.id}: "${field}" mancante o negativo`);
  }
  return v;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
