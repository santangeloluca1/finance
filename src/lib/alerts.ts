import type { PositionView } from "./analytics";
import { dividendsForYear } from "./dividends";
import { usableLosses } from "./engine/portfolio";
import type { PortfolioState } from "./engine/types";
import type { PortfolioData } from "./store";
import { pendingOccurrences } from "./recurring";

export interface Alert {
  id: string;
  level: "info" | "attenzione" | "positivo";
  title: string;
  detail: string;
  href: string;
  /** Presente se l'avviso nasce da un promemoria dell'utente. */
  reminderId?: string;
}

const eur = (n: number) => `${Math.round(n).toLocaleString("it-IT")} €`;

/** Avvisi calcolati sul momento dai dati del portafoglio. */
export function computeAlerts(data: PortfolioData, state: PortfolioState, views: PositionView[], totalValue: number, today = new Date().toISOString().slice(0, 10)): Alert[] {
  if (data.isDemo) return [];
  const out: Alert[] = [];
  const nextYearEnd = `${Number(today.slice(0, 4)) + 1}-12-31`;

  for (const acc of data.accounts) {
    const expiring = usableLosses(state.losses, acc.id, today).filter((l) => l.expires <= nextYearEnd);
    if (!expiring.length) continue;
    const amount = expiring.reduce((a, l) => a + l.remaining, 0);
    const first = expiring.map((l) => l.expires).sort()[0];
    out.push({
      id: `minus-${acc.id}-${first}`,
      level: "attenzione",
      title: `${eur(amount)} di minus in scadenza su ${acc.name}`,
      detail: `La prima scade il ${new Date(`${first}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}. Vedi come recuperarle.`,
      href: "/fisco",
    });
  }

  for (const v of views) {
    if (v.dayChangePct <= -0.03 && !v.stale) {
      out.push({
        id: `calo-${v.position.account}-${v.instrument.isin}-${today}`,
        level: "attenzione",
        title: `${v.instrument.shortName ?? v.instrument.name} ${(v.dayChangePct * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}% oggi`,
        detail: `Calo giornaliero sopra il 3%: ${eur(Math.abs(v.dayChange))} sul tuo portafoglio.`,
        href: `/posizioni/${v.instrument.isin}`,
      });
    }
    if (v.stale) {
      out.push({
        id: `stale-${v.instrument.isin}`,
        level: "info",
        title: `Nessuna quotazione per ${v.instrument.shortName ?? v.instrument.name}`,
        detail: `Il valore è stimato al prezzo di carico. Controlla il ticker ${v.instrument.ticker}.`,
        href: `/posizioni/${v.instrument.isin}`,
      });
    }
  }

  const in30 = new Date(Date.parse(`${today}T12:00:00Z`) + 30 * 86400_000).toISOString().slice(0, 10);
  const instruments = new Map(data.instruments.map((i) => [i.isin, i]));
  for (const year of new Set([today.slice(0, 4), in30.slice(0, 4)])) {
    for (const d of dividendsForYear(year, data.transactions, state, data.instruments, today)) {
      if (!d.forecast || d.date < today || d.date > in30) continue;
      const ins = instruments.get(d.isin);
      out.push({
        id: `cedola-${d.isin}-${d.date}`,
        level: "positivo",
        title: `Cedola in arrivo da ${ins?.shortName ?? ins?.name ?? d.isin}`,
        detail: `Circa ${eur(d.amount)} intorno al ${new Date(`${d.date}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}, stimata sull'anno scorso.`,
        href: "/#dividendi",
      });
    }
  }

  const pending = pendingOccurrences(data.recurring ?? [], data.transactions, data.recurringSkipped ?? [], today);
  if (pending.length) {
    out.push({
      id: `ricorrenti-${pending[pending.length - 1].id}-${pending.length}`,
      level: "attenzione",
      title: pending.length === 1 ? `${pending[0].plan.label} da confermare` : `${pending.length} rate ricorrenti da confermare`,
      detail: pending.map((o) => o.plan.label).join(", "),
      href: "/ricorrenti",
    });
  }

  for (const r of data.reminders ?? []) {
    if (r.date > today) continue;
    out.push({
      id: `promemoria-${r.id}-${r.date}`,
      level: "attenzione",
      title: r.title,
      detail: `Promemoria del ${new Date(`${r.date}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`,
      href: "/avvisi",
      reminderId: r.id,
    });
  }

  for (const g of data.goals ?? []) {
    const current = g.scope === "tutto" ? totalValue : null;
    if (current !== null && current >= g.target) {
      out.push({ id: `goal-${g.id}`, level: "positivo", title: `Obiettivo "${g.name}" raggiunto`, detail: `Hai superato ${eur(g.target)}.`, href: "/obiettivi" });
    }
  }

  const dismissed = new Set(data.alertsDismissed ?? []);
  return out.filter((a) => !dismissed.has(a.id));
}

/** Avvisi che accendono la campanella: importanti e non ancora visti. */
export function unseenAlerts(alerts: Alert[], data: PortfolioData) {
  const seen = new Set(data.alertsSeen ?? []);
  return alerts.filter((a) => a.level !== "info" && !seen.has(a.id));
}
