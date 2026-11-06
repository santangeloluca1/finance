import { getFxHistory, getFxLatest } from "./fx";
import { getTradegate, tradegateTime } from "./tradegate";
import { romeClock } from "../notify";
import { getHistory, getIntraday, getQuote, searchYahoo, type Quote } from "./yahoo";

/** Richiesta dal client: "SIMBOLO" oppure "SIMBOLO~ISIN" (l'ISIN abilita le fonti alternative). */
export function parseEntries(v: string | null): { ticker: string; isin?: string }[] {
  const seen = new Set<string>();
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [ticker, isin] = s.split("~");
      return { ticker, isin: isin && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : undefined };
    })
    .filter((e) => e.ticker && !seen.has(e.ticker) && seen.add(e.ticker))
    .slice(0, 100);
}

const EXCHANGE: Record<string, string> = { XETRA: "Xetra", Milan: "Borsa Italiana", Swiss: "Zurigo", Frankfurt: "Francoforte", Munich: "Monaco", LSE: "Londra", Amsterdam: "Amsterdam", Paris: "Parigi" };

/** Il prezzo regolamentato è "vecchio" se ha più di 20 minuti (borsa chiusa o in pausa). */
const STALE_MS = 20 * 60_000;

/**
 * Prezzo più recente: quello di borsa (Yahoo) di giorno; la sera, o se Yahoo
 * non quota il titolo, l'ultimo scambio su Tradegate (aperta fino alle 22).
 * La variazione di oggi resta riferita alla chiusura ufficiale precedente.
 */
export async function bestQuote(ticker: string, isin?: string, now = Date.now()): Promise<Quote> {
  const y = await getQuote(ticker).catch(() => null);
  const yq = y ? { ...y, source: EXCHANGE[y.source ?? ""] ?? y.source } : null;
  // Tradegate quando la borsa ufficiale è ferma: la sera e dopo le 22 resta più recente.
  const wantTg = isin && (!yq || now - yq.time > STALE_MS);
  const tg = wantTg ? await getTradegate(isin!).catch(() => null) : null;
  // Se Tradegate non è più recente della borsa ufficiale, resta quest'ultima.
  if (tg && (!yq || tradegateTime(now) > yq.time + 60_000)) {
    return {
      ticker,
      price: tg.last,
      previousClose: yq?.previousClose ?? tg.close,
      currency: "EUR",
      time: tradegateTime(now),
      name: yq?.name,
      source: "Tradegate",
    };
  }
  if (yq) return yq;
  throw new Error(`Nessuna quotazione per ${ticker}${isin ? ` (${isin})` : ""}`);
}

/**
 * Storico in euro. Se il simbolo non ha dati, prova le altre quotazioni dello
 * stesso ISIN su Yahoo e le converte con il cambio BCE del giorno.
 */
export async function bestHistory(ticker: string, isin: string | undefined, from: string): Promise<[string, number][]> {
  const direct = await getHistory(ticker, from).catch(() => []);
  if (direct.length || !isin) return direct;
  const hits = (await searchYahoo(isin).catch(() => [])).filter((h) => h.symbol !== ticker);
  for (const h of hits) {
    const series = await getHistory(h.symbol, from).catch(() => []);
    if (!series.length) continue;
    const q = await getQuote(h.symbol).catch(() => null);
    if (!q) continue;
    if (q.currency === "EUR") return series;
    const all: Record<string, [string, number][]> = await getFxHistory([q.currency], from).catch(() => ({}));
    const fx = all[q.currency];
    if (!fx?.length) continue;
    let j = 0;
    let rate = fx[0][1];
    return series.map(([d, p]) => {
      while (j < fx.length && fx[j][0] <= d) rate = fx[j++][1];
      return [d, p / rate] as [string, number];
    });
  }
  return [];
}

/**
 * Andamento della giornata in euro: prezzi ogni 5 minuti della borsa (o di
 * un'altra quotazione dello stesso ISIN, convertita al cambio di oggi), più
 * l'ultimo prezzo di Tradegate se è più recente.
 */
export async function bestIntraday(ticker: string, isin?: string, now = Date.now()) {
  let data = await getIntraday(ticker).catch(() => null);
  let rate = 1;
  if ((!data || !data.points.length) && isin) {
    for (const h of (await searchYahoo(isin).catch(() => [])).filter((x) => x.symbol !== ticker && !x.symbol.startsWith(isin))) {
      const alt = await getIntraday(h.symbol).catch(() => null);
      if (!alt?.points.length) continue;
      if (alt.currency !== "EUR") {
        const fx: Record<string, number> = await getFxLatest([alt.currency]).catch(() => ({}));
        if (!fx[alt.currency]) continue;
        rate = fx[alt.currency];
      }
      data = alt;
      break;
    }
  }
  const points = (data?.points ?? []).map(([d, p]) => [d, p / rate] as [string, number]);
  const previousClose = (data?.previousClose ?? 0) / rate;
  const live = await bestQuote(ticker, isin, now).catch(() => null);
  const lastTime = points.length ? Date.parse(points[points.length - 1][0]) : 0;
  // Il prezzo live (es. Tradegate la mattina presto) si aggiunge solo se è della stessa seduta.
  const sameDay = !points.length || romeClock(new Date(live?.time ?? 0)).date === romeClock(new Date(lastTime)).date;
  if (live && live.time > lastTime + 60_000 && sameDay) points.push([new Date(live.time).toISOString(), live.price]);
  return { points, previousClose: previousClose || live?.previousClose || points[0]?.[1] || 0, source: live?.source };
}
