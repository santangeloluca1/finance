import { describe, expect, it } from "vitest";
import { cashFlows, monthlyReturns, twrSeries, xirr } from "./performance";

describe("TWR", () => {
  it("non considera i versamenti come rendimento", () => {
    // 1000 € che diventano 1100 (+10%), poi versamento di 1000 (gain invariato), poi +10% su 2100
    const h = [
      { date: "2025-01-01", value: 1000, gain: 0 },
      { date: "2025-01-02", value: 1100, gain: 100 },
      { date: "2025-01-03", value: 2100, gain: 100 },
      { date: "2025-01-04", value: 2310, gain: 310 },
    ];
    const s = twrSeries(h);
    expect(s[3].value).toBeCloseTo(1.1 * 1.1 - 1, 6);
  });

  it("compone i rendimenti mensili", () => {
    const s = [
      { date: "2025-01-02", value: 0 },
      { date: "2025-01-31", value: 0.1 },
      { date: "2025-02-28", value: 0.21 },
    ];
    const m = monthlyReturns(s);
    expect(m["2025-01"]).toBeCloseTo(0.1);
    expect(m["2025-02"]).toBeCloseTo(0.1);
  });
});

describe("XIRR", () => {
  it("un anno esatto al 10%", () => {
    expect(xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2026-01-01", amount: 1100 }])).toBeCloseTo(0.0998, 3);
  });

  it("ricava i flussi da acquisti e cedole, lasciando fuori la liquidità", () => {
    const f = cashFlows([
      { id: "1", date: "2025-01-01", account: "a", type: "buy", isin: "X", quantity: 10, price: 100, fees: 5 },
      { id: "2", date: "2025-06-01", account: "a", type: "dividend", isin: "X", amount: 20 },
      { id: "3", date: "2025-02-01", account: "b", type: "cash", isin: "", amount: 500 },
      { id: "4", date: "2025-03-01", account: "b", type: "cash", isin: "", amount: 300 },
    ]);
    expect(f.map((x) => x.amount)).toEqual([-1005, 20]);
  });
});
