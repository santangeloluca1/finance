import { cached } from "./cache";

/**
 * Quotazioni da Yahoo Finance (endpoint pubblico non ufficiale, uso personale).
 * Le borse europee hanno in genere ~15 minuti di ritardo.
 */

const BASE = "https://query2.finance.yahoo.com/v8/finance/chart/";
const HEADERS = { "User-Agent": "Mozilla/5.0 (portafoglio personale)" };

export interface Quote {
  ticker: string;
  price: number;
  previousClose: number;
  currency: string;
  /** Timestamp ultimo prezzo, millisecondi. */
  time: number;
  name?: string;
  /** Mercato del prezzo (es. "Xetra", "Borsa Italiana", "Tradegate"). */
  source?: string;
}

interface ChartResponse {
  chart: {
    result?: Array<{
      meta: {
        regularMarketPrice: number;
        chartPreviousClose?: number;
        previousClose?: number;
        currency: string;
        regularMarketTime: number;
        longName?: string;
        shortName?: string;
        fullExchangeName?: string;
      };
      timestamp?: number[];
      indicators: { quote: Array<{ close: Array<number | null> }> };
    }>;
    error?: { description: string } | null;
  };
}

async function chart(ticker: string, params: string): Promise<NonNullable<ChartResponse["chart"]["result"]>[number]> {
  const res = await fetch(`${BASE}${encodeURIComponent(ticker)}?${params}`, {
    headers: HEADERS,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo ${ticker}: HTTP ${res.status}`);
  const json = (await res.json()) as ChartResponse;
  const result = json.chart.result?.[0];
  if (!result) throw new Error(`Yahoo ${ticker}: ${json.chart.error?.description ?? "nessun dato"}`);
  return result;
}

export function getQuote(ticker: string): Promise<Quote> {
  return cached(`q:${ticker}`, 60_000, async () => {
    const r = await chart(ticker, "range=1d&interval=1d");
    const m = r.meta;
    return {
      ticker,
      price: m.regularMarketPrice,
      previousClose: m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice,
      currency: m.currency,
      time: m.regularMarketTime * 1000,
      name: m.longName ?? m.shortName,
      source: m.fullExchangeName,
    };
  });
}

/** Chiusure giornaliere: coppie [YYYY-MM-DD, prezzo]. */
export function getHistory(ticker: string, from: string): Promise<[string, number][]> {
  return cached(`h:${ticker}:${from}`, 6 * 3600_000, async () => {
    const period1 = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const r = await chart(ticker, `period1=${period1}&period2=${period2}&interval=1d`);
    const closes = r.indicators.quote[0]?.close ?? [];
    const out: [string, number][] = [];
    (r.timestamp ?? []).forEach((ts, i) => {
      const c = closes[i];
      if (c != null) out.push([new Date(ts * 1000).toISOString().slice(0, 10), c]);
    });
    return out;
  });
}

export interface YahooHit {
  symbol: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
  longname?: string;
  shortname?: string;
}

/** Ricerca Yahoo per nome, ticker o ISIN (cache 10 minuti). */
export function searchYahoo(q: string, count = 10): Promise<YahooHit[]> {
  return cached(`s:${q}:${count}`, 10 * 60_000, async () => {
    const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${count}&newsCount=0`, {
      headers: HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { quotes?: YahooHit[] };
    return (json.quotes ?? []).filter((h) => h.symbol && h.quoteType !== "OPTION" && h.quoteType !== "FUTURE");
  });
}

/** Borse preferite per un investitore italiano, in ordine. */
const PREFERRED = ["MIL", "GER", "AMS", "PAR", "EBS", "NMS", "NYQ", "LSE"];

export function exchangeRank(exchange?: string) {
  const i = PREFERRED.indexOf(exchange ?? "");
  return i < 0 ? 99 : i;
}

/**
 * Trova un simbolo Yahoo che quota davvero lo strumento: cerca per ISIN e per
 * nome, tiene le quotazioni nella valuta attesa e, se c'è un prezzo di
 * riferimento (es. il prezzo medio), scarta quelle fuori scala (altre classi o
 * altre valute). Preferisce Milano e Xetra.
 */
export async function resolveTicker(opts: { isin: string; name?: string; currency: string; refPrice?: number }): Promise<Quote | null> {
  const hits = [...(await searchYahoo(opts.isin)), ...(opts.name ? await searchYahoo(opts.name, 15) : [])];
  const seen = new Set<string>();
  // I simboli che sono l'ISIN stesso (es. "IE00….SG") sono quotazioni poco scambiate: si scartano.
  const unique = hits.filter((h) => !h.symbol.startsWith(opts.isin) && !seen.has(h.symbol) && seen.add(h.symbol)).sort((a, b) => exchangeRank(a.exchange) - exchangeRank(b.exchange)).slice(0, 12);
  const quotes = await Promise.allSettled(unique.map((h) => getQuote(h.symbol)));
  for (const r of quotes) {
    if (r.status !== "fulfilled") continue;
    const q = r.value;
    if (q.currency !== opts.currency || !(q.price > 0)) continue;
    if (opts.refPrice && (q.price > opts.refPrice * 4 || q.price < opts.refPrice / 4)) continue;
    return q;
  }
  return null;
}
