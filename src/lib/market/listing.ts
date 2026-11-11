import { adrFor } from "./adr";
import { searchYahoo } from "./yahoo";

/** Simboli in stile Yahoo (VWCE.DE, BRK-B, ^GSPC, EURUSD=X): niente altro arriva ai servizi esterni. */
export const TICKER_RE = /^[A-Z0-9^][A-Z0-9.\-=^&]{0,23}$/i;
export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const US = ["NMS", "NYQ", "NGM", "NCM", "ASE", "PCX", "BTS"];

/**
 * Simbolo della quotazione principale USA per i titoli americani (es. NVD.DE → NVDA):
 * serve per notizie e dati degli analisti, che i servizi gratuiti hanno solo per gli USA.
 */
export async function usSymbol(ticker: string, isin?: string | null, name?: string | null): Promise<string | null> {
  if (!TICKER_RE.test(ticker)) return null;
  if (!ticker.includes(".") && !ticker.includes("-")) return ticker;
  // Aziende europee: quotazione USA dalla tabella verificata, mai indovinata dal nome.
  const adr = adrFor(ticker, isin);
  if (adr) return adr;
  if (isin && !isin.startsWith("US")) return null;
  const pick = (hits: { symbol: string; exchange?: string; quoteType?: string }[]) =>
    hits.find((h) => US.includes(h.exchange ?? "") && !h.symbol.includes(".") && h.quoteType === "EQUITY")?.symbol ?? null;
  if (isin) {
    const s = pick(await searchYahoo(isin).catch(() => []));
    if (s) return s;
  }
  return name ? pick(await searchYahoo(name, 6).catch(() => [])) : null;
}
