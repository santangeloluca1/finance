import { describe, expect, it } from "vitest";
import type { PositionView } from "./analytics";
import { contributions } from "./contributions";
import type { Instrument, Transaction } from "./engine/types";

const a: Instrument = { isin: "A", name: "A", ticker: "A.MI", currency: "EUR", assetClass: "etf_azionario" };
const b: Instrument = { isin: "B", name: "B", ticker: "B.MI", currency: "EUR", assetClass: "azione" };
const tx: Transaction[] = [
  { id: "1", date: "2026-01-10", account: "f", type: "buy", isin: "A", quantity: 10, price: 100 },
  { id: "2", date: "2026-01-10", account: "f", type: "buy", isin: "B", quantity: 10, price: 50 },
  // B venduto tutto nel periodo, con guadagno.
  { id: "3", date: "2026-06-10", account: "f", type: "sell", isin: "B", quantity: 10, price: 60 },
  // Nuovo acquisto di A nel periodo: non è guadagno.
  { id: "4", date: "2026-07-01", account: "f", type: "buy", isin: "A", quantity: 5, price: 110 },
];
const prices = { "A.MI": [["2026-05-29", 105]] as [string, number][], "B.MI": [["2026-05-29", 55]] as [string, number][] };
const view = { instrument: a, position: { account: "f", isin: "A", quantity: 15 }, value: 15 * 120, dayChange: 30 } as unknown as PositionView;

describe("cosa ha mosso il rendimento", () => {
  it("comprende i titoli venduti nel periodo e toglie i soldi messi", () => {
    const rows = contributions("2026-06-01", [view], tx, [a, b], prices, {});
    const ra = rows.find((r) => r.isin === "A")!;
    const rb = rows.find((r) => r.isin === "B")!;
    // A: 1800 oggi − 1050 a inizio periodo − 550 di acquisto = 200 €.
    expect(ra.change).toBeCloseTo(200, 6);
    expect(ra.sold).toBe(false);
    // B: 600 incassati − 550 a inizio periodo = 50 €, venduto.
    expect(rb.change).toBeCloseTo(50, 6);
    expect(rb.sold).toBe(true);
    // Punti sul capitale complessivo: 1050 + 550 + 550.
    expect(ra.share).toBeCloseTo(200 / 2150, 6);
    expect(rows[0].isin).toBe("A");
  });

  it("oggi: solo i titoli in portafoglio, con la variazione del giorno", () => {
    const rows = contributions("oggi", [view], tx, [a, b], prices, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].change).toBe(30);
    expect(rows[0].pct).toBeCloseTo(30 / 1770, 6);
  });
});
