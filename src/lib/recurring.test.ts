import { describe, expect, it } from "vitest";
import { dueDate, isBusinessDay, lastAmount, occurrences, pacQuantity, pendingOccurrences, type RecurringPlan } from "./recurring";

const pac: RecurringPlan = { id: "pac", kind: "pac", label: "PAC", day: 15, holiday: "next", account: "fineco", isin: "X", budget: 300, since: "2026-01-01", active: true };
const salary: RecurringPlan = { id: "sal", kind: "deposit", label: "Stipendio", day: 10, holiday: "same", account: "isybank", amount: 1800, since: "2026-01-01", active: true };

describe("date delle rate", () => {
  it("sposta il PAC al primo giorno di Borsa aperta", () => {
    expect(dueDate(pac, "2025-11")).toBe("2025-11-17"); // 15 è sabato
    expect(dueDate(pac, "2026-02")).toBe("2026-02-16"); // 15 è domenica
    expect(dueDate(pac, "2026-08")).toBe("2026-08-17"); // Ferragosto di sabato
    expect(dueDate(pac, "2026-10")).toBe("2026-10-15");
  });

  it("riconosce i festivi di Borsa, Pasqua compresa", () => {
    expect(isBusinessDay("2026-04-03")).toBe(false); // Venerdì Santo
    expect(isBusinessDay("2026-04-06")).toBe(false); // Pasquetta
    expect(isBusinessDay("2026-04-07")).toBe(true);
    expect(isBusinessDay("2026-12-24")).toBe(false);
  });

  it("lo stipendio resta il giorno indicato e i mesi corti usano l'ultimo giorno", () => {
    expect(dueDate(salary, "2026-01")).toBe("2026-01-10");
    expect(dueDate({ day: 31, holiday: "same" }, "2026-02")).toBe("2026-02-28");
  });
});

describe("rate da confermare", () => {
  it("propone solo le rate scadute dalla data di partenza", () => {
    expect(occurrences(pac, "2026-03-20").map((o) => o.date)).toEqual(["2026-01-15", "2026-02-16", "2026-03-16"]);
    expect(occurrences({ ...pac, since: "2026-01-20" }, "2026-03-20").map((o) => o.id)).toEqual(["pac:2026-02", "pac:2026-03"]);
  });

  it("toglie le rate registrate e quelle saltate, entrate prima degli investimenti", () => {
    const txs = [{ id: "a", date: "2026-01-10", account: "isybank", type: "deposit" as const, isin: "", amount: 1750, plan: "sal:2026-01" }];
    const p = pendingOccurrences([pac, salary], txs, ["pac:2026-01"], "2026-02-16");
    expect(p.map((o) => o.id)).toEqual(["sal:2026-02", "pac:2026-02"]);
    expect(lastAmount(salary, txs)).toBe(1750);
  });

  it("calcola le quote intere nel budget", () => {
    expect(pacQuantity(300, 47.61)).toBe(6);
    expect(pacQuantity(300, 50)).toBe(6);
    expect(pacQuantity(45, 17.31)).toBe(2);
  });
});
