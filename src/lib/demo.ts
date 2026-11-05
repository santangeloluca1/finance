import type { Account, Instrument, Transaction } from "./engine/types";

/**
 * Portafoglio di esempio con prezzi storici reali, usato finché non
 * vengono importati i movimenti delle banche.
 */

export const DEMO_ACCOUNTS: Account[] = [
  { id: "fineco", name: "Fineco", color: "#5B8CFF" },
  { id: "isybank", name: "Isybank", color: "#34D399" },
  { id: "revolut", name: "Revolut", color: "#C084FC" },
];

export const DEMO_INSTRUMENTS: Instrument[] = [
  { isin: "IE00BK5BQT80", name: "Vanguard FTSE All-World UCITS ETF (Acc)", shortName: "FTSE All-World", ticker: "VWCE.DE", currency: "EUR", assetClass: "etf_azionario", ter: 0.19 },
  { isin: "IE00B4L5Y983", name: "iShares Core MSCI World UCITS ETF (Acc)", shortName: "MSCI World", ticker: "SWDA.MI", currency: "EUR", assetClass: "etf_azionario", ter: 0.2 },
  { isin: "IE00B4WXJJ64", name: "iShares Core € Govt Bond UCITS ETF (Dist)", shortName: "€ Govt Bond", ticker: "SEGA.MI", currency: "EUR", assetClass: "etf_obbligazionario", govBondShare: 1, ter: 0.07 },
  { isin: "IE00B3VTML14", name: "iShares € Govt Bond 3-7yr UCITS ETF (Acc)", shortName: "€ Govt 3-7y", ticker: "CSBGE7.MI", currency: "EUR", assetClass: "etf_obbligazionario", govBondShare: 1, ter: 0.07 },
  { isin: "IE00B14X4Q57", name: "iShares € Govt Bond 1-3yr UCITS ETF (Dist)", shortName: "€ Govt 1-3y", ticker: "IBGS.MI", currency: "EUR", assetClass: "etf_obbligazionario", govBondShare: 1, ter: 0.07 },
  { isin: "IE00BDBRDM35", name: "iShares Core Global Aggregate Bond UCITS ETF EUR Hedged (Acc)", shortName: "Global Aggregate", ticker: "AGGH.MI", currency: "EUR", assetClass: "etf_obbligazionario", govBondShare: 0.5, ter: 0.1 },
  { isin: "US0378331005", name: "Apple Inc.", shortName: "Apple", ticker: "AAPL", currency: "USD", assetClass: "azione" },
  { isin: "IT0003132476", name: "Eni S.p.A.", shortName: "Eni", ticker: "ENI.MI", currency: "EUR", assetClass: "azione" },
];

const T = (ticker: string) => DEMO_INSTRUMENTS.find((i) => i.ticker === ticker)!.isin;

type Row = Omit<Transaction, "id" | "isin"> & { ticker: string };

const rows: Row[] = [
  { date: "2025-01-15", account: "fineco", type: "buy", ticker: "VWCE.DE", quantity: 40, price: 135.38, fees: 2.95 },
  { date: "2025-01-20", account: "revolut", type: "buy", ticker: "AGGH.MI", quantity: 1500, price: 4.8, fees: 1 },
  { date: "2025-02-03", account: "fineco", type: "buy", ticker: "SEGA.MI", quantity: 100, price: 111.53, fees: 2.95 },
  { date: "2025-02-17", account: "fineco", type: "buy", ticker: "ENI.MI", quantity: 300, price: 14.08, fees: 2.95 },
  { date: "2025-03-03", account: "isybank", type: "buy", ticker: "SWDA.MI", quantity: 50, price: 105.74 },
  { date: "2025-04-08", account: "fineco", type: "buy", ticker: "VWCE.DE", quantity: 15, price: 115.94, fees: 2.95 },
  { date: "2025-04-09", account: "fineco", type: "sell", ticker: "ENI.MI", quantity: 300, price: 11.23, fees: 2.95 },
  { date: "2025-04-10", account: "revolut", type: "buy", ticker: "AAPL", quantity: 8, price: 190.42, fees: 1, fxRate: 1.1082 },
  { date: "2025-05-05", account: "fineco", type: "buy", ticker: "CSBGE7.MI", quantity: 60, price: 132.85, fees: 2.95 },
  { date: "2025-06-02", account: "isybank", type: "buy", ticker: "IBGS.MI", quantity: 40, price: 142.56 },
  { date: "2025-06-12", account: "fineco", type: "dividend", ticker: "SEGA.MI", amount: 117.6 },
  { date: "2025-07-01", account: "revolut", type: "buy", ticker: "AGGH.MI", quantity: 800, price: 4.89, fees: 1 },
  { date: "2025-08-04", account: "revolut", type: "buy", ticker: "AAPL", quantity: 4, price: 203.35, fees: 1, fxRate: 1.1565 },
  { date: "2025-09-01", account: "isybank", type: "buy", ticker: "SWDA.MI", quantity: 20, price: 104.86 },
  { date: "2025-10-01", account: "fineco", type: "buy", ticker: "VWCE.DE", quantity: 10, price: 140.5, fees: 2.95 },
  { date: "2025-12-11", account: "fineco", type: "dividend", ticker: "SEGA.MI", amount: 104.3 },
  { date: "2026-01-14", account: "isybank", type: "dividend", ticker: "IBGS.MI", amount: 61.25 },
  { date: "2026-02-02", account: "isybank", type: "buy", ticker: "SWDA.MI", quantity: 15, price: 113.44 },
  { date: "2026-03-02", account: "fineco", type: "sell", ticker: "VWCE.DE", quantity: 10, price: 150.02, fees: 2.95 },
  { date: "2026-05-04", account: "revolut", type: "sell", ticker: "AAPL", quantity: 4, price: 276.83, fees: 1, fxRate: 1.17 },
  { date: "2026-06-11", account: "fineco", type: "dividend", ticker: "SEGA.MI", amount: 121.1 },
];

const cashRows: Omit<Transaction, "id">[] = [
  { date: "2025-01-02", account: "isybank", type: "cash", isin: "", amount: 9000 },
  { date: "2025-07-01", account: "isybank", type: "cash", isin: "", amount: 11200 },
  { date: "2026-01-02", account: "isybank", type: "cash", isin: "", amount: 12500 },
  { date: "2025-01-02", account: "fineco", type: "cash", isin: "", amount: 1500 },
];

export const DEMO_TRANSACTIONS: Transaction[] = [
  ...rows.map(({ ticker, ...r }, i) => ({ id: `demo-${i + 1}`, isin: T(ticker), ...r })),
  ...cashRows.map((r, i) => ({ id: `demo-cash-${i + 1}`, ...r })),
];
