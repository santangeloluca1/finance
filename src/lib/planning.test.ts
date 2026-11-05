import { describe, expect, it } from "vitest";
import { futureValue, requiredMonthly } from "./planning";

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
