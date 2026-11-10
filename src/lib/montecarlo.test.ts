import { describe, expect, it } from "vitest";
import { at, minRate, portfolioShocks, rng, shareAtLeast, simulate } from "./montecarlo";
import { futureValue } from "./planning";

const shocks = Array.from({ length: 120 }, (_, i) => Math.sin(i * 1.7) * 0.04);

describe("Monte Carlo", () => {
  it("stesso seme, stessi numeri", () => {
    const a = rng(7);
    const b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("senza oscillazioni coincide con la proiezione a rendimento costante", () => {
    const r = simulate({ start: 10000, monthly: 200, months: 120, rate: 0.05, shocks: Array(60).fill(0), paths: 50 });
    expect(r.p50[120]).toBeCloseTo(futureValue(10000, 200, 0.05, 120), 4);
    expect(r.p10[120]).toBeCloseTo(r.p90[120], 6);
  });

  it("con oscillazioni: fascia ordinata e mediana vicina all'attesa", () => {
    const r = simulate({ start: 10000, monthly: 200, months: 240, rate: 0.06, shocks, horizons: [60, 240], paths: 3000 });
    expect(r.p10[240]).toBeLessThan(r.p50[240]);
    expect(r.p50[240]).toBeLessThan(r.p90[240]);
    const expected = futureValue(10000, 200, 0.06, 240);
    expect(Math.abs(r.p50[240] / expected - 1)).toBeLessThan(0.08);
    const rates = r.rates.get(240)!;
    expect(rates).toHaveLength(3000);
    expect(Math.abs(at(rates, 0.5) - 0.06)).toBeLessThan(0.01);
    expect(shareAtLeast(rates, -1)).toBe(1);
    expect(shareAtLeast(rates, 1)).toBe(0);
  });

  it("scarti del portafoglio a media zero e rendimento minimo per bisezione", () => {
    const s = portfolioShocks([
      { weight: 60, returns: Array.from({ length: 36 }, (_, i) => (i % 2 ? 0.03 : -0.01)) },
      { weight: 40, returns: Array(36).fill(0.002) },
    ])!;
    expect(s).toHaveLength(36);
    expect(Math.abs(s.reduce((a, b) => a + b, 0))).toBeLessThan(1e-12);
    expect(s[1]).toBeCloseTo(0.6 * 0.02);
    expect(minRate((r) => r >= 0.034)).toBeCloseTo(0.034, 6);
    expect(minRate(() => false)).toBe(Infinity);
  });
});
