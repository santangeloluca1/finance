import { describe, expect, it } from "vitest";
import { isIsoDate, validatePortfolioData, validatePortfolioShape } from "./validate";
import { DEMO_ACCOUNTS, DEMO_INSTRUMENTS, DEMO_TRANSACTIONS } from "./demo";

const demo = () => JSON.parse(JSON.stringify({ accounts: DEMO_ACCOUNTS, instruments: DEMO_INSTRUMENTS, transactions: DEMO_TRANSACTIONS, isDemo: true }));
const err = (r: ReturnType<typeof validatePortfolioData>) => (r.ok ? null : r.error);

describe("validatePortfolioData", () => {
  it("accetta il portafoglio di esempio", () => {
    const r = validatePortfolioData(demo());
    expect(err(r)).toBeNull();
    expect(r.ok && r.data.transactions).toHaveLength(DEMO_TRANSACTIONS.length);
  });

  it("rifiuta ciò che non è un backup", () => {
    expect(err(validatePortfolioData(null))).toMatch(/non è un backup/);
    expect(err(validatePortfolioData([]))).toMatch(/non è un backup/);
    expect(err(validatePortfolioData({ transactions: [] }))).toMatch(/non è un backup/);
  });

  it("indica il movimento senza data", () => {
    const d = demo();
    delete d.transactions[11].date;
    expect(err(validatePortfolioData(d))).toBe("Movimento 12: manca la data");
  });

  it("controlla formato delle date, tipi e numeri", () => {
    const d1 = demo();
    d1.transactions[0].date = "15/01/2025";
    expect(err(validatePortfolioData(d1))).toMatch(/^Movimento 1: la data non valida/);
    const d2 = demo();
    d2.transactions[2].type = "acquisto";
    expect(err(validatePortfolioData(d2))).toMatch(/^Movimento 3: il tipo sconosciuto/);
    const d3 = demo();
    d3.transactions[0].price = "135";
    expect(err(validatePortfolioData(d3))).toBe("Movimento 1: il prezzo non è un numero valido");
    const d4 = demo();
    d4.instruments[1].assetClass = "fondo";
    expect(err(validatePortfolioData(d4))).toMatch(/^Strumento 2: il tipo di strumento sconosciuto/);
    expect(isIsoDate("2025-02-30")).toBe(false);
  });

  it("controlla le liste facoltative", () => {
    const d = { ...demo(), reminders: [{ id: "r", title: "x", date: "2026-01-01", repeat: "weekly" }] };
    expect(err(validatePortfolioData(d))).toMatch(/^Promemoria 1: la ripetizione sconosciuto/);
    const g = { ...demo(), goals: [{ id: "g", name: "Casa", target: Infinity, date: "2030-01-01", scope: "tutto" }] };
    expect(err(validatePortfolioData(g))).toBe("Obiettivo 1: il traguardo non è un numero valido");
  });

  it("verifica la coerenza dei movimenti con il motore", () => {
    const d = demo();
    // Vendita di più quote di quelle possedute.
    d.transactions[6].quantity = 9999;
    expect(err(validatePortfolioData(d))).toMatch(/^Movimento 7: vende più quote/);
    const e = demo();
    e.instruments = e.instruments.filter((i: { ticker: string }) => i.ticker !== "ENI.MI");
    expect(err(validatePortfolioData(e))).toMatch(/^Movimento 4: lo strumento IT0003132476 non è nell'elenco/);
    const f = demo();
    f.transactions[0].quantity = 0;
    expect(err(validatePortfolioData(f))).toBe("Movimento 1: la quantità deve essere > 0");
  });

  it("rifiuta id di movimento ripetuti", () => {
    const d = demo();
    d.transactions[1].id = d.transactions[0].id;
    expect(err(validatePortfolioData(d))).toMatch(/^Movimento 2: identificativo ripetuto/);
  });

  it("conserva i campi sconosciuti e tratta null come assente", () => {
    const d = { ...demo(), futuro: { x: 1 } };
    d.transactions[0].fees = null;
    d.transactions[0].extra = "ok";
    const r = validatePortfolioData(d);
    expect(err(r)).toBeNull();
    expect((r.ok && (r.data as unknown as { futuro: unknown }).futuro)).toEqual({ x: 1 });
    expect(r.ok && (r.data.transactions[0] as unknown as { extra: string }).extra).toBe("ok");
  });

  it("la verifica di forma non ricalcola il portafoglio", () => {
    const d = demo();
    d.transactions[6].quantity = 9999;
    expect(validatePortfolioShape(d).ok).toBe(true);
  });
});
