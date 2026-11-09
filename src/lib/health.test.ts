import { describe, expect, it } from "vitest";
import { portfolioHealth } from "./health";
import type { PositionView, Totals } from "./analytics";
import type { PortfolioState } from "./engine/types";

const totals = (over: Partial<Totals> = {}): Totals => ({
  value: 10000, invested: 10000, cash: 0, cashAvailable: Math.max(0, over.cash ?? 0), negativeCash: [], cost: 9000, unrealized: 1000, unrealizedPct: 0.11, dayChange: 0, dayChangePct: 0,
  realizedNet: 0, realizedTax: 0, income: 0, taxIfSold: 260, netLiquidation: 9740, ...over,
});
const view = (isin: string, value: number, assetClass: "azione" | "etf_azionario", ter = 0.2): PositionView =>
  ({
    position: { account: "a", isin, quantity: 1, totalCost: value * 0.9, avgCost: value * 0.9, income: 0, firstBuy: "2025-01-01" },
    instrument: { isin, name: isin, ticker: isin, currency: "EUR", assetClass, ter },
    price: value, value, dayChange: 0, dayChangePct: 0, unrealized: value * 0.1, unrealizedPct: 0.11, taxIfSold: 0, stale: false,
  }) as PositionView;
const empty: PortfolioState = { positions: [], realized: [], losses: [], incomeByYear: {}, cash: {} };

describe("stato di salute", () => {
  it("premia un portafoglio di ETF economici con un po' di liquidità", () => {
    const h = portfolioHealth([view("A", 9000, "etf_azionario", 0.2)], totals({ value: 10000, invested: 9000, cash: 1000 }), empty, []);
    expect(h.score).toBeGreaterThanOrEqual(90);
  });
  it("segnala un'azione troppo concentrata", () => {
    const h = portfolioHealth([view("A", 8000, "azione"), view("B", 2000, "etf_azionario")], totals(), empty, []);
    const d = h.areas.find((a) => a.id === "diversificazione")!;
    expect(d.checks.some((c) => c.level === "critico")).toBe(true);
    expect(d.score).toBeLessThan(20);
  });
});
