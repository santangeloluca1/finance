import { describe, expect, it } from "vitest";
import type { PositionView, Totals } from "./analytics";
import { computeAlerts, pushableAlerts } from "./alerts";
import { buildPortfolio } from "./engine/portfolio";
import type { Instrument } from "./engine/types";
import { portfolioIntraday } from "./intraday";
import { dailySummary, isQuietTime, isSummaryTime, readRule, romeClock, type AlertRule } from "./notify";
import type { PortfolioData } from "./store";

const ins: Instrument = { isin: "IE00BK5BQT80", name: "Vanguard FTSE All-World", shortName: "VWCE", ticker: "VWCE.DE", currency: "EUR", assetClass: "etf_azionario" };
const usd: Instrument = { isin: "US0378331005", name: "Apple", shortName: "Apple", ticker: "AAPL", currency: "USD", assetClass: "azione" };

function view(i: Instrument, qty: number, price: number, prev: number, cost: number, rate = 1): PositionView {
  const value = (qty * price) / rate;
  const prevValue = (qty * prev) / rate;
  return {
    position: { account: "f", isin: i.isin, quantity: qty, totalCost: cost, avgCost: cost / qty, income: 0 },
    instrument: i,
    price,
    value,
    dayChange: value - prevValue,
    dayChangePct: value / prevValue - 1,
    unrealized: value - cost,
    unrealizedPct: value / cost - 1,
    taxIfSold: 0,
    stale: false,
  } as unknown as PositionView;
}

const views = [view(ins, 10, 110, 115, 1000), view(usd, 5, 200, 196, 800, 1.1)];
const invested = views.reduce((a, v) => a + v.value, 0);
const dayChange = views.reduce((a, v) => a + v.dayChange, 0);
const totals = { value: invested + 500, cash: 500, cost: 1800, dayChange, dayChangePct: dayChange / (invested - dayChange) } as Totals;
const quotes = { "VWCE.DE": { price: 110, previousClose: 115, currency: "EUR" }, AAPL: { price: 200, previousClose: 196, currency: "USD" } };
const ctx = { views, totals, quotes, instruments: [ins, usd] } as unknown as Parameters<typeof readRule>[1];
const rule = (r: Partial<AlertRule>): AlertRule => ({ id: "r", kind: "price", target: ins.isin, op: "below", threshold: 112, repeat: "once", enabled: true, ...r });

describe("regole dell'utente", () => {
  it("prezzo sotto e sopra una soglia, nella valuta del titolo", () => {
    expect(readRule(rule({}), ctx)).toMatchObject({ current: 110, hit: true });
    expect(readRule(rule({ op: "above" }), ctx).hit).toBe(false);
    expect(readRule(rule({ target: usd.isin, op: "above", threshold: 199 }), ctx).hit).toBe(true);
  });

  it("variazione di oggi: il verso lo dà l'operatore", () => {
    expect(readRule(rule({ kind: "dayMove", threshold: 0.04 }), ctx).hit).toBe(true); // −4,3%
    expect(readRule(rule({ kind: "dayMove", threshold: 0.05 }), ctx).hit).toBe(false);
    expect(readRule(rule({ kind: "dayMove", op: "above", threshold: 0.01, target: usd.isin }), ctx).hit).toBe(true); // +2%
  });

  it("guadagno sul prezzo di carico, anche negativo (stop loss)", () => {
    expect(readRule(rule({ kind: "gain", op: "above", threshold: 0.09 }), ctx)).toMatchObject({ hit: true }); // +10%
    expect(readRule(rule({ kind: "gain", op: "below", threshold: -0.05 }), ctx).hit).toBe(false);
  });

  it("valore e peso nel portafoglio", () => {
    expect(readRule(rule({ kind: "value", target: "portfolio", op: "above", threshold: 2000 }), ctx).hit).toBe(true);
    const w = readRule(rule({ kind: "weight", op: "above", threshold: 0.5 }), ctx);
    expect(w.current).toBeCloseTo(1100 / invested, 6);
    expect(w.hit).toBe(true);
  });

  it("senza quotazione la regola non scatta", () => {
    expect(readRule(rule({}), { ...ctx, quotes: {} }).hit).toBe(false);
  });
});

describe("avvisi e notifiche push", () => {
  const data: PortfolioData = {
    accounts: [{ id: "f", name: "Fineco", color: "#000" }],
    instruments: [ins, usd],
    transactions: [],
    isDemo: false,
    alertRules: [rule({ id: "a" }), rule({ id: "b", repeat: "daily" }), rule({ id: "c", enabled: false })],
  };
  const state = buildPortfolio([], []);

  it("le regole attive diventano avvisi; quelle giornaliere hanno la data nell'id", () => {
    const alerts = computeAlerts(data, state, views, totals, quotes as never, "2026-11-06").filter((a) => a.kind === "regola");
    expect(alerts.map((a) => a.id)).toEqual(["regola-a", "regola-b-2026-11-06"]);
  });

  it("la soglia del calo si può cambiare", () => {
    const ids = (d: PortfolioData) => computeAlerts(d, state, views, totals, quotes as never, "2026-11-06").map((a) => a.kind);
    expect(ids(data)).toContain("calo");
    expect(ids({ ...data, notify: { dropThreshold: 0.05 } })).not.toContain("calo");
  });

  it("non invia le categorie spente né gli avvisi già visti nell'app", () => {
    const all = computeAlerts(data, state, views, totals, quotes as never, "2026-11-06");
    const push = pushableAlerts(all, { ...data, notify: { off: ["calo"] }, alertsSeen: ["regola-a"] });
    expect(push.some((a) => a.kind === "calo")).toBe(false);
    expect(push.some((a) => a.id === "regola-a")).toBe(false);
    expect(push.some((a) => a.id === "regola-b-2026-11-06")).toBe(true);
  });

  it("riepilogo: migliore e peggiore della giornata", () => {
    const s = dailySummary(views, totals, "2026-11-06")!;
    expect(s.detail).toContain("Meglio Apple");
    expect(s.detail).toContain("peggio VWCE");
  });
});

describe("orari", () => {
  it("ora italiana anche con il server in UTC", () => {
    expect(romeClock(new Date("2026-11-06T21:30:00Z"))).toEqual({ date: "2026-11-06", time: "22:30", weekday: "Fri" });
    expect(romeClock(new Date("2026-07-01T22:30:00Z")).date).toBe("2026-07-02");
  });
  it("non disturbare e riepilogo", () => {
    expect(isQuietTime("22:30")).toBe(true);
    expect(isQuietTime("07:59")).toBe(true);
    expect(isQuietTime("08:00")).toBe(false);
    expect(isSummaryTime({ time: "18:00", weekday: "Fri" })).toBe(true);
    expect(isSummaryTime({ time: "18:00", weekday: "Sat" })).toBe(false);
    expect(isSummaryTime({ time: "17:00", weekday: "Mon" })).toBe(false);
  });
});

describe("andamento di oggi del portafoglio", () => {
  const t = (hm: string) => `2026-11-06T${hm}:00.000Z`;
  const series = {
    "VWCE.DE": { points: [[t("08:00"), 114], [t("09:00"), 112], [t("10:00"), 110]] as [string, number][], previousClose: 115 },
    AAPL: { points: [[t("09:30"), 198], [t("10:00"), 200]] as [string, number][], previousClose: 196 },
  };
  const now = Date.parse(t("10:30"));

  it("parte dalla chiusura di ieri e finisce sul valore attuale", () => {
    const r = portfolioIntraday(views, series, { USD: 1.1 }, now);
    expect(r.base).toBeCloseTo(invested - dayChange, 6);
    expect(r.values.at(-1)).toBeCloseTo(invested, 6);
    // Alle 8 Apple non ha ancora prezzi: resta alla chiusura di ieri.
    expect(r.values[0]).toBeCloseTo(10 * 114 + (5 * 196) / 1.1, 6);
    expect(r.dates).toHaveLength(5);
  });

  it("un titolo senza serie resta fermo e si allinea con l'ultimo punto", () => {
    const r = portfolioIntraday(views, { "VWCE.DE": series["VWCE.DE"] }, { USD: 1.1 }, now);
    expect(r.values[1]).toBeCloseTo(10 * 112 + (5 * 196) / 1.1, 6);
    expect(r.values.at(-1)).toBeCloseTo(invested, 6);
  });
});

describe("rate automatiche senza liquidità", () => {
  const plan = { id: "bon", kind: "transfer" as const, label: "Bonifico", day: 5, holiday: "same" as const, account: "f", toAccount: "g", amount: 400, since: "2026-11-01", active: true, mode: "auto" as const };
  const base: PortfolioData = {
    accounts: [
      { id: "f", name: "Fineco", color: "#000" },
      { id: "g", name: "Isybank", color: "#111" },
    ],
    instruments: [ins],
    transactions: [{ id: "c", date: "2026-10-01", account: "f", type: "cash", isin: "", amount: 300 }],
    isDemo: false,
  };
  const ids = (d: PortfolioData) => {
    const st = buildPortfolio(d.transactions, d.instruments);
    return computeAlerts(d, st, [], totals, {}, "2026-11-06").map((a) => a.id);
  };

  it("avvisa se il bonifico automatico supera la liquidità del conto", () => {
    expect(ids({ ...base, recurring: [plan] })).toContain("liquidita-bon:2026-11");
  });

  it("tiene conto dello stipendio automatico che arriva prima, e tace sui piani da confermare", () => {
    const salary = { ...plan, id: "sal", kind: "deposit" as const, label: "Stipendio", day: 1, toAccount: undefined, amount: 200 };
    expect(ids({ ...base, recurring: [salary, plan] })).not.toContain("liquidita-bon:2026-11");
    expect(ids({ ...base, recurring: [{ ...plan, mode: "confirm" }] })).not.toContain("liquidita-bon:2026-11");
  });
});
