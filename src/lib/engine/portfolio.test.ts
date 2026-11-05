import { describe, expect, it } from "vitest";
import { buildPortfolio, CashError, simulateSale, PortfolioError } from "./portfolio";
import { effectiveRate } from "./tax";
import type { Instrument, Transaction } from "./types";

const STOCK: Instrument = { isin: "IT0000000001", name: "Azione", ticker: "AZ.MI", currency: "EUR", assetClass: "azione" };
const ETF: Instrument = { isin: "IE0000000002", name: "ETF", ticker: "ETF.MI", currency: "EUR", assetClass: "etf_azionario" };
const BOND_ETF: Instrument = {
  isin: "IE0000000003",
  name: "ETF Govt",
  ticker: "GOV.MI",
  currency: "EUR",
  assetClass: "etf_obbligazionario",
  govBondShare: 1,
};
const USD_STOCK: Instrument = { isin: "US0000000004", name: "US", ticker: "US", currency: "USD", assetClass: "azione" };
const ALL = [STOCK, ETF, BOND_ETF, USD_STOCK];

let n = 0;
const tx = (t: Omit<Transaction, "id">): Transaction => ({ id: `t${++n}`, ...t });

describe("prezzo medio ponderato", () => {
  it("media gli acquisti a prezzi diversi includendo le commissioni", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 10, price: 100, fees: 5 }),
        tx({ date: "2025-02-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 10, price: 120, fees: 5 }),
      ],
      ALL,
    );
    const p = s.positions[0];
    expect(p.quantity).toBe(20);
    expect(p.totalCost).toBe(2210);
    expect(p.avgCost).toBeCloseTo(110.5);
  });

  it("calcola la plus sul prezzo medio, non in FIFO", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 10, price: 100 }),
        tx({ date: "2025-02-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 10, price: 200 }),
        tx({ date: "2025-03-10", account: "fineco", type: "sell", isin: STOCK.isin, quantity: 10, price: 180 }),
      ],
      ALL,
    );
    // FIFO darebbe +800; il PMC (150) dà +300.
    expect(s.realized[0].gain).toBeCloseTo(300);
    expect(s.realized[0].tax).toBeCloseTo(78);
    // Il PMC delle quote residue non cambia dopo una vendita.
    expect(s.positions[0].avgCost).toBeCloseTo(150);
    expect(s.positions[0].quantity).toBe(10);
  });

  it("tiene separati i prezzi medi dei diversi intermediari", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: ETF.isin, quantity: 1, price: 100 }),
        tx({ date: "2025-01-10", account: "revolut", type: "buy", isin: ETF.isin, quantity: 1, price: 200 }),
      ],
      ALL,
    );
    const byAcc = Object.fromEntries(s.positions.map((p) => [p.account, p.avgCost]));
    expect(byAcc).toEqual({ fineco: 100, revolut: 200 });
  });

  it("converte in EUR al cambio di ciascuna operazione", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-10", account: "revolut", type: "buy", isin: USD_STOCK.isin, quantity: 10, price: 110, fxRate: 1.1 }),
        tx({ date: "2025-06-10", account: "revolut", type: "sell", isin: USD_STOCK.isin, quantity: 10, price: 110, fxRate: 1.0 }),
      ],
      ALL,
    );
    // Stesso prezzo in USD, ma il dollaro si è rafforzato: +100 € di plus.
    expect(s.realized[0].gain).toBeCloseTo(100);
  });

  it("riapre la posizione con un nuovo PMC dopo una chiusura totale", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 5, price: 10 }),
        tx({ date: "2025-02-10", account: "fineco", type: "sell", isin: STOCK.isin, quantity: 5, price: 12 }),
        tx({ date: "2025-03-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 2, price: 50 }),
      ],
      ALL,
    );
    expect(s.positions[0].avgCost).toBe(50);
    expect(s.positions[0].firstBuy).toBe("2025-03-10");
  });

  it("gestisce gli split mantenendo il costo totale", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 10, price: 400 }),
        tx({ date: "2025-02-10", account: "fineco", type: "split", isin: STOCK.isin, splitRatio: 4 }),
      ],
      ALL,
    );
    expect(s.positions[0].quantity).toBe(40);
    expect(s.positions[0].avgCost).toBe(100);
  });

  it("rifiuta vendite superiori alla quantità posseduta", () => {
    expect(() =>
      buildPortfolio([tx({ date: "2025-01-10", account: "fineco", type: "sell", isin: STOCK.isin, quantity: 1, price: 1 })], ALL),
    ).toThrow(PortfolioError);
  });
});

describe("fiscalità italiana", () => {
  it("le plus da ETF non compensano lo zainetto", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 10, price: 100 }),
        tx({ date: "2025-01-11", account: "fineco", type: "sell", isin: STOCK.isin, quantity: 10, price: 50 }),
        tx({ date: "2025-01-12", account: "fineco", type: "buy", isin: ETF.isin, quantity: 10, price: 100 }),
        tx({ date: "2025-01-13", account: "fineco", type: "sell", isin: ETF.isin, quantity: 10, price: 150 }),
      ],
      ALL,
    );
    expect(s.losses[0].remaining).toBe(500);
    expect(s.realized[1].kind).toBe("redditi_capitale");
    expect(s.realized[1].lossesUsed).toBe(0);
    expect(s.realized[1].tax).toBe(130);
  });

  it("le plus da azioni compensano le minus più vecchie dello stesso conto", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2024-01-10", account: "fineco", type: "buy", isin: ETF.isin, quantity: 10, price: 100 }),
        tx({ date: "2024-02-10", account: "fineco", type: "sell", isin: ETF.isin, quantity: 10, price: 80 }), // minus 200
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 10, price: 100 }),
        tx({ date: "2025-02-10", account: "fineco", type: "sell", isin: STOCK.isin, quantity: 10, price: 130 }), // plus 300
      ],
      ALL,
    );
    expect(s.realized[0].kind).toBe("redditi_diversi");
    expect(s.realized[1].lossesUsed).toBe(200);
    expect(s.realized[1].tax).toBe(26); // (300 - 200) × 26%
    expect(s.losses[0].remaining).toBe(0);
  });

  it("le minus di un conto non compensano le plus di un altro", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 1, price: 100 }),
        tx({ date: "2025-01-11", account: "fineco", type: "sell", isin: STOCK.isin, quantity: 1, price: 50 }),
        tx({ date: "2025-01-12", account: "revolut", type: "buy", isin: STOCK.isin, quantity: 1, price: 100 }),
        tx({ date: "2025-01-13", account: "revolut", type: "sell", isin: STOCK.isin, quantity: 1, price: 150 }),
      ],
      ALL,
    );
    expect(s.realized[1].lossesUsed).toBe(0);
    expect(s.realized[1].tax).toBe(13);
  });

  it("le minus scadono il 31/12 del quarto anno successivo", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2020-03-01", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 1, price: 100 }),
        tx({ date: "2020-03-02", account: "fineco", type: "sell", isin: STOCK.isin, quantity: 1, price: 50 }),
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 1, price: 100 }),
        tx({ date: "2025-01-11", account: "fineco", type: "sell", isin: STOCK.isin, quantity: 1, price: 150 }),
      ],
      ALL,
    );
    expect(s.losses[0].expires).toBe("2024-12-31");
    expect(s.realized[1].lossesUsed).toBe(0);
  });

  it("applica il 12,5% effettivo sui titoli di Stato", () => {
    expect(effectiveRate(BOND_ETF)).toBeCloseTo(0.125, 3);
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: BOND_ETF.isin, quantity: 10, price: 100 }),
        tx({ date: "2025-02-10", account: "fineco", type: "sell", isin: BOND_ETF.isin, quantity: 10, price: 110 }),
      ],
      ALL,
    );
    expect(s.realized[0].tax).toBeCloseTo(12.5, 1);
  });

  it("accumula dividendi netti per anno", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: BOND_ETF.isin, quantity: 10, price: 100 }),
        tx({ date: "2025-06-10", account: "fineco", type: "dividend", isin: BOND_ETF.isin, amount: 12.3 }),
        tx({ date: "2025-12-10", account: "fineco", type: "dividend", isin: BOND_ETF.isin, amount: 10 }),
      ],
      ALL,
    );
    expect(s.incomeByYear["2025"]).toBeCloseTo(22.3);
    expect(s.positions[0].income).toBeCloseTo(22.3);
  });
});

describe("simulatore di vendita", () => {
  it("non modifica lo zainetto e stima tasse e netto", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 10, price: 100 }),
        tx({ date: "2025-01-11", account: "fineco", type: "sell", isin: STOCK.isin, quantity: 5, price: 80 }), // minus 100
      ],
      ALL,
    );
    const sim = simulateSale(s, STOCK, "fineco", 5, 150, { date: "2025-06-01", fees: 2 });
    expect(sim.gain).toBeCloseTo(248);
    expect(sim.lossesUsed).toBeCloseTo(100);
    expect(sim.tax).toBeCloseTo(38.48);
    expect(sim.net).toBeCloseTo(748 - 38.48);
    expect(s.losses[0].remaining).toBe(100);
  });
});

describe("liquidità", () => {
  it("parte dall'ultimo saldo per conto e scala gli acquisti successivi", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-01", account: "isybank", type: "cash", isin: "", amount: 8000 }),
        tx({ date: "2025-03-01", account: "isybank", type: "cash", isin: "", amount: 12500 }),
        tx({ date: "2025-02-01", account: "fineco", type: "cash", isin: "", amount: 300 }),
        tx({ date: "2025-02-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 1, price: 100 }),
      ],
      ALL,
    );
    expect(s.cash).toEqual({ isybank: { date: "2025-03-01", amount: 12500 }, fineco: { date: "2025-02-10", amount: 200 } });
    expect(s.positions).toHaveLength(1);
    expect(s.realized).toHaveLength(0);
  });
});

describe("liquidità del conto", () => {
  it("si muove con versamenti, acquisti, vendite, cedole e prelievi", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-01", account: "fineco", type: "deposit", isin: "", amount: 2000, note: "Stipendio" }),
        tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 10, price: 100, fees: 5 }),
        tx({ date: "2025-03-10", account: "fineco", type: "dividend", isin: STOCK.isin, amount: 15 }),
        tx({ date: "2025-04-10", account: "fineco", type: "sell", isin: STOCK.isin, quantity: 5, price: 110, fees: 5 }),
        tx({ date: "2025-05-01", account: "fineco", type: "withdrawal", isin: "", amount: 300 }),
      ],
      ALL,
    );
    // 2000 − 1005 + 15 + (550 − 5) − 300
    expect(s.cash.fineco.amount).toBeCloseTo(1255, 6);
  });

  it("senza un saldo iniziale gli acquisti non toccano la liquidità", () => {
    const s = buildPortfolio([tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 1, price: 100 })], ALL);
    expect(s.cash).toEqual({});
  });

  it("un saldo inserito a mano riallinea la liquidità", () => {
    const s = buildPortfolio(
      [
        tx({ date: "2025-01-01", account: "fineco", type: "deposit", isin: "", amount: 500 }),
        tx({ date: "2025-02-01", account: "fineco", type: "cash", isin: "", amount: 548.93 }),
        tx({ date: "2025-03-01", account: "fineco", type: "deposit", isin: "", amount: 1000 }),
      ],
      ALL,
    );
    expect(s.cash.fineco.amount).toBeCloseTo(1548.93, 6);
  });

  it("blocca un acquisto che supera la liquidità disponibile", () => {
    const buy = tx({ date: "2025-01-10", account: "fineco", type: "buy", isin: STOCK.isin, quantity: 10, price: 100, fees: 5 });
    const txs = [tx({ date: "2025-01-01", account: "fineco", type: "cash", isin: "", amount: 800 }), buy];
    expect(() => buildPortfolio(txs, ALL, { checkCashFor: buy.id })).toThrow(CashError);
    // Senza controllo (storico importato) il calcolo procede.
    expect(buildPortfolio(txs, ALL).cash.fineco.amount).toBeCloseTo(-205, 6);
  });
});

describe("bonifico tra conti", () => {
  it("sposta la liquidità e blocca se il conto di partenza non ha fondi", () => {
    const sal = tx({ date: "2026-11-10", account: "isybank", type: "deposit", isin: "", amount: 1800 });
    const bon = tx({ date: "2026-11-10", account: "isybank", type: "transfer", toAccount: "fineco", isin: "", amount: 300 });
    const s = buildPortfolio([tx({ date: "2026-11-05", account: "fineco", type: "cash", isin: "", amount: 548.93 }), sal, bon], ALL, { checkCashFor: bon.id });
    expect(s.cash.isybank.amount).toBeCloseTo(1500, 6);
    expect(s.cash.fineco.amount).toBeCloseTo(848.93, 6);
    expect(() => buildPortfolio([bon], ALL, { checkCashFor: bon.id })).toThrow(CashError);
  });
});
