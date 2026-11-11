import { describe, expect, it } from "vitest";
import { merge, reviveFrom, TOMBSTONE_TTL_MS, withRevived, withTombstones } from "./merge";
import type { PortfolioData, SavedReport } from "./store";
import type { Instrument, Transaction } from "./engine/types";

const NOW = Date.parse("2026-11-11T12:00:00Z");
const ins = (isin: string): Instrument => ({ isin, name: isin, ticker: `${isin}.MI`, currency: "EUR", assetClass: "etf_azionario" });
const buy = (id: string, isin: string): Transaction => ({ id, date: "2026-01-02", account: "fineco", type: "buy", isin, quantity: 1, price: 100 });
const doc = (p: Partial<PortfolioData> = {}): PortfolioData => ({ accounts: [{ id: "fineco", name: "Fineco", color: "#000" }], instruments: [], transactions: [], isDemo: false, ...p });
const ids = <T extends { id: string }>(xs: T[] | undefined) => (xs ?? []).map((x) => x.id).sort();

describe("merge: comportamento esistente", () => {
  it("unisce per id e a parità di id vince la versione locale", () => {
    const local = doc({ instruments: [ins("A")], transactions: [{ ...buy("t1", "A"), quantity: 5 }] });
    const remote = doc({ instruments: [ins("A")], transactions: [buy("t1", "A"), buy("t2", "A")] });
    const m = merge(local, remote, NOW);
    expect(ids(m.transactions)).toEqual(["t1", "t2"]);
    expect(m.transactions.find((t) => t.id === "t1")!.quantity).toBe(5);
    expect(m.isDemo).toBe(false);
  });

  it("tiene solo le 30 analisi più recenti", () => {
    const rep = (i: number): SavedReport => ({ id: `r${i}`, analysis: "checkup", title: "x", date: `2026-01-${String(i).padStart(2, "0")}T00:00:00Z`, report: { summary: "", actions: [], sections: [], risks: [], dataUsed: [] } });
    const local = doc({ aiReports: Array.from({ length: 20 }, (_, i) => rep(i + 1)) });
    const remote = doc({ aiReports: Array.from({ length: 20 }, (_, i) => rep(i + 11)) });
    const m = merge(local, remote, NOW);
    expect(m.aiReports).toHaveLength(30);
    expect(m.aiReports![0].id).toBe("r30");
  });

  it("i valori interi (watchlist, piano) seguono la versione locale", () => {
    const m = merge(doc({ plan: { monthly: 1, expectedReturn: 0, years: 1 } }), doc({ plan: { monthly: 2, expectedReturn: 0, years: 1 }, targets: { azione: 1 } }), NOW);
    expect(m.plan!.monthly).toBe(1);
    expect(m.targets).toEqual({ azione: 1 });
  });

  it("conserva i campi sconosciuti", () => {
    const m = merge({ ...doc(), futuro: 1 } as PortfolioData, doc(), NOW);
    expect((m as unknown as { futuro: number }).futuro).toBe(1);
  });
});

describe("merge: cancellazioni", () => {
  const both = doc({ instruments: [ins("A")], transactions: [buy("t1", "A"), buy("t2", "A")], goals: [{ id: "g1", name: "Casa", target: 1, date: "2030-01-01", scope: "tutto" }] });

  it("un elemento eliminato in locale non torna dal server", () => {
    const local = withTombstones({ ...both, transactions: [buy("t2", "A")] }, "transactions", ["t1"], NOW);
    const m = merge(local, both, NOW);
    expect(ids(m.transactions)).toEqual(["t2"]);
    expect(m.deleted?.["transactions:t1"]).toBeDefined();
  });

  it("un elemento eliminato sul server sparisce anche in locale", () => {
    const remote = withTombstones({ ...both, goals: [] }, "goals", ["g1"], NOW);
    const m = merge(both, remote, NOW);
    expect(m.goals).toEqual([]);
  });

  it("vale per tutte le liste unite per id", () => {
    const local = doc({
      reminders: [{ id: "r", title: "x", date: "2026-01-01", repeat: "none" }],
      alertRules: [{ id: "a", kind: "price", target: "A", op: "above", threshold: 1, repeat: "once", enabled: true }],
      accounts: [{ id: "c", name: "C", color: "#000" }],
    });
    let remote = doc({ accounts: [] });
    remote = withTombstones(remote, "reminders", ["r"], NOW);
    remote = withTombstones(remote, "alertRules", ["a"], NOW);
    remote = withTombstones(remote, "accounts", ["c"], NOW);
    const m = merge(local, remote, NOW);
    expect(m.reminders).toEqual([]);
    expect(m.alertRules).toEqual([]);
    expect(m.accounts).toEqual([]);
  });

  it("un elemento ricreato dopo la cancellazione resta, anche se l'altro lato ha ancora il segno", () => {
    // Il server conosce la cancellazione; questo dispositivo l'ha ricevuta e poi ha ricreato lo strumento.
    const remote = withTombstones(doc(), "instruments", ["A"], NOW - 60_000);
    const deletedHere = { ...remote };
    const recreated = withRevived(withRevived({ ...deletedHere, instruments: [ins("A")], transactions: [buy("t9", "A")] }, "instruments", ["A"], NOW), "transactions", ["t9"], NOW);
    expect(recreated.deleted?.["instruments:A"]).toBeUndefined();
    const m = merge(recreated, remote, NOW);
    expect(m.instruments.map((i) => i.isin)).toEqual(["A"]);
    // E viceversa, dal punto di vista dell'altro dispositivo.
    const m2 = merge(remote, recreated, NOW);
    expect(m2.instruments.map((i) => i.isin)).toEqual(["A"]);
    expect(m2.deleted?.["instruments:A"]).toBeUndefined();
  });

  it("una cancellazione successiva al ripristino torna a valere", () => {
    let d = withTombstones(doc({ goals: [] }), "goals", ["g1"], NOW - 2000);
    d = withRevived(d, "goals", ["g1"], NOW - 1000);
    const other = withTombstones(doc({ goals: [] }), "goals", ["g1"], NOW);
    const m = merge({ ...d, goals: both.goals }, other, NOW);
    expect(m.goals).toEqual([]);
  });

  it("ricreare un elemento mai eliminato non aggiunge nulla al documento", () => {
    expect(withRevived(both, "transactions", ["t1"], NOW)).toBe(both);
  });

  it("dimentica i segni più vecchi di 180 giorni", () => {
    const old = withTombstones(doc(), "transactions", ["vecchio"], NOW - TOMBSTONE_TTL_MS - 86400_000);
    const recent = withTombstones(old, "transactions", ["nuovo"], NOW);
    expect(Object.keys(recent.deleted!)).toEqual(["transactions:nuovo"]);
    // Anche se arrivano da un dispositivo rimasto indietro.
    const m = merge(old, doc(), NOW);
    expect(m.deleted).toBeUndefined();
  });

  it("non toglie uno strumento ancora usato da un movimento rimasto", () => {
    // Un dispositivo ha eliminato l'ultimo movimento su A (e quindi lo strumento); l'altro ha aggiunto un nuovo acquisto di A.
    const local = withTombstones(withTombstones(doc(), "transactions", ["t1"], NOW), "instruments", ["A"], NOW);
    const remote = doc({ instruments: [ins("A")], transactions: [buy("t1", "A"), buy("t3", "A")] });
    const m = merge(local, remote, NOW);
    expect(ids(m.transactions)).toEqual(["t3"]);
    expect(m.instruments.map((i) => i.isin)).toEqual(["A"]);
    expect(m.deleted?.["instruments:A"]).toBeUndefined();
  });

  it("uno strumento eliminato e non più usato sparisce", () => {
    const local = withTombstones(withTombstones(doc(), "transactions", ["t1"], NOW), "instruments", ["A"], NOW);
    const remote = doc({ instruments: [ins("A")], transactions: [buy("t1", "A")] });
    expect(merge(local, remote, NOW).instruments).toEqual([]);
  });

  it("l'import di un backup fa tornare quello che il file contiene", () => {
    const current = withTombstones(doc({ instruments: [ins("A")] }), "transactions", ["t1"], NOW - 1000);
    const file = doc({ instruments: [ins("A")], transactions: [buy("t1", "A")] });
    const m = merge(file, reviveFrom(current, file, NOW), NOW);
    expect(ids(m.transactions)).toEqual(["t1"]);
  });
});
