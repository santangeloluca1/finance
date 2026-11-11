import { describe, expect, it } from "vitest";
import { shouldSnapshot } from "./snapshots";

const now = new Date("2026-11-11T12:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3600_000);

describe("shouldSnapshot", () => {
  it("salva se non ci sono versioni o l'ultima ha più di 6 ore", () => {
    expect(shouldSnapshot({ lastAt: null, now, prevTransactions: 5, nextTransactions: 5, requested: false })).toBe(true);
    expect(shouldSnapshot({ lastAt: h(7), now, prevTransactions: 5, nextTransactions: 5, requested: false })).toBe(true);
    expect(shouldSnapshot({ lastAt: h(1), now, prevTransactions: 5, nextTransactions: 6, requested: false })).toBe(false);
  });
  it("salva sempre se spariscono movimenti o se il client lo chiede", () => {
    expect(shouldSnapshot({ lastAt: h(1), now, prevTransactions: 5, nextTransactions: 4, requested: false })).toBe(true);
    expect(shouldSnapshot({ lastAt: h(1), now, prevTransactions: 5, nextTransactions: 5, requested: true })).toBe(true);
  });
});
