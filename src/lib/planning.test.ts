import { describe, expect, it } from "vitest";
import { futureValue, planGoals, requiredMonthly } from "./planning";

describe("pianificazione", () => {
  it("senza rendimento somma i versamenti", () => {
    expect(futureValue(1000, 100, 0, 12)).toBeCloseTo(2200);
  });
  it("capitale che cresce al 5% annuo per 10 anni", () => {
    expect(futureValue(10000, 0, 0.05, 120)).toBeCloseTo(10000 * Math.pow(1.05, 10), 2);
  });
  it("il versamento richiesto porta esattamente all'obiettivo", () => {
    const pmt = requiredMonthly(5000, 50000, 0.04, 96);
    expect(futureValue(5000, pmt, 0.04, 96)).toBeCloseTo(50000, 2);
  });
  it("zero se l'obiettivo è già raggiunto", () => {
    expect(requiredMonthly(60000, 50000, 0.04, 24)).toBe(0);
  });
});

describe("obiettivi per priorità", () => {
  const from = new Date(2026, 0, 15);
  const pools = (s: string) => (s === "tutto" ? 30000 : s === "liquidita" ? 8000 : 0);

  it("lo stesso denaro non conta per due obiettivi", () => {
    const [a, b] = planGoals(
      [
        { id: "a", target: 20000, date: "2027-12-31", scope: "tutto" },
        { id: "b", target: 50000, date: "2031-12-31", scope: "tutto" },
      ],
      pools, 0, 0, from,
    );
    expect(a.status).toBe("done");
    expect(b.allocated).toBe(10000);
  });

  it("la liquidità è limitata al suo ambito", () => {
    const [a] = planGoals([{ id: "a", target: 10000, date: "2027-01-31", scope: "liquidita" }], pools, 0, 0, from);
    expect(a.allocated).toBe(8000);
  });

  it("il versamento va prima agli obiettivi più importanti", () => {
    const [a, b] = planGoals(
      [
        { id: "a", target: 9200, date: "2027-01-31", scope: "liquidita" },
        { id: "b", target: 30000, date: "2027-01-31", scope: "tutto" },
      ],
      pools, 150, 0, from,
    );
    expect(a.status).toBe("ok");
    expect(a.need).toBeCloseTo(100);
    expect(b.status).toBe("late");
    expect(b.funded).toBeCloseTo(50);
    expect(b.extra).toBeGreaterThan(0);
    expect(b.monthsAtPace).toBeGreaterThan(12);
  });
});
