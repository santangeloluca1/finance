import { describe, expect, it } from "vitest";
import { adjust, expectedReturn, fromSaved, GROUPS, normalize, PRESETS } from "./allocation";

const sum = (w: Record<string, number>) => GROUPS.reduce((a, g) => a + w[g], 0);

describe("composizione", () => {
  it("i profili sommano a 100", () => {
    for (const p of PRESETS) expect(sum(p.weights)).toBe(100);
  });
  it("normalizza a interi che sommano a 100", () => {
    const w = normalize({ azioni: 1, obbligazioni: 1, liquidita: 1 });
    expect(sum(w)).toBe(100);
  });
  it("converte il vecchio formato per asset class", () => {
    const w = fromSaved({ etf_azionario: 0.5, azione: 0.1, etf_obbligazionario: 0.3, crypto: 0.1 })!;
    expect(w).toEqual({ azioni: 60, obbligazioni: 30, liquidita: 0, altro: 10 });
  });
  it("aumentare un peso lo toglie al più grande e il totale resta 100", () => {
    const w = adjust({ azioni: 60, obbligazioni: 30, liquidita: 10, altro: 0 }, "liquidita", 5);
    expect(w).toEqual({ azioni: 55, obbligazioni: 30, liquidita: 15, altro: 0 });
  });
  it("non scende sotto zero né supera 100", () => {
    expect(adjust({ azioni: 95, obbligazioni: 5, liquidita: 0, altro: 0 }, "obbligazioni", -10)).toEqual({ azioni: 100, obbligazioni: 0, liquidita: 0, altro: 0 });
    expect(sum(adjust({ azioni: 95, obbligazioni: 5, liquidita: 0, altro: 0 }, "azioni", 10))).toBe(100);
  });
  it("il rendimento stimato segue la composizione", () => {
    expect(expectedReturn({ azioni: 100, obbligazioni: 0, liquidita: 0, altro: 0 })).toBeCloseTo(0.07);
    expect(expectedReturn({ azioni: 60, obbligazioni: 30, liquidita: 10, altro: 0 })).toBeCloseTo(0.053);
  });
});
