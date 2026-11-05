import type { AssetClass, IncomeKind, Instrument } from "./types";

/** Aliquota ordinaria su redditi finanziari. */
export const TAX_RATE = 0.26;

/**
 * Per i titoli di Stato (white list) la base imponibile è ridotta al 48,08%,
 * così che 26% × 48,08% = 12,5%.
 */
export const GOV_BOND_TAXABLE_FRACTION = 0.4808;

/** Le minusvalenze si possono usare fino al 31/12 del quarto anno successivo. */
export const LOSS_CARRY_YEARS = 4;

const ETF_CLASSES: AssetClass[] = ["etf_azionario", "etf_obbligazionario"];

export function isFundLike(instrument: Instrument): boolean {
  return ETF_CLASSES.includes(instrument.assetClass);
}

/**
 * Frazione della plus/minus che concorre alla base imponibile.
 * 1 per strumenti ordinari, 0,4808 per titoli di Stato puri,
 * proporzionale per ETF con una quota di titoli di Stato.
 */
export function taxableFraction(instrument: Instrument): number {
  const share = clamp01(instrument.govBondShare ?? 0);
  return 1 - share * (1 - GOV_BOND_TAXABLE_FRACTION);
}

/** Aliquota effettiva sulla plusvalenza dello strumento (es. 12,5% per BTP). */
export function effectiveRate(instrument: Instrument): number {
  return TAX_RATE * taxableFraction(instrument);
}

/**
 * Le plusvalenze da ETF sono redditi di capitale (non compensabili);
 * tutte le minusvalenze e le plus da altri strumenti sono redditi diversi.
 */
export function incomeKind(instrument: Instrument, gain: number): IncomeKind {
  if (gain > 0 && isFundLike(instrument)) return "redditi_capitale";
  return "redditi_diversi";
}

/** Ultimo giorno utile per compensare una minus realizzata in `date`. */
export function lossExpiry(date: string): string {
  const year = Number(date.slice(0, 4));
  return `${year + LOSS_CARRY_YEARS}-12-31`;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
