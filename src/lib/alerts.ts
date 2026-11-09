import { fmtN } from "./format";
import type { PositionView, Quotes, Totals } from "./analytics";
import { dividendsForYear } from "./dividends";
import { usableLosses } from "./engine/portfolio";
import type { PortfolioState } from "./engine/types";
import type { PortfolioData } from "./store";
import { isAuto, lastAmount, pacQuantity, pendingOccurrences, type Occurrence } from "./recurring";
import { readRule, ruleAlert, settingsOf, type AutoKind } from "./notify";

export interface Alert {
  id: string;
  level: "info" | "attenzione" | "positivo";
  title: string;
  detail: string;
  href: string;
  /** Categoria automatica, oppure "regola" per le regole dell'utente. */
  kind: AutoKind | "regola";
  /** Presente se l'avviso nasce da un promemoria dell'utente. */
  reminderId?: string;
  /** Presente se l'avviso nasce da una regola dell'utente. */
  ruleId?: string;
}

const eur = (n: number) => `${fmtN(Math.round(n))} €`;

/** Avvisi calcolati sul momento dai dati del portafoglio. */
export function computeAlerts(
  data: PortfolioData,
  state: PortfolioState,
  views: PositionView[],
  totals: Totals,
  quotes: Quotes = {},
  today = new Date().toISOString().slice(0, 10),
): Alert[] {
  if (data.isDemo) return [];
  const out: Alert[] = [];
  const settings = settingsOf(data.notify);
  const totalValue = totals.value;
  const nextYearEnd = `${Number(today.slice(0, 4)) + 1}-12-31`;

  for (const acc of data.accounts) {
    const expiring = usableLosses(state.losses, acc.id, today).filter((l) => l.expires <= nextYearEnd);
    if (!expiring.length) continue;
    const amount = expiring.reduce((a, l) => a + l.remaining, 0);
    const first = expiring.map((l) => l.expires).sort()[0];
    out.push({
      id: `minus-${acc.id}-${first}`,
      kind: "minus",
      level: "attenzione",
      title: `${eur(amount)} di minus stanno per scadere`,
      detail: `Su ${acc.name} la prima scade il ${new Date(`${first}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}. Usale contro una plusvalenza prima di perderle: tocca per vedere come.`,
      href: "/fisco",
    });
  }

  for (const v of views) {
    if (v.dayChangePct <= -settings.dropThreshold && !v.stale) {
      out.push({
        id: `calo-${v.position.account}-${v.instrument.isin}-${today}`,
        kind: "calo",
        level: "attenzione",
        title: `${v.instrument.shortName ?? v.instrument.name} cade del ${fmtN(Math.abs(v.dayChangePct * 100), { maximumFractionDigits: 1 })}% oggi`,
        detail: `Sono ${eur(Math.abs(v.dayChange))} in meno sulla tua posizione, che ora vale ${eur(v.value)}.`,
        href: `/posizioni/${v.instrument.isin}`,
      });
    }
    if (v.stale) {
      out.push({
        id: `stale-${v.instrument.isin}`,
        kind: "quotazioni",
        level: "info",
        title: `${v.instrument.shortName ?? v.instrument.name} senza prezzo aggiornato`,
        detail: `Il valore è stimato al prezzo di carico finché non arriva una quotazione. Controlla il simbolo ${v.instrument.ticker}.`,
        href: `/posizioni/${v.instrument.isin}`,
      });
    }
  }

  // L'intero portafoglio si muove molto in una giornata.
  const move = totals.dayChangePct;
  if (views.some((v) => !v.stale) && Math.abs(move) >= settings.moveThreshold) {
    const up = move > 0;
    out.push({
      id: `portafoglio-${up ? "su" : "giu"}-${today}`,
      kind: "portafoglio",
      level: up ? "positivo" : "attenzione",
      title: up
        ? `Portafoglio in forte rialzo: +${fmtN(move * 100, { maximumFractionDigits: 1 })}%`
        : `Portafoglio in forte calo: −${fmtN(Math.abs(move * 100), { maximumFractionDigits: 1 })}%`,
      detail: `${up ? "+" : "−"}${eur(Math.abs(totals.dayChange))} dalla chiusura di ieri: ora vale ${eur(totals.value)}.`,
      href: "/",
    });
  }

  const in30 = new Date(Date.parse(`${today}T12:00:00Z`) + 30 * 86400_000).toISOString().slice(0, 10);
  const instruments = new Map(data.instruments.map((i) => [i.isin, i]));
  for (const year of new Set([today.slice(0, 4), in30.slice(0, 4)])) {
    for (const d of dividendsForYear(year, data.transactions, state, data.instruments, today)) {
      if (!d.forecast || d.date < today || d.date > in30) continue;
      const ins = instruments.get(d.isin);
      out.push({
        id: `cedola-${d.isin}-${d.date}`,
        kind: "cedole",
        level: "positivo",
        title: `In arrivo circa ${eur(d.amount)} da ${ins?.shortName ?? ins?.name ?? d.isin}`,
        detail: `Il dividendo dovrebbe arrivare intorno al ${new Date(`${d.date}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}. Stima basata su quello dell'anno scorso.`,
        href: "/#dividendi",
      });
    }
  }

  // I piani automatici si registrano da soli all'apertura dell'app: niente richiesta di conferma.
  const pending = pendingOccurrences(data.recurring ?? [], data.transactions, data.recurringSkipped ?? [], today).filter((o) => !isAuto(o.plan));
  if (pending.length) {
    const estimate = (o: Occurrence) => {
      const p = o.plan;
      const v = p.kind === "pac" ? p.budget : p.kind === "deposit" ? lastAmount(p, data.transactions) : p.amount;
      return v ? `${p.kind === "pac" ? "fino a " : p.kind === "deposit" ? "circa " : ""}${eur(v)}` : "";
    };
    const one = pending.length === 1 ? pending[0] : null;
    out.push({
      id: `ricorrenti-${pending[pending.length - 1].id}-${pending.length}`,
      kind: "ricorrenti",
      level: "attenzione",
      title: one
        ? one.plan.kind === "deposit"
          ? `${one.plan.label}: quanto è arrivato?`
          : one.plan.kind === "pac"
            ? `${one.plan.label}: rata da registrare`
            : `${one.plan.label}: confermi?`
        : `${pending.length} rate da confermare`,
      detail: one
        ? one.plan.kind === "deposit"
          ? `${estimate(one) ? `Previsto ${estimate(one)}. ` : ""}Tocca per confermarlo o scrivere la cifra giusta.`
          : one.plan.kind === "pac"
            ? `${estimate(one) ? `Budget ${estimate(one)}. ` : ""}Inserisci quote e prezzo che ti ha addebitato la banca.`
            : `${estimate(one) ? `${estimate(one).replace(/^./, (c) => c.toUpperCase())} in uscita. ` : ""}Tocca per confermare o correggere.`
        : `${pending.map((o) => `${o.plan.label}${estimate(o) ? ` (${estimate(o)})` : ""}`).join(", ")}. Tocca per confermarle.`,
      href: "/ricorrenti",
    });
  }

  // Rate automatiche che non partiranno perché sul conto manca liquidità: si simulano
  // in ordine di data sul saldo di oggi (le rate non ancora registrate non ci sono).
  const autoDue = pendingOccurrences(data.recurring ?? [], data.transactions, data.recurringSkipped ?? [], today).filter((o) => isAuto(o.plan));
  if (autoDue.length) {
    const cash = new Map(Object.entries(state.cash).map(([a, c]) => [a, c.amount]));
    const avail = (a: string) => cash.get(a) ?? 0;
    for (const o of autoDue) {
      const p = o.plan;
      let need = 0;
      if (p.kind === "deposit") {
        cash.set(p.account, avail(p.account) + (p.amount ?? 0));
        continue;
      }
      if (p.kind === "transfer") need = p.amount ?? 0;
      else {
        // Gli acquisti toccano la liquidità solo sui conti di cui è noto il saldo.
        if (!cash.has(p.account)) continue;
        // Prezzo in euro dalla posizione aperta; senza, si usa il budget intero.
        const v = views.find((x) => x.instrument.isin === p.isin && x.position.quantity > 0 && x.value > 0);
        const priceEur = v ? v.value / v.position.quantity : 0;
        need = priceEur ? pacQuantity(p.budget ?? 0, priceEur) * priceEur : (p.budget ?? 0);
      }
      if (need <= 0) continue;
      if (need > avail(p.account) + 0.005) {
        const name = data.accounts.find((a) => a.id === p.account)?.name ?? p.account;
        out.push({
          id: `liquidita-${o.id}`,
          kind: "ricorrenti",
          level: "attenzione",
          title: `${p.label} bloccato: manca liquidità`,
          detail: `Su ${name} hai ${eur(Math.max(0, avail(p.account)))}, ne servono ${p.kind === "pac" ? "circa " : ""}${eur(need)}. Aggiungi ${eur(need - Math.max(0, avail(p.account)))} e conferma la rata.`,
          href: "/ricorrenti",
        });
        continue;
      }
      cash.set(p.account, avail(p.account) - need);
      if (p.kind === "transfer" && p.toAccount) cash.set(p.toAccount, avail(p.toAccount) + need);
    }
  }

  for (const r of data.reminders ?? []) {
    if (r.date > today) continue;
    out.push({
      id: `promemoria-${r.id}-${r.date}`,
      kind: "promemoria",
      level: "attenzione",
      title: r.title,
      detail: r.date === today ? "Promemoria per oggi. Tocca per segnarlo come fatto." : `Promemoria del ${new Date(`${r.date}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}, ancora da fare.`,
      href: "/avvisi",
      reminderId: r.id,
    });
  }

  for (const g of data.goals ?? []) {
    const current = g.scope === "tutto" ? totalValue : null;
    if (current !== null && current >= g.target) {
      out.push({ id: `goal-${g.id}`, kind: "obiettivi", level: "positivo", title: `Obiettivo raggiunto: ${g.name}`, detail: `Hai superato ${eur(g.target)}: il patrimonio ora vale ${eur(current)}. Complimenti!`, href: "/#obiettivi" });
    }
  }

  // Regole dell'utente.
  const ctx = { views, totals, quotes, instruments: data.instruments };
  for (const rule of data.alertRules ?? []) {
    if (!rule.enabled) continue;
    const reading = readRule(rule, ctx);
    if (!reading.hit) continue;
    out.push({ ...ruleAlert(rule, reading, data.instruments, today), kind: "regola", level: "attenzione", ruleId: rule.id });
  }

  const dismissed = new Set(data.alertsDismissed ?? []);
  return out.filter((a) => !dismissed.has(a.id));
}

/** Emoji davanti al titolo della notifica push, per riconoscerla a colpo d'occhio (nell'app ci sono le icone). */
export function pushIcon(a: Pick<Alert, "id" | "kind" | "level">): string {
  if (a.id.startsWith("liquidita-")) return "⚠️";
  switch (a.kind) {
    case "calo":
      return "📉";
    case "portafoglio":
      return a.level === "positivo" ? "🚀" : "📉";
    case "minus":
      return "⏳";
    case "cedole":
      return "💰";
    case "ricorrenti":
      return "🗓️";
    case "obiettivi":
      return "🎯";
    case "quotazioni":
      return "❔";
    default:
      return "🔔";
  }
}

/** Avvisi da inviare come notifica push secondo le impostazioni. */
export function pushableAlerts(alerts: Alert[], data: PortfolioData) {
  const off = new Set(settingsOf(data.notify).off);
  const seen = new Set(data.alertsSeen ?? []);
  return alerts.filter((a) => (a.kind === "regola" || !off.has(a.kind)) && !seen.has(a.id));
}

/** Avvisi che accendono la campanella: importanti e non ancora visti. */
export function unseenAlerts(alerts: Alert[], data: PortfolioData) {
  const seen = new Set(data.alertsSeen ?? []);
  return alerts.filter((a) => a.level !== "info" && !seen.has(a.id));
}
