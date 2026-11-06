import type { HistoryPoint, PositionView, Totals } from "../analytics";
import { ASSET_CLASS_LABEL } from "../analytics";
import { dividendsForYear, trailingDividends } from "../dividends";
import { simulateSale, usableLosses } from "../engine/portfolio";
import { effectiveRate, incomeKind, isFundLike } from "../engine/tax";
import type { PortfolioState } from "../engine/types";
import { portfolioHealth } from "../health";
import { cashFlows, monthlyReturns, twrSeries, xirr } from "../performance";
import type { PortfolioData } from "../store";
import type { Composition } from "../xray-client";
import { lookThrough, topCompanies } from "../xray-client";

/**
 * Dati del portafoglio per il consulente: tutto ciò che il motore di Basis ha
 * già calcolato, senza dati personali (nome, email, note dei movimenti).
 * Importi arrotondati al centesimo, percentuali come frazioni (0.05 = 5%).
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export interface ContextInput {
  data: PortfolioData;
  state: PortfolioState;
  views: PositionView[];
  totals: Totals;
  history: HistoryPoint[] | null;
  compositions: Record<string, Composition>;
  today?: string;
  focus?: unknown;
  previous?: { date: string; summary: string } | null;
}

export function buildContext({ data, state, views, totals, history, compositions, today = new Date().toISOString().slice(0, 10), focus, previous }: ContextInput) {
  const bank = new Map(data.accounts.map((a) => [a.id, a.name]));
  const invested = totals.value - totals.cash;
  const name = (isin: string) => {
    const i = data.instruments.find((x) => x.isin === isin);
    return i?.shortName ?? i?.name ?? isin;
  };

  const positions = views.map((v) => {
    const sim = (() => {
      try {
        const price = v.position.quantity ? v.value / v.position.quantity : 0;
        return simulateSale(state, v.instrument, v.position.account, v.position.quantity, price);
      } catch {
        return null;
      }
    })();
    return {
      name: v.instrument.shortName ?? v.instrument.name,
      fullName: v.instrument.name,
      isin: v.instrument.isin,
      ticker: v.instrument.ticker,
      bank: bank.get(v.position.account) ?? v.position.account,
      assetClass: ASSET_CLASS_LABEL[v.instrument.assetClass],
      currency: v.instrument.currency,
      quantity: v.position.quantity,
      avgCostEur: r2(v.position.avgCost),
      costEur: r2(v.position.totalCost),
      valueEur: r2(v.value),
      weight: r4(invested ? v.value / invested : 0),
      unrealizedEur: r2(v.unrealized),
      unrealizedPct: r4(v.unrealizedPct),
      dayChangePct: r4(v.dayChangePct),
      incomeReceivedEur: r2(v.position.income),
      firstBuy: v.position.firstBuy,
      ter: v.instrument.ter ?? null,
      isFund: isFundLike(v.instrument),
      taxRate: r4(effectiveRate(v.instrument)),
      govBondShare: v.instrument.govBondShare ?? 0,
      // Tipo di reddito se si vendesse oggi: "redditi_capitale" (plus ETF, non compensa) o "redditi_diversi".
      gainKind: incomeKind(v.instrument, v.unrealized),
      priceStale: v.stale,
      saleSimulation: sim
        ? { gainEur: r2(sim.gain), kind: sim.kind, lossesUsedEur: r2(sim.lossesUsed), lossCreatedEur: r2(sim.lossCreated), taxEur: r2(sim.tax), netEur: r2(sim.net) }
        : null,
    };
  });

  const losses = data.accounts
    .map((a) => {
      const lots = usableLosses(state.losses, a.id, today);
      return {
        bank: a.name,
        totalEur: r2(lots.reduce((s, l) => s + l.remaining, 0)),
        lots: lots.map((l) => ({ remainingEur: r2(l.remaining), expires: l.expires, from: name(l.sourceIsin), realizedOn: l.date })),
      };
    })
    .filter((l) => l.totalEur > 0);

  const year = today.slice(0, 4);
  const realizedThisYear = state.realized.filter((r) => r.date.startsWith(year));
  const sumBy = (f: (r: (typeof realizedThisYear)[number]) => boolean, k: "gain" | "tax") => r2(realizedThisYear.filter(f).reduce((s, r) => s + r[k], 0));

  const group = (key: (v: PositionView) => string) => {
    const m = new Map<string, number>();
    for (const v of views) m.set(key(v), (m.get(key(v)) ?? 0) + v.value);
    return [...m.entries()].map(([k, v]) => ({ name: k, valueEur: r2(v), weight: r4(invested ? v / invested : 0) })).sort((a, b) => b.valueEur - a.valueEur);
  };

  // Rendimenti
  const realized = state.realized.reduce((a, r) => a + r.gain, 0);
  const gainNow = totals.unrealized + realized + totals.income;
  const series = history?.length
    ? [...history.filter((h) => h.date < today).map((h) => ({ ...h, value: h.value - (h.cash ?? 0) })), { date: today, value: invested, invested: 0, gain: gainNow }]
    : [];
  const twr = series.length > 1 ? twrSeries(series) : [];
  const months = monthlyReturns(twr);
  const twrFrom = (from: string) => {
    const i = twr.findIndex((p) => p.date >= from);
    return i >= 0 && twr.length ? r4((1 + twr[twr.length - 1].value) / (1 + twr[i].value) - 1) : null;
  };
  const flows = cashFlows(data.transactions);
  const irr = flows.length ? xirr([...flows, { date: today, amount: invested }]) : null;
  const yearAgo = `${Number(year) - 1}${today.slice(4)}`;

  // Cedole
  const nextYear = String(Number(year) + 1);
  const forecast = [...dividendsForYear(year, data.transactions, state, data.instruments, today), ...dividendsForYear(nextYear, data.transactions, state, data.instruments, today)]
    .filter((d) => d.forecast && d.date > today)
    .slice(0, 24);

  const fundIsins = views.filter((v) => isFundLike(v.instrument)).map((v) => v.instrument.isin);
  const haveXray = fundIsins.some((i) => compositions[i]);
  const health = portfolioHealth(views, totals, state, data.accounts, today);

  const yearTx = data.transactions.filter((t) => t.date >= yearAgo).sort((a, b) => b.date.localeCompare(a.date));

  return {
    today,
    totals: {
      totalValueEur: r2(totals.value),
      investedValueEur: r2(invested),
      cashEur: r2(totals.cash),
      costEur: r2(totals.cost),
      unrealizedEur: r2(totals.unrealized),
      unrealizedPct: r4(totals.unrealizedPct),
      realizedGainAllTimeEur: r2(realized),
      incomeAllTimeEur: r2(totals.income),
      dayChangeEur: r2(totals.dayChange),
      dayChangePct: r4(totals.dayChangePct),
      taxIfSoldAllEur: r2(totals.taxIfSold),
      netIfSoldAllEur: r2(totals.netLiquidation),
    },
    positions,
    cash: Object.entries(state.cash).map(([acc, c]) => ({ bank: bank.get(acc) ?? acc, amountEur: r2(c.amount) })),
    losses,
    taxThisYear: {
      gainsDiversiEur: sumBy((r) => r.kind === "redditi_diversi" && r.gain > 0, "gain"),
      gainsCapitaleEur: sumBy((r) => r.kind === "redditi_capitale" && r.gain > 0, "gain"),
      lossesRealizedEur: sumBy((r) => r.gain < 0, "gain"),
      taxPaidOnSalesEur: sumBy(() => true, "tax"),
      incomeNetEur: r2(state.incomeByYear[year] ?? 0),
    },
    allocation: {
      byAssetClass: group((v) => ASSET_CLASS_LABEL[v.instrument.assetClass]),
      byBank: group((v) => bank.get(v.position.account) ?? v.position.account),
      byCurrency: group((v) => v.instrument.currency),
    },
    targets: data.targets ? Object.fromEntries(Object.entries(data.targets).map(([k, v]) => [ASSET_CLASS_LABEL[k as keyof typeof ASSET_CLASS_LABEL] ?? k, v])) : null,
    lookThrough: haveXray
      ? {
          countries: lookThrough(views, compositions, "countries").slice(0, 12).map((x) => ({ name: x.name, weight: r4(x.value / (invested || 1)) })),
          sectors: lookThrough(views, compositions, "sectors").slice(0, 12).map((x) => ({ name: x.name, weight: r4(x.value / (invested || 1)) })),
          topCompanies: topCompanies(views, compositions)
            .slice(0, 15)
            .map((c) => ({ name: c.name, weight: r4(c.value / (invested || 1)), via: c.via })),
          note: "Composizione degli ETF da justETF (prime 10 partecipazioni per ETF).",
        }
      : { note: "Composizione degli ETF non disponibile in questo momento." },
    performance: {
      twrSinceStart: twr.length ? r4(twr[twr.length - 1].value) : null,
      twrYearToDate: twrFrom(`${year}-01-01`),
      twrLast12Months: twrFrom(yearAgo),
      xirrSinceStart: irr !== null ? r4(irr) : null,
      firstDate: twr[0]?.date ?? null,
      monthly: Object.entries(months)
        .slice(-15)
        .map(([m, v]) => ({ month: m, return: r4(v) })),
    },
    dividends: {
      last12MonthsByTitle: trailingDividends(data.transactions, today).map((d) => ({ name: name(d.isin), netEur: r2(d.trailing), payments: d.payments })),
      upcomingForecast: forecast.map((d) => ({ date: d.date, name: name(d.isin), bank: bank.get(d.account) ?? d.account, netEur: r2(d.amount) })),
    },
    goals: (data.goals ?? []).map((g) => ({ name: g.name, targetEur: g.target, by: g.date, scope: g.scope === "tutto" ? "tutto il patrimonio" : g.scope === "liquidita" ? "solo liquidità" : (bank.get(g.scope) ?? g.scope) })),
    plan: data.plan ? { monthlyEur: data.plan.monthly, expectedReturn: data.plan.expectedReturn, years: data.plan.years } : null,
    recurring: (data.recurring ?? [])
      .filter((p) => p.active)
      .map((p) => ({ kind: p.kind, label: p.label, bank: bank.get(p.account) ?? p.account, day: p.day, amountEur: p.amount ?? p.budget ?? null, title: p.isin ? name(p.isin) : null })),
    health: {
      score: health.score,
      areas: health.areas.map((a) => ({ area: a.label, score: a.score, checks: a.checks.map((c) => `${c.level}: ${c.title} — ${c.detail}`) })),
    },
    recentTransactions: yearTx.slice(0, 60).map((t) => ({
      date: t.date,
      type: t.type,
      title: t.isin ? name(t.isin) : null,
      bank: bank.get(t.account) ?? t.account,
      quantity: t.quantity ?? null,
      price: t.price ?? null,
      amountEur: t.amount ?? null,
      feesEur: t.fees ?? null,
    })),
    feesLast12MonthsEur: r2(yearTx.reduce((s, t) => s + (t.fees ?? 0), 0)),
    focus: focus ?? null,
    previous: previous ?? null,
  };
}
