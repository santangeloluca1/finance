import { searchYahoo } from "./yahoo";

const US = ["NMS", "NYQ", "NGM", "NCM", "ASE", "PCX", "BTS"];

/**
 * Simbolo della quotazione principale USA per i titoli americani (es. NVD.DE → NVDA):
 * serve per notizie e dati degli analisti, che i servizi gratuiti hanno solo per gli USA.
 */
export async function usSymbol(ticker: string, isin?: string | null, name?: string | null): Promise<string | null> {
  if (!ticker.includes(".") && !ticker.includes("-")) return ticker;
  // Solo titoli americani: per ISIN US, o (senza ISIN) se il nome trova una quotazione USA.
  if (isin && !isin.startsWith("US")) return null;
  const pick = (hits: { symbol: string; exchange?: string; quoteType?: string }[]) =>
    hits.find((h) => US.includes(h.exchange ?? "") && !h.symbol.includes(".") && h.quoteType === "EQUITY")?.symbol ?? null;
  if (isin) {
    const s = pick(await searchYahoo(isin).catch(() => []));
    if (s) return s;
  }
  return name ? pick(await searchYahoo(name, 6).catch(() => [])) : null;
}
