import { describe, expect, it } from "vitest";
import { splitContribution } from "./rebalance";

describe("ribilanciamento con i versamenti", () => {
  it("mette tutto sulla classe sottopesata se basta", () => {
    const s = splitContribution({ az: 7000, ob: 3000 }, { az: 0.6, ob: 0.4 }, 1000);
    expect(s.ob).toBeCloseTo(1000);
    expect(s.az).toBeCloseTo(0);
  });
  it("divide in proporzione ai mancanti", () => {
    const s = splitContribution({ az: 5000, ob: 5000 }, { az: 0.5, ob: 0.5 }, 1000);
    expect(s.az).toBeCloseTo(500);
    expect(s.ob).toBeCloseTo(500);
  });
});
