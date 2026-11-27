import { describe, expect, it } from "vitest";
import { dividendTax, estimatedPayDate, pendingDividendHref, pendingDividends } from "./dividends";
import type { Instrument, Transaction } from "./engine/types";

const ucg: Instrument = { isin: "IT0005239360", name: "UniCredit", shortName: "UniCredit", ticker: "UCG.MI", currency: "EUR", assetClass: "azione" };
const aapl: Instrument = { isin: "US0378331005", name: "Apple", ticker: "AAPL", currency: "USD", assetClass: "azione" };
const etf: Instrument = { isin: "IE00B3RBWM25", name: "Vanguard All-World Dist", ticker: "VWRL.AS", currency: "EUR", assetClass: "etf_azionario" };

const buy = (isin: string, date: string, quantity: number, account = "fineco"): Transaction => ({ id: `${isin}-${date}`, date, account, type: "buy", isin, quantity, price: 10 });

describe("dividendTax", () => {
  it("azione italiana: solo il 26%", () => {
    expect(dividendTax(ucg, 100)).toEqual({ gross: 100, foreign: 0, italian: 26, net: 74 });
  });
  it("azione USA: 15% alla fonte, poi 26% sul resto", () => {
    expect(dividendTax(aapl, 100)).toEqual({ gross: 100, foreign: 15, italian: 22.1, net: 62.9 });
  });
  it("ETF: nessuna ritenuta estera", () => {
    expect(dividendTax(etf, 100).foreign).toBe(0);
  });
  it("titoli di Stato al 12,5%", () => {
    expect(dividendTax({ ...etf, assetClass: "etf_obbligazionario", govBondShare: 1 }, 100).net).toBe(87.5);
  });
});

describe("estimatedPayDate", () => {
  it("in Europa due giorni lavorativi dopo lo stacco, saltando il fine settimana", () => {
    expect(estimatedPayDate(ucg.isin, "2026-11-23")).toBe("2026-11-25");
    expect(estimatedPayDate(ucg.isin, "2026-11-20")).toBe("2026-11-24");
  });
});

describe("pendingDividends", () => {
  const feed = { [ucg.isin]: { currency: "EUR", dividends: [["2026-11-23", 0.9]] as [string, number][] } };

  it("propone il dividendo dalla data di pagamento, con le quote alla vigilia dello stacco", () => {
    const txs = [buy(ucg.isin, "2026-01-10", 100), buy(ucg.isin, "2026-11-23", 50)];
    expect(pendingDividends(txs, [ucg], feed, {}, "2026-11-24")).toEqual([]);
    const [d] = pendingDividends(txs, [ucg], feed, {}, "2026-11-27");
    expect(d.quantity).toBe(100);
    expect(d.tax).toEqual({ gross: 90, foreign: 0, italian: 23.4, net: 66.6 });
    expect(pendingDividendHref(d)).toContain("importo=66.60");
  });

  it("niente se il dividendo è già registrato o se non avevo il titolo", () => {
    const recorded: Transaction = { id: "d", date: "2026-11-25", account: "fineco", type: "dividend", isin: ucg.isin, amount: 66.6 };
    expect(pendingDividends([buy(ucg.isin, "2026-01-10", 100), recorded], [ucg], feed, {}, "2026-11-27")).toEqual([]);
    expect(pendingDividends([buy(ucg.isin, "2026-11-24", 100)], [ucg], feed, {}, "2026-11-27")).toEqual([]);
  });

  it("converte in euro gli importi in valuta", () => {
    const usdFeed = { [aapl.isin]: { currency: "USD", dividends: [["2026-11-01", 0.25]] as [string, number][] } };
    const [d] = pendingDividends([buy(aapl.isin, "2026-01-10", 40)], [aapl], usdFeed, { USD: 1.25 }, "2026-11-27");
    expect(d.tax.gross).toBe(8);
  });

  it("dimentica gli stacchi troppo vecchi", () => {
    expect(pendingDividends([buy(ucg.isin, "2026-01-10", 100)], [ucg], feed, {}, "2027-02-15")).toEqual([]);
  });
});
