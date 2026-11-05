import { cached } from "./cache";

/** Composizione di un ETF: pesi (0..1) per paese, settore e prime partecipazioni. */
export interface Composition {
  isin: string;
  countries: { name: string; weight: number }[];
  sectors: { name: string; weight: number }[];
  holdings: { name: string; weight: number }[];
  asOf: string | null;
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();

/** Testi degli elementi con un certo data-testid, nell'ordine della pagina. */
function texts(html: string, testid: string): string[] {
  const re = new RegExp(`data-testid="${testid}"[^>]*>([\\s\\S]*?)</`, "g");
  return [...html.matchAll(re)].map((m) => decode(m[1]));
}

const pct = (s: string) => Number(s.replace("%", "").replace(/\./g, "").replace(",", ".")) / 100;

function pairs(html: string, section: string) {
  const names = texts(html, `tl_etf-holdings_${section}_value_name`);
  const values = texts(html, `tl_etf-holdings_${section}_value_percentage`);
  return names.map((name, i) => ({ name, weight: pct(values[i] ?? "0") })).filter((x) => x.name && Number.isFinite(x.weight));
}

/** Legge la scheda pubblica dell'ETF su justETF (uso personale), con cache di un giorno. */
export function getComposition(isin: string): Promise<Composition> {
  return cached(`xray:${isin}`, 24 * 3600_000, async () => {
    const res = await fetch(`https://www.justetf.com/it/etf-profile.html?isin=${encodeURIComponent(isin)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (portafoglio personale)", "Accept-Language": "it-IT" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`justETF HTTP ${res.status}`);
    const html = await res.text();
    const holdNames = texts(html, "tl_etf-holdings_top-holdings_link_name");
    const holdValues = texts(html, "tl_etf-holdings_top-holdings_value_percentage");
    return {
      isin,
      countries: pairs(html, "countries"),
      sectors: pairs(html, "sectors"),
      holdings: holdNames.map((name, i) => ({ name, weight: pct(holdValues[i] ?? "0") })).filter((h) => h.name),
      asOf: texts(html, "tl_etf-holdings_reference-date")[0] ?? null,
    };
  });
}
