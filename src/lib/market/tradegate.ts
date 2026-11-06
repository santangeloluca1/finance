import { cached } from "./cache";

/**
 * Tradegate (Berlino): scambi dalle 8 alle 22, utile per avere un prezzo la
 * sera, quando Borsa Italiana e Xetra sono chiuse. Endpoint pubblico non
 * ufficiale; i numeri arrivano a volte come stringhe all'italiana ("36,00").
 */
const BASE = "https://www.tradegatebsx.com/refresh.php?isin=";

export interface TradegateQuote {
  last: number;
  /** Chiusura del giorno di borsa precedente su Tradegate. */
  close: number;
  bid?: number;
  ask?: number;
}

export function parseNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string" || !v.trim()) return undefined;
  const s = v.trim().replace(/\s/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : undefined;
}

export function parseTradegate(json: Record<string, unknown>): TradegateQuote | null {
  const last = parseNumber(json.last);
  const close = parseNumber(json.close);
  if (!last || last <= 0) return null;
  return { last, close: close && close > 0 ? close : last, bid: parseNumber(json.bid), ask: parseNumber(json.ask) };
}

export function getTradegate(isin: string): Promise<TradegateQuote | null> {
  return cached(`tg:${isin}`, 60_000, async () => {
    const res = await fetch(`${BASE}${encodeURIComponent(isin)}`, { headers: { "User-Agent": "Mozilla/5.0 (portafoglio personale)" }, cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith("{")) return null;
    return parseTradegate(JSON.parse(text) as Record<string, unknown>);
  });
}

/** Ora e giorno della settimana a Berlino (dove sono Xetra e Tradegate). */
function berlinClock(now: number) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Tradegate è aperta (giorni feriali, 8:00-22:00 ora di Berlino). */
export function tradegateOpen(now = Date.now()) {
  const { weekday, minutes } = berlinClock(now);
  return !["Sat", "Sun"].includes(weekday) && minutes >= 8 * 60 && minutes < 22 * 60;
}

/** Minuti di differenza tra Berlino e UTC in quell'istante (60 d'inverno, 120 d'estate). */
function berlinOffset(ms: number) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "shortOffset" }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const m = name.match(/GMT([+-]\d+)(?::(\d+))?/);
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : 60;
}

/**
 * Istante dell'ultimo prezzo Tradegate: adesso se è aperta, altrimenti la
 * chiusura delle 22 dell'ultimo giorno feriale.
 */
export function tradegateTime(now = Date.now()) {
  if (tradegateOpen(now)) return now;
  for (let k = 0; k < 8; k++) {
    const day = new Date(now - k * 86400_000);
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(day); // YYYY-MM-DD
    const wd = new Date(`${ymd}T12:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const close = Date.parse(`${ymd}T22:00:00Z`) - berlinOffset(Date.parse(`${ymd}T20:00:00Z`)) * 60_000;
    if (close <= now) return close;
  }
  return now;
}
