import { describe, expect, it } from "vitest";
import { backtest, cagr, maxDrawdown, monthEnds, quantile, riskReport, rollingYears, toEur, volatility, type Series } from "./risk";

/** Serie mensile (primo del mese) a partire da gennaio 2020. */
function monthly(values: number[]): Series {
  return values.map((v, i) => [`${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`, v]);
}

describe("rischio", () => {
  it("calo massimo con date e recupero", () => {
    const s = monthly([100, 120, 90, 60, 80, 121, 110]);
    const dd = maxDrawdown(s)!;
    expect(dd.depth).toBeCloseTo(-0.5);
    expect(dd.peak).toBe("2020-02-01");
    expect(dd.trough).toBe("2020-04-01");
    expect(dd.recovered).toBe("2020-06-01");
    expect(maxDrawdown(monthly([1, 2, 3]))).toBeNull();
  });

  it("portafoglio a pesi fissi, con indice simile dove manca lo storico", () => {
    const a = monthly([100, 110, 121]);
    const proxy = monthly([50, 55, 44]);
    const b: Series = [["2020-02-01", 10], ["2020-03-01", 8]]; // parte da febbraio
    const bt = backtest([{ weight: 1, prices: a }, { weight: 1, prices: b, proxy }], "2020-01-01")!;
    // Febbraio: a +10%, b usa l'indice +10% → +10%. Marzo: a +10%, b −20% → −5%.
    expect(bt.index.map(([, v]) => +v.toFixed(4))).toEqual([1, 1.1, 1.045]);
    expect(bt.proxied).toBeCloseTo(0.5);
  });

  it("oscillazione, rendimento annuo, periodi di 12 mesi e quantili", () => {
    expect(volatility([0.01, 0.01, 0.01])).toBeCloseTo(0);
    expect(volatility([0.02, -0.02, 0.02, -0.02])!).toBeCloseTo(Math.sqrt((0.0016 / 3) * 12), 6);
    const s = monthly(Array.from({ length: 25 }, (_, i) => 100 * 1.01 ** i));
    expect(cagr(s)!).toBeCloseTo(1.01 ** 12 - 1, 2);
    const w = rollingYears(s);
    expect(w).toHaveLength(13);
    expect(w[0]).toMatchObject({ from: "2020-01-01", to: "2021-01-01" });
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    const r = riskReport({ index: s, proxied: 0 });
    expect(r.worst!.ret).toBeCloseTo(1.01 ** 12 - 1, 6);
  });

  it("fine mese e conversione in euro", () => {
    expect(monthEnds([["2020-01-02", 1], ["2020-01-31", 2], ["2020-02-03", 3]])).toEqual([["2020-01-31", 2], ["2020-02-03", 3]]);
    const eur = toEur([["2020-01-02", 110], ["2020-01-03", 120]], [["2020-01-01", 1.1], ["2020-01-03", 1.2]])!;
    expect(eur.map(([d, v]) => [d, +v.toFixed(6)])).toEqual([["2020-01-02", 100], ["2020-01-03", 100]]);
  });
});
