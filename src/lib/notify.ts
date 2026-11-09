import { fmtN } from "./format";
import type { PositionView, Quotes, Totals } from "./analytics";
import type { Instrument } from "./engine/types";

/**
 * Notifiche: avvisi automatici (con interruttori e soglie) e regole create
 * dall'utente. Modulo puro, usato sia dall'app sia dal job sul server che
 * invia le notifiche push.
 */

/** Categorie di avvisi automatici. */
export type AutoKind = "minus" | "calo" | "portafoglio" | "cedole" | "ricorrenti" | "promemoria" | "obiettivi" | "quotazioni";

export const AUTO_KINDS: { kind: AutoKind; label: string; hint: string }[] = [
  { kind: "calo", label: "Cali forti di un titolo", hint: "Quando un tuo titolo perde più della soglia in un giorno" },
  { kind: "portafoglio", label: "Movimenti del portafoglio", hint: "Quando l'intero portafoglio sale o scende più della soglia" },
  { kind: "minus", label: "Minus in scadenza", hint: "Minusvalenze che scadono entro la fine dell'anno prossimo" },
  { kind: "cedole", label: "Cedole in arrivo", hint: "Stacchi previsti nei prossimi 30 giorni" },
  { kind: "ricorrenti", label: "Rate da confermare", hint: "Versamenti e PAC ricorrenti da registrare" },
  { kind: "promemoria", label: "Promemoria", hint: "I tuoi promemoria, la mattina del giorno" },
  { kind: "obiettivi", label: "Obiettivi raggiunti", hint: "Quando superi il traguardo di un obiettivo" },
  { kind: "quotazioni", label: "Quotazioni mancanti", hint: "Titoli senza prezzo aggiornato" },
];

export interface NotifySettings {
  /** Categorie spente (per le notifiche push; nell'app restano visibili). */
  off?: AutoKind[];
  /** Calo giornaliero di un titolo che fa scattare l'avviso (0.03 = 3%). */
  dropThreshold?: number;
  /** Variazione giornaliera del portafoglio (in su o in giù). */
  moveThreshold?: number;
  /** Riepilogo della giornata dopo la chiusura delle borse. */
  summary?: boolean;
  /** Non disturbare dalle 22 alle 8: le notifiche arrivano dopo. */
  quiet?: boolean;
}

export const DEFAULT_SETTINGS: Required<NotifySettings> = {
  off: ["quotazioni"],
  dropThreshold: 0.03,
  moveThreshold: 0.02,
  summary: true,
  quiet: true,
};

export function settingsOf(s: NotifySettings | undefined): Required<NotifySettings> {
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(s ?? {}).filter(([, v]) => v !== undefined)) } as Required<NotifySettings>;
}

export type RuleKind = "price" | "dayMove" | "gain" | "value" | "weight";

export interface AlertRule {
  id: string;
  kind: RuleKind;
  /** ISIN del titolo, oppure "portfolio" per le regole sull'intero portafoglio. */
  target: string;
  /** above: sopra la soglia (o rialzo); below: sotto (o ribasso). */
  op: "above" | "below";
  /**
   * Soglia: prezzo nella valuta del titolo (price), frazione (dayMove, gain, weight: 0.05 = 5%),
   * euro (value). Per dayMove è sempre positiva: il verso lo dà `op`.
   */
  threshold: number;
  /** once: una sola notifica; daily: al massimo una al giorno finché la condizione vale. */
  repeat: "once" | "daily";
  enabled: boolean;
  /** Testo libero aggiunto alla notifica. */
  note?: string;
  createdAt?: string;
}

export const RULE_KINDS: { kind: RuleKind; label: string; portfolio: boolean; instrument: boolean }[] = [
  { kind: "price", label: "Prezzo di un titolo", portfolio: false, instrument: true },
  { kind: "dayMove", label: "Variazione di oggi", portfolio: true, instrument: true },
  { kind: "gain", label: "Guadagno sul prezzo di carico", portfolio: true, instrument: true },
  { kind: "value", label: "Valore del portafoglio", portfolio: true, instrument: false },
  { kind: "weight", label: "Peso di un titolo", portfolio: false, instrument: true },
];

export interface RuleContext {
  views: PositionView[];
  totals: Totals;
  quotes: Quotes;
  instruments: Instrument[];
}

export interface RuleReading {
  /** Valore attuale misurato dalla regola (stessa unità della soglia). */
  current: number | null;
  /** Condizione soddisfatta adesso. */
  hit: boolean;
  /** Valore formattato per l'interfaccia. */
  label: string;
}

const eur = (n: number, digits = 0) => `${fmtN(n, { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;
const pct = (n: number, signed = false) => `${signed && n > 0 ? "+" : n < 0 ? "−" : ""}${fmtN(Math.abs(n * 100), { maximumFractionDigits: 2 })}%`;

export function fmtPrice(n: number, currency: string) {
  const s = fmtN(n, { minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 4 : 2 });
  return currency === "EUR" ? `${s} €` : `${s} ${currency}`;
}

/** Misura attuale della regola e se la condizione è vera. */
export function readRule(rule: AlertRule, ctx: RuleContext): RuleReading {
  const portfolio = rule.target === "portfolio";
  const rows = portfolio ? ctx.views : ctx.views.filter((v) => v.instrument.isin === rule.target);
  const ins = ctx.instruments.find((i) => i.isin === rule.target);
  const invested = ctx.totals.value - ctx.totals.cash;
  let current: number | null = null;
  let label = "—";

  switch (rule.kind) {
    case "price": {
      const q = ins ? ctx.quotes[ins.ticker] : undefined;
      if (q && ins) {
        current = q.price;
        label = fmtPrice(q.price, ins.currency);
      }
      break;
    }
    case "dayMove": {
      if (portfolio) {
        current = ctx.totals.dayChangePct;
      } else if (rows.length && rows.every((r) => !r.stale)) {
        current = rows[0].dayChangePct;
      } else if (ins) {
        const q = ctx.quotes[ins.ticker];
        if (q?.previousClose) current = q.price / q.previousClose - 1;
      }
      if (current !== null) label = pct(current, true);
      break;
    }
    case "gain": {
      const live = rows.filter((r) => !r.stale);
      const cost = live.reduce((a, r) => a + r.position.totalCost, 0);
      const value = live.reduce((a, r) => a + r.value, 0);
      if (cost > 0) {
        current = value / cost - 1;
        label = pct(current, true);
      }
      break;
    }
    case "value": {
      current = ctx.totals.value;
      label = eur(current);
      break;
    }
    case "weight": {
      const value = rows.reduce((a, r) => a + r.value, 0);
      if (invested > 0) {
        current = value / invested;
        label = pct(current);
      }
      break;
    }
  }
  if (current === null || !Number.isFinite(current)) return { current: null, hit: false, label };
  const hit =
    rule.kind === "dayMove"
      ? rule.op === "above"
        ? current >= rule.threshold
        : current <= -rule.threshold
      : rule.op === "above"
        ? current >= rule.threshold
        : current <= rule.threshold;
  return { current, hit, label };
}

/** Descrizione breve della regola: "VWCE sotto 110,00 €". */
export function describeRule(rule: AlertRule, instruments: Instrument[]): string {
  const ins = instruments.find((i) => i.isin === rule.target);
  const name = rule.target === "portfolio" ? "Portafoglio" : (ins?.shortName ?? ins?.name ?? rule.target);
  const up = rule.op === "above";
  switch (rule.kind) {
    case "price":
      return `${name} ${up ? "sopra" : "sotto"} ${fmtPrice(rule.threshold, ins?.currency ?? "EUR")}`;
    case "dayMove":
      return `${name} ${up ? "sale" : "scende"} di oltre ${pct(rule.threshold)} in un giorno`;
    case "gain":
      return `${name}: guadagno ${up ? "oltre" : "sotto"} ${pct(rule.threshold, true)}`;
    case "value":
      return `Portafoglio ${up ? "sopra" : "sotto"} ${eur(rule.threshold)}`;
    case "weight":
      return `${name} ${up ? "oltre" : "sotto"} il ${pct(rule.threshold)} del portafoglio`;
  }
}

/** Avviso nato da una regola che si è verificata. */
export function ruleAlert(rule: AlertRule, reading: RuleReading, instruments: Instrument[], today: string) {
  const ins = instruments.find((i) => i.isin === rule.target);
  const name = rule.target === "portfolio" ? "Il portafoglio" : (ins?.shortName ?? ins?.name ?? rule.target);
  const verb: Record<RuleKind, string> = {
    price: `è a ${reading.label}`,
    dayMove: `oggi ${reading.label}`,
    gain: `guadagna ${reading.label} sul prezzo di carico`,
    value: `vale ${reading.label}`,
    weight: `pesa il ${reading.label} del portafoglio`,
  };
  return {
    id: rule.repeat === "once" ? `regola-${rule.id}` : `regola-${rule.id}-${today}`,
    title: `${name} ${verb[rule.kind]}`,
    detail: rule.note?.trim() || `Avviso: ${describeRule(rule, instruments)}.`,
    href: rule.target === "portfolio" ? "/" : `/posizioni/${rule.target}`,
  };
}

/** Riepilogo della giornata: com'è andata in euro, poi percentuale e valore. */
export function dailySummary(views: PositionView[], totals: Totals, today: string) {
  if (!views.some((v) => !v.stale)) return null;
  const flat = Math.abs(totals.dayChangePct) < 0.001;
  const up = totals.dayChange >= 0;
  const money = `${up ? "+" : "−"}${eur(Math.abs(totals.dayChange))}`;
  return {
    id: `riepilogo-${today}`,
    title: `${flat ? "Giornata tranquilla" : up ? "Giornata positiva" : "Giornata in calo"}: ${money}`,
    detail: `${pct(totals.dayChangePct, true)}, ora vale ${eur(totals.value)}.`,
    href: "/",
  };
}

/** Data, ora e giorno della settimana in Italia (il server gira in UTC). */
export function romeClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: parts.weekday as string };
}

export function isQuietTime(time: string) {
  return time >= "22:00" || time < "08:00";
}

/** Il riepilogo parte nei giorni feriali dopo le 17:45, a borse europee chiuse. */
export function isSummaryTime(clock: { time: string; weekday: string }) {
  return !["Sat", "Sun"].includes(clock.weekday) && clock.time >= "17:45";
}
