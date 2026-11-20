import { describe, expect, it } from "vitest";
import type { Account, Transaction } from "./engine/types";
import { openPeriod, spendingByMonth, spendingPeriods, spendingSummary } from "./spending";

const accounts: Account[] = [
  { id: "isy", name: "Isybank", color: "#000", spending: true },
  { id: "fin", name: "Fineco", color: "#111" },
];

let n = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, "date" | "type">): Transaction => ({ id: `t${n++}`, account: "isy", isin: "", ...t });

describe("spese dai saldi", () => {
  it("ricava le spese tra due saldi togliendo entrate e soldi investiti", () => {
    const txs = [
      tx({ date: "2026-10-27", type: "cash", amount: 3000 }),
      tx({ date: "2026-11-05", type: "transfer", toAccount: "fin", amount: 500 }),
      tx({ date: "2026-11-27", type: "deposit", amount: 2000 }),
      tx({ date: "2026-11-27", type: "cash", amount: 3200 }),
    ];
    const [p] = spendingPeriods(txs, "isy");
    expect(p).toMatchObject({ from: "2026-10-27", to: "2026-11-27", income: 2000, invested: 500, saved: 200 });
    // 3000 + 2000 − 500 − 3200
    expect(p.spent).toBe(1300);
    expect(p.income).toBeCloseTo(p.spent + p.invested + p.saved);
  });

  it("conta acquisti, vendite e rientri dal conto di investimento", () => {
    const txs = [
      tx({ date: "2026-01-01", type: "cash", amount: 1000 }),
      tx({ date: "2026-01-10", type: "buy", isin: "X", quantity: 2, price: 100, fees: 2 }),
      tx({ date: "2026-01-15", type: "sell", isin: "X", quantity: 1, price: 110, fees: 1 }),
      tx({ date: "2026-01-20", type: "transfer", account: "fin", toAccount: "isy", amount: 300 }),
      tx({ date: "2026-01-25", type: "withdrawal", amount: 50 }),
      tx({ date: "2026-01-31", type: "cash", amount: 900 }),
    ];
    const [p] = spendingPeriods(txs, "isy");
    // investito: 202 − 109 − 300 = −207
    expect(p.invested).toBe(-207);
    // 1000 + 0 − (−207) − 900: il prelievo è dentro le spese
    expect(p.spent).toBe(307);
  });

  it("ignora i movimenti degli altri conti e quelli prima del primo saldo", () => {
    const txs = [
      tx({ date: "2026-01-01", type: "deposit", amount: 999 }),
      tx({ date: "2026-01-02", type: "cash", amount: 100 }),
      tx({ date: "2026-01-03", type: "deposit", account: "fin", amount: 5000 }),
      tx({ date: "2026-01-04", type: "cash", account: "fin", amount: 1 }),
      tx({ date: "2026-02-02", type: "cash", amount: 40 }),
    ];
    expect(spendingPeriods(txs, "isy")).toEqual([
      { account: "isy", from: "2026-01-02", to: "2026-02-02", income: 0, invested: 0, spent: 60, saved: -60 },
    ]);
  });

  it("raggruppa per mese del saldo di chiusura e somma i saldi intermedi", () => {
    const txs = [
      tx({ date: "2026-10-27", type: "cash", amount: 3000 }),
      tx({ date: "2026-11-10", type: "cash", amount: 2500 }),
      tx({ date: "2026-11-27", type: "deposit", amount: 2000 }),
      tx({ date: "2026-11-27", type: "cash", amount: 3800 }),
      tx({ date: "2026-12-27", type: "deposit", amount: 2000 }),
      tx({ date: "2026-12-27", type: "cash", amount: 4000 }),
    ];
    const months = spendingByMonth(txs, accounts);
    expect(months.map((m) => m.month)).toEqual(["2026-12", "2026-11"]);
    expect(months[1]).toMatchObject({ from: "2026-10-27", to: "2026-11-27", income: 2000, spent: 1200, saved: 800 });
    expect(months[0]).toMatchObject({ income: 2000, spent: 1800, saved: 200 });
  });

  it("considera solo i conti di spesa", () => {
    const txs = [tx({ date: "2026-01-01", type: "cash", account: "fin", amount: 1 }), tx({ date: "2026-02-01", type: "cash", account: "fin", amount: 2 })];
    expect(spendingByMonth(txs, accounts)).toEqual([]);
  });

  it("calcola medie e tasso di risparmio", () => {
    const s = spendingSummary([
      { month: "2026-12", from: "", to: "", income: 2000, invested: 500, spent: 1000, saved: 500 },
      { month: "2026-11", from: "", to: "", income: 2000, invested: 500, spent: 1400, saved: 100 },
    ]);
    expect(s).toMatchObject({ months: 2, income: 4000, spent: 2400, invested: 1000, saved: 600 });
    expect(s!.savingsRate).toBeCloseTo(0.4);
    expect(spendingSummary([])).toBeNull();
  });

  it("mostra i movimenti dall'ultimo saldo", () => {
    const txs = [
      tx({ date: "2026-11-27", type: "cash", amount: 3000 }),
      tx({ date: "2026-12-01", type: "transfer", toAccount: "fin", amount: 400 }),
    ];
    expect(openPeriod(txs, "isy")).toEqual({ account: "isy", from: "2026-11-27", balance: 3000, income: 0, invested: 400 });
    expect(openPeriod([], "isy")).toBeNull();
  });
});
