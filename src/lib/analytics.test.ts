import { describe, expect, it } from "vitest";
import { cutoffDate, positionChange, type PositionView } from "./analytics";
import type { Transaction } from "./engine/types";

describe("variazione di un titolo in un periodo", () => {
  const from = cutoffDate(366);
  const before = new Date(Date.parse(from) - 30 * 86400_000).toISOString().slice(0, 10);
  const during = new Date(Date.parse(from) + 60 * 86400_000).toISOString().slice(0, 10);
  const txs: Transaction[] = [
    { id: "1", date: before, account: "f", type: "buy", isin: "X", quantity: 10, price: 30 },
    { id: "2", date: during, account: "f", type: "buy", isin: "X", quantity: 10, price: 45 },
  ];
  // Oggi 20 quote a 50 €: valore 1000, costo 750.
  const v = {
    position: { account: "f", isin: "X", quantity: 20, totalCost: 750, avgCost: 37.5, income: 0, firstBuy: before },
    instrument: { isin: "X", name: "X", ticker: "X.MI", currency: "EUR", assetClass: "etf_azionario" },
    price: 50,
    value: 1000,
    unrealized: 250,
    unrealizedPct: 1 / 3,
  } as unknown as PositionView;
  const series = { "X.MI": [[before, 30], [from, 40], [during, 45]] as [string, number][] };

  it("conta le quote comprate nel periodo dal loro prezzo d'acquisto", () => {
    // 10 quote da 40 a 50 (+100) e 10 quote da 45 a 50 (+50) = +150 su 850 investiti.
    const c = positionChange(v, "1A", series, {}, txs);
    expect(c.abs).toBeCloseTo(150, 6);
    expect(c.pct).toBeCloseTo(150 / 850, 6);
  });

  it("dall'acquisto coincide con il guadagno della posizione", () => {
    expect(positionChange(v, "totale", series, {}, txs).abs).toBe(250);
  });
});
