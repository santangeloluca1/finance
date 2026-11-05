import { describe, expect, it } from "vitest";
import { detectPac } from "./pac";
import type { Transaction } from "./engine/types";

const buy = (date: string, q: number, p: number): Transaction => ({ id: date, date, account: "a", type: "buy", isin: "X", quantity: q, price: p });

describe("rilevamento PAC", () => {
  it("riconosce acquisti mensili di importo simile", () => {
    const p = detectPac([buy("2026-01-05", 2, 100), buy("2026-02-05", 2, 102), buy("2026-03-05", 2, 98), buy("2026-04-06", 2, 101)], "X", "a");
    expect(p?.installments).toBe(4);
    expect(p?.monthly).toBeCloseTo(200.5, 0);
  });
  it("ignora acquisti sporadici", () => {
    expect(detectPac([buy("2025-01-05", 2, 100), buy("2025-06-05", 2, 100), buy("2026-01-05", 2, 100)], "X", "a")).toBeNull();
  });
});
