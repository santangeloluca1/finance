import { cached } from "./cache";

/** Composizione di un ETF: pesi (0..1) per paese, settore e prime partecipazioni. */
export interface Composition {
  isin: string;
  countries: { name: string; weight: number }[];
  sectors: { name: string; weight: number }[];
  holdings: { name: string; weight: number }[];
  /** Quote con copertura del rischio di cambio (es. "EUR Hedged"). */
  hedged?: boolean;
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

const UA = "Mozilla/5.0 (portafoglio personale)";

/**
 * La pagina mostra solo i primi 4 paesi più "Altri": il link "Mostra di più"
 * (una chiamata Ajax della stessa sessione) ne restituisce 10. Serve per le valute,
 * perché un "Altri" del 16% direbbe poco. Se non riesce si tengono i primi 4.
 */
async function moreCountries(isin: string, html: string, cookies: string[]) {
  const path = html.match(/"u":"(\/it\/etf-profile\.html\?[^"]*loadMoreCountries[^"]*)"/)?.[1];
  if (!path) return null;
  try {
    const res = await fetch(`https://www.justetf.com${path}`, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "it-IT",
        "Wicket-Ajax": "true",
        "Wicket-Ajax-BaseURL": `it/etf-profile.html?isin=${isin}`,
        "X-Requested-With": "XMLHttpRequest",
        Cookie: cookies.map((c) => c.split(";")[0]).join("; "),
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const list = pairs(await res.text(), "countries");
    return list.length ? list : null;
  } catch {
    return null;
  }
}

/** Legge la scheda pubblica dell'ETF su justETF (uso personale), con cache di un giorno. */
export function getComposition(isin: string): Promise<Composition> {
  return cached(`xray:${isin}`, 24 * 3600_000, async () => {
    const res = await fetch(`https://www.justetf.com/it/etf-profile.html?isin=${encodeURIComponent(isin)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "it-IT" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`justETF HTTP ${res.status}`);
    const html = await res.text();
    const holdNames = texts(html, "tl_etf-holdings_top-holdings_link_name");
    const holdValues = texts(html, "tl_etf-holdings_top-holdings_value_percentage");
    const countries = (await moreCountries(isin, html, res.headers.getSetCookie?.() ?? [])) ?? pairs(html, "countries");
    const hedge = texts(html, "tl_etf-basics_value_currency-hedge")[0];
    return {
      isin,
      countries,
      hedged: hedge ? /^s[iì]/i.test(hedge) : undefined,
      sectors: pairs(html, "sectors"),
      holdings: holdNames.map((name, i) => ({ name, weight: pct(holdValues[i] ?? "0") })).filter((h) => h.name),
      asOf: texts(html, "tl_etf-holdings_reference-date")[0] ?? null,
    };
  });
}
