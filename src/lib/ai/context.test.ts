import { describe, expect, it } from "vitest";
import { totals as computeTotals, valuePositions } from "../analytics";
import { DEMO_ACCOUNTS, DEMO_INSTRUMENTS, DEMO_TRANSACTIONS } from "../demo";
import { buildPortfolio } from "../engine/portfolio";
import { buildContext } from "./context";

describe("dati per il consulente", () => {
  const data = { accounts: DEMO_ACCOUNTS, instruments: DEMO_INSTRUMENTS, transactions: DEMO_TRANSACTIONS, isDemo: false };
  const state = buildPortfolio(data.transactions, data.instruments);
  const quotes = Object.fromEntries(data.instruments.map((i) => [i.ticker, { price: 100, previousClose: 99, currency: i.currency }]));
  const views = valuePositions(state, data.instruments, quotes as never, { USD: 1.1 });
  const totals = computeTotals(views, state);
  const ctx = buildContext({ data, state, views, totals, history: null, compositions: {}, today: "2026-11-06" });
  const json = JSON.stringify(ctx);

  it("contiene posizioni con simulazione fiscale, zainetto e allocazione", () => {
    expect(ctx.positions.length).toBe(views.length);
    expect(ctx.positions.every((p) => p.saleSimulation !== undefined)).toBe(true);
    expect(ctx.allocation.byAssetClass.length).toBeGreaterThan(0);
    expect(Array.isArray(ctx.losses)).toBe(true);
  });

  it("non contiene dati personali e resta compatto", () => {
    expect(json).not.toMatch(/@|santangelo|Luca/i);
    expect(json.length).toBeLessThan(120_000);
  });
});
