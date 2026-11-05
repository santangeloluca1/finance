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
