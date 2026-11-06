import { describe, expect, it } from "vitest";
import { dividendInfo, priceStats } from "./insights";

describe("dividendi di un titolo", () => {
  const divs: [string, number][] = [
    ["2022-05-20", 0.4],
    ["2022-11-20", 0.4],
    ["2023-05-20", 0.44],
    ["2023-11-20", 0.44],
    ["2024-05-20", 0.47],
    ["2024-11-20", 0.47],
    ["2025-05-20", 0.5],
    ["2025-11-20", 0.5],
    ["2026-05-20", 0.52],
  ];
  const info = dividendInfo(divs, 20, "2026-07-01")!;

  it("rendimento, frequenza e ultimo pagamento", () => {
    expect(info.trailing).toBeCloseTo(1.02, 6);
    expect(info.yield).toBeCloseTo(0.051, 6);
    expect(info.frequency).toBe("semestrale");
    expect(info.last).toEqual({ date: "2026-05-20", amount: 0.52 });
  });

  it("stima i prossimi pagamenti ripetendo quelli dell'ultimo anno", () => {
    expect(info.upcoming).toEqual([
      { date: "2026-11-20", amount: 0.5 },
      { date: "2027-05-20", amount: 0.52 },
    ]);
    expect(info.byYear.at(-1)).toEqual({ year: "2026", amount: 0.52, estimate: 0.5 });
  });

  it("crescita media annua sugli anni completi", () => {
    // 2023 → 2025: da 0,88 a 1,00 in 2 anni.
    expect(info.growth).toBeCloseTo(Math.sqrt(1 / 0.88) - 1, 6);
  });
});

describe("statistiche dal grafico", () => {
  // Due anni di prezzi giornalieri: sale da 100 a 121 con un calo a metà.
  const series: [string, number][] = [];
  const start = Date.parse("2024-07-01");
  for (let i = 0; i <= 730; i++) {
    const p = i < 365 ? 100 + i * 0.1 : i < 400 ? 136.4 - (i - 365) * 1 : 101.4 + (i - 400) * 0.06;
    series.push([new Date(start + i * 86400_000).toISOString().slice(0, 10), p]);
  }
  const s = priceStats(series, null, "2026-07-01")!;

  it("massimo e minimo delle ultime 52 settimane", () => {
    expect(s.high52).toBeCloseTo(136.4, 1);
    expect(s.low52).toBeCloseTo(101.4, 1);
  });
  it("rendimenti: 1 anno sì, 3 anni no (storico corto)", () => {
    expect(s.r1).not.toBeNull();
    expect(s.r3).toBeNull();
  });
  it("calo massimo dal picco", () => {
    expect(s.maxDrawdown).toBeCloseTo(101.4 / 136.4 - 1, 2);
  });
});
