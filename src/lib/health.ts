import { fmtN } from "./format";
import type { PositionView, Totals } from "./analytics";
import { usableLosses } from "./engine/portfolio";
import { isFundLike } from "./engine/tax";
import type { Account, PortfolioState } from "./engine/types";

/**
 * Controllo dello stato di salute del portafoglio, a regole (senza AI).
 * Quattro aree da 25 punti: diversificazione, costi, fisco, liquidità.
 */

export type Level = "ok" | "attenzione" | "critico";

export interface Check {
  title: string;
  detail: string;
  level: Level;
}

export interface Area {
  id: "diversificazione" | "costi" | "fisco" | "liquidita";
  label: string;
  score: number; // 0..25
  checks: Check[];
}

export interface Health {
  score: number; // 0..100
  areas: Area[];
}

const pct = (n: number) => `${fmtN((n * 100), { maximumFractionDigits: 1 })}%`;
const eur = (n: number) => `${fmtN(Math.round(n))} €`;

export function portfolioHealth(views: PositionView[], totals: Totals, state: PortfolioState, accounts: Account[], today = new Date().toISOString().slice(0, 10)): Health {
  const invested = totals.invested || 1;
  const total = totals.invested + totals.cashAvailable || 1;

  // --- Diversificazione ---
  const byInstrument = new Map<string, { name: string; value: number; fund: boolean }>();
  for (const v of views) {
    const cur = byInstrument.get(v.instrument.isin) ?? { name: v.instrument.shortName ?? v.instrument.name, value: 0, fund: isFundLike(v.instrument) };
    cur.value += v.value;
    byInstrument.set(v.instrument.isin, cur);
  }
  const holdings = [...byInstrument.values()].sort((a, b) => b.value - a.value);
  const div: Check[] = [];
  let divScore = 25;
  const top = holdings[0];
  const singleStocks = holdings.filter((h) => !h.fund);
  const topStock = singleStocks[0];
  if (!holdings.length) {
    div.push({ title: "Nessun titolo in portafoglio", detail: "Aggiungi i tuoi movimenti per un'analisi completa.", level: "attenzione" });
    divScore = 10;
  } else {
    if (topStock && topStock.value / invested > 0.15) {
      div.push({ title: `${topStock.name} pesa ${pct(topStock.value / invested)}`, detail: "Una singola azione oltre il 15% del portafoglio aumenta il rischio specifico.", level: topStock.value / invested > 0.3 ? "critico" : "attenzione" });
      divScore -= topStock.value / invested > 0.3 ? 12 : 6;
    }
    const funds = holdings.filter((h) => h.fund).length;
    if (funds === 0 && singleStocks.length < 10) {
      div.push({ title: `Solo ${singleStocks.length} azioni, nessun ETF`, detail: "Con poche azioni il risultato dipende da poche aziende. Un ETF ampio diversifica con un solo acquisto.", level: "attenzione" });
      divScore -= 8;
    } else {
      div.push({ title: `${holdings.length} titoli, di cui ${funds} ETF`, detail: "Gli ETF ampi danno una buona diversificazione di base.", level: "ok" });
    }
    const usd = views.filter((v) => v.instrument.currency !== "EUR").reduce((a, v) => a + v.value, 0) / invested;
    if (usd > 0.4) {
      div.push({ title: `${pct(usd)} in valute diverse dall'euro`, detail: "Una quota alta in dollari o altre valute espone alle oscillazioni del cambio.", level: "attenzione" });
      divScore -= 4;
    }
    if (top && top.value / invested > 0.6 && holdings.length > 1) {
      div.push({ title: `${top.name} vale ${pct(top.value / invested)}`, detail: "Un singolo strumento domina il portafoglio: va bene solo se è un ETF molto diversificato.", level: top.fund ? "ok" : "critico" });
    }
  }

  // --- Costi ---
  const ter = views.reduce((a, v) => a + (v.value * (v.instrument.ter ?? 0)) / 100, 0);
  const terPct = ter / invested;
  const bollo = totals.invested * 0.002;
  const costs: Check[] = [];
  let costScore = 25;
  if (terPct > 0.005) {
    costs.push({ title: `TER medio ${pct(terPct)}`, detail: "Sopra lo 0,5% annuo i costi pesano molto nel lungo periodo: esistono ETF equivalenti più economici.", level: "critico" });
    costScore -= 15;
  } else if (terPct > 0.003) {
    costs.push({ title: `TER medio ${pct(terPct)}`, detail: "Nella media. Controlla se ci sono alternative più economiche per i fondi più costosi.", level: "attenzione" });
    costScore -= 6;
  } else {
    costs.push({ title: `TER medio ${pct(terPct)}`, detail: `Costi di gestione bassi: circa ${eur(ter)} l'anno.`, level: "ok" });
  }
  costs.push({ title: `Imposta di bollo circa ${eur(bollo)} l'anno`, detail: "0,2% del valore dei titoli: è uguale per tutti gli strumenti finanziari.", level: "ok" });

  // --- Fisco ---
  const tax: Check[] = [];
  let taxScore = 25;
  const nextYearEnd = `${Number(today.slice(0, 4)) + 1}-12-31`;
  for (const acc of accounts) {
    const lots = usableLosses(state.losses, acc.id, today);
    if (!lots.length) continue;
    const available = lots.reduce((a, l) => a + l.remaining, 0);
    const expiring = lots.filter((l) => l.expires <= nextYearEnd).reduce((a, l) => a + l.remaining, 0);
    const compensable = views.filter((v) => v.position.account === acc.id && !isFundLike(v.instrument) && v.unrealized > 0).reduce((a, v) => a + v.unrealized, 0);
    if (expiring > 0) {
      tax.push({
        title: `${eur(expiring)} di minus in scadenza su ${acc.name}`,
        detail: compensable > 0 ? `Puoi recuperarle realizzando plus su azioni o ETC in guadagno su ${acc.name} (fino a ${eur(compensable)}).` : `Scadono entro fine ${Number(today.slice(0, 4)) + 1}: servono plus da azioni, ETC o obbligazioni su ${acc.name}, gli ETF non valgono.`,
        level: compensable > 0 ? "attenzione" : "critico",
      });
      taxScore -= compensable > 0 ? 5 : 10;
    } else {
      tax.push({ title: `${eur(available)} di minus su ${acc.name}`, detail: "Non scadono a breve. Le plus da ETF non le compensano.", level: "ok" });
    }
  }
  const etfGain = views.filter((v) => isFundLike(v.instrument) && v.unrealized > 0).reduce((a, v) => a + v.unrealized, 0);
  if (!tax.length) tax.push({ title: "Nessuna minusvalenza da gestire", detail: "Lo zainetto fiscale è vuoto.", level: "ok" });
  if (etfGain > 0) tax.push({ title: `Tasse latenti stimate ${eur(totals.taxIfSold)}`, detail: "È quanto pagheresti vendendo tutto oggi. Vendere solo per ribilanciare ha un costo fiscale: meglio ribilanciare con i nuovi versamenti.", level: "ok" });

  // --- Liquidità ---
  const liq: Check[] = [];
  let liqScore = 25;
  const cashShare = totals.cashAvailable / total;
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  for (const n of totals.negativeCash) {
    liq.push({
      title: `Saldo negativo su ${names.get(n.account) ?? n.account}: ${eur(n.amount)}`,
      detail: "Mancano dei versamenti: gli acquisti superano la liquidità registrata. Aggiungi i versamenti o un saldo aggiornato.",
      level: "critico",
    });
    liqScore -= 10;
  }
  if (totals.cashAvailable <= 0) {
    liq.push({ title: "Nessuna liquidità registrata", detail: "Se hai un fondo per le emergenze su un conto, aggiungilo come saldo di liquidità per vederlo nel patrimonio.", level: "attenzione" });
    liqScore -= 8;
  } else if (cashShare > 0.4) {
    liq.push({ title: `Liquidità al ${pct(cashShare)} del patrimonio`, detail: "Oltre il fondo emergenza, la liquidità ferma perde potere d'acquisto con l'inflazione.", level: "attenzione" });
    liqScore -= 8;
  } else {
    liq.push({ title: `Liquidità al ${pct(cashShare)} del patrimonio`, detail: `${eur(totals.cashAvailable)} disponibili per emergenze e nuove opportunità.`, level: "ok" });
  }
  const stale = views.filter((v) => v.stale).length;
  if (stale) {
    liq.push({ title: `${stale} titoli senza quotazione`, detail: "Il loro valore è stimato al prezzo medio di carico: controlla il ticker.", level: "attenzione" });
    liqScore -= 4;
  }

  const areas: Area[] = [
    { id: "diversificazione", label: "Diversificazione", score: clamp(divScore), checks: div },
    { id: "costi", label: "Costi", score: clamp(costScore), checks: costs },
    { id: "fisco", label: "Fisco", score: clamp(taxScore), checks: tax },
    { id: "liquidita", label: "Liquidità e dati", score: clamp(liqScore), checks: liq },
  ];
  return { score: areas.reduce((a, x) => a + x.score, 0), areas };
}

function clamp(n: number) {
  return Math.max(0, Math.min(25, Math.round(n)));
}
