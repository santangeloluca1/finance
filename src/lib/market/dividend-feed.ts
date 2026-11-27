import type { DividendFeed } from "../dividends";
import { PENDING_DAYS } from "../dividends";
import { getFxLatest } from "./fx";
import { getDividends } from "./yahoo";

/**
 * Stacchi degli ultimi mesi per i titoli indicati, con i cambi delle valute in
 * cui sono espressi. Un titolo senza dati (o con errore) resta fuori.
 */
export async function fetchDividendFeed(list: { isin: string; ticker: string }[]): Promise<{ feed: DividendFeed; fx: Record<string, number> }> {
  const from = new Date(Date.now() - (PENDING_DAYS + 10) * 86400_000).toISOString().slice(0, 10);
  const feed: DividendFeed = {};
  await Promise.all(
    list.map(async ({ isin, ticker }) => {
      const d = await getDividends(ticker).catch(() => null);
      const recent = d?.dividends.filter(([date]) => date >= from) ?? [];
      if (d && recent.length) feed[isin] = { currency: d.currency, dividends: recent };
    }),
  );
  const currencies = [...new Set(Object.values(feed).map((f) => (f.currency === "GBp" || f.currency === "GBX" ? "GBP" : f.currency)))].filter((c) => /^[A-Z]{3}$/.test(c));
  const fx = await getFxLatest(currencies).catch(() => ({}));
  return { feed, fx };
}
