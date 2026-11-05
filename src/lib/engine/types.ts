/**
 * Modello dati del portafoglio.
 *
 * Il registro delle transazioni è l'unica fonte di verità: posizioni,
 * prezzo medio di carico, plus/minus e zainetto fiscale sono sempre
 * ricalcolati a partire da qui.
 */

export type AccountId = string; // es. "fineco", "isybank", "revolut"

export interface Account {
  id: AccountId;
  name: string;
  /** Colore usato nei grafici e nei badge. */
  color: string;
}

export type AssetClass =
  | "etf_azionario"
  | "etf_obbligazionario"
  | "azione"
  | "obbligazione"
  | "certificato"
  | "etc"
  | "crypto";

export interface Instrument {
  isin: string;
  name: string;
  /** Nome breve da mostrare nelle liste. */
  shortName?: string;
  /** Simbolo Yahoo Finance usato per le quotazioni (es. "VWCE.DE"). */
  ticker: string;
  /** Valuta di quotazione (es. "EUR", "USD"). */
  currency: string;
  assetClass: AssetClass;
  /**
   * Quota (0..1) investita in titoli di Stato italiani o di Paesi white list.
   * Su questa parte la tassazione effettiva è 12,5% invece di 26%.
   * Per un BTP è 1, per un ETF obbligazionario governativo è circa 1,
   * per un ETF azionario è 0.
   */
  govBondShare?: number;
  /** Total Expense Ratio annuo, in percentuale (es. 0.22). */
  ter?: number;
}

export type TransactionType =
  | "buy"
  | "sell"
  | "dividend" // dividendi e cedole, importo NETTO accreditato
  | "split"
  | "cash" // saldo di liquidità del conto a una data (amount = saldo in EUR)
  | "deposit" // versamento sul conto (es. stipendio), amount in EUR
  | "withdrawal"; // prelievo dal conto, amount in EUR

export interface Transaction {
  id: string;
  /** Data operazione in formato ISO (YYYY-MM-DD). */
  date: string;
  account: AccountId;
  type: TransactionType;
  /** ISIN dello strumento; stringa vuota per i saldi di liquidità. */
  isin: string;
  /** Quantità (sempre positiva) per buy/sell. */
  quantity?: number;
  /** Prezzo unitario nella valuta dello strumento. */
  price?: number;
  /**
   * Cambio nel formato BCE: 1 EUR = fxRate unità di valuta.
   * Es. per USD 1.08 significa 1 EUR = 1,08 USD. Default 1 (EUR).
   */
  fxRate?: number;
  /** Commissioni e oneri in EUR. */
  fees?: number;
  /** Importo in EUR (per i dividendi: netto accreditato). */
  amount?: number;
  /** Tassa trattenuta dalla banca, in EUR (informativo). */
  taxWithheld?: number;
  /** Rapporto di frazionamento per gli split (es. 4 per uno split 4:1). */
  splitRatio?: number;
  note?: string;
}

/** Natura fiscale di una plus/minusvalenza realizzata. */
export type IncomeKind =
  /** ETF/fondi armonizzati: le plusvalenze non compensano lo zainetto. */
  | "redditi_capitale"
  /** Azioni, obbligazioni, ETC, certificati e tutte le minusvalenze. */
  | "redditi_diversi";

export interface RealizedEvent {
  txId: string;
  date: string;
  account: AccountId;
  isin: string;
  quantity: number;
  /** Prezzo medio di carico in EUR al momento della vendita. */
  avgCost: number;
  /** Controvalore netto incassato (commissioni dedotte), EUR. */
  proceeds: number;
  /** Plus (>0) o minus (<0) economica, EUR. */
  gain: number;
  kind: IncomeKind;
  /** Base imponibile dopo la riduzione per i titoli di Stato. */
  taxableGain: number;
  /** Minusvalenze dello zainetto utilizzate per compensare, EUR. */
  lossesUsed: number;
  /** Imposta stimata dovuta sull'operazione, EUR. */
  tax: number;
}

export interface LossLot {
  account: AccountId;
  /** Data in cui la minusvalenza è stata realizzata. */
  date: string;
  /** Importo originario (positivo), EUR. */
  amount: number;
  /** Importo ancora utilizzabile (positivo), EUR. */
  remaining: number;
  /** Ultimo giorno utile (31/12 del quarto anno successivo). */
  expires: string;
  sourceIsin: string;
}

export interface Position {
  account: AccountId;
  isin: string;
  quantity: number;
  /** Costo totale di carico in EUR, commissioni d'acquisto incluse. */
  totalCost: number;
  /** Prezzo medio di carico in EUR. */
  avgCost: number;
  /** Dividendi/cedole netti incassati su questa posizione, EUR. */
  income: number;
  firstBuy: string;
}

export interface PortfolioState {
  positions: Position[];
  realized: RealizedEvent[];
  losses: LossLot[];
  /** Dividendi/cedole netti per anno. */
  incomeByYear: Record<string, number>;
  /**
   * Liquidità per conto: parte dal primo saldo o versamento inserito e da lì si
   * muove con versamenti, prelievi, acquisti, vendite e cedole del conto.
   */
  cash: Record<AccountId, { date: string; amount: number }>;
}
