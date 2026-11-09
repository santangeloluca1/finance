import { describe, expect, it } from "vitest";
import type { HistoryPoint } from "./analytics";
import type { Instrument, Transaction } from "./engine/types";
import { monthEnd, monthWrap, previousMonth } from "./wrap";

const etf: Instrument = { isin: "IE00X", name: "World", shortName: "World", ticker: "W.MI", currency: "EUR", assetClass: "etf_azionario" };
const tx: Transaction[] = [
  { id: "a", date: "2026-09-10", account: "f", type: "buy", isin: "IE00X", quantity: 10, price: 100 },
  // Acquisto a metà ottobre: non deve contare come guadagno.
  { id: "b", date: "2026-10-15", account: "f", type: "buy", isin: "IE00X", quantity: 5, price: 104 },
  { id: "c", date: "2026-10-20", account: "f", type: "dividend", isin: "IE00X", amount: 12 },
];
const prices = { "W.MI": [["2026-09-30", 100], ["2026-10-14", 104], ["2026-10-31", 110]] as [string, number][] };
const h = (date: string, value: number, gain: number): HistoryPoint => ({ date, value, invested: value - gain, gain });
const history = [
  h("2026-09-30", 1000, 0),
  h("2026-10-01", 1010, 10), // +1%
  h("2026-10-02", 990, -10), // −2%
  h("2026-10-15", 1560, 40), // +30 € con l'acquisto di 520 €
  h("2026-10-31", 1662, 142),
];

describe("riepilogo del mese", () => {
  it("date di comodo", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(previousMonth(new Date(2026, 0, 5))).toBe("2025-12");
  });

  it("guadagno, giorni e titoli senza contare i soldi messi nel mese", () => {
    const w = monthWrap("2026-10", history, tx, [etf], prices, {})!;
    expect(w.gain).toBe(142);
    expect(w.endValue).toBe(1662);
    expect(w.bestDay?.date).toBe("2026-10-31");
    expect(w.worstDay).toMatchObject({ date: "2026-10-02", gain: -20 });
    // 15 quote × 110 − 10 × 100 − 520 di acquisto = 130 €.
    expect(w.titles[0]).toMatchObject({ isin: "IE00X", change: 130 });
    expect(w.titles[0].pct).toBeCloseTo(130 / 1520, 6);
    expect(w.dividends.total).toBe(12);
    expect(w.bought).toEqual({ total: 520, count: 1 });
  });

  it("senza storia prima del mese non c'è riepilogo", () => {
    expect(monthWrap("2026-09", history, tx, [etf], prices, {})).toBeNull();
  });
});
