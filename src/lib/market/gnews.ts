import { cached } from "./cache";
import type { NewsItem } from "./yahoo";

/**
 * Notizie in italiano da Google News (feed RSS di ricerca, edizione Italia).
 * Il feed è ordinato per pertinenza: i primi risultati sono i più importanti.
 * Uso personale, come previsto dalle condizioni del feed.
 */

const HEADERS = { "User-Agent": "Mozilla/5.0 (portafoglio personale)" };

/** Parole che non aiutano la ricerca: forma societaria, classe di quote, sigle del fondo. */
const NOISE =
  /\b(s\.?p\.?a\.?|spa|n\.?v\.?|s\.?e\.?|ag|plc|inc\.?|corp\.?|corporation|ltd\.?|group|holding|ucits|etf|etc|acc|dist|accumulating|distributing|usd|eur|gbp|chf|hedged|class)\b|\([^)]*\)/gi;
/** Emittenti degli ETF: per le notizie conta l'indice, non chi lo replica. */
const ISSUERS = /\b(ishares|core|vanguard|xtrackers|amundi|lyxor|spdr|invesco|wisdomtree|hsbc|ubs|vaneck|global x|franklin|jpmorgan|fidelity|db x-trackers)\b/gi;

export function cleanName(name: string, fund: boolean) {
  let s = name.replace(NOISE, " ");
  if (fund) s = s.replace(ISSUERS, " ");
  return s.replace(/\s+/g, " ").replace(/^[\s\-–,.]+|[\s\-–,.]+$/g, "").trim();
}

/**
 * Query per Google News: azioni col nome tra virgolette; per gli ETF l'indice
 * deve stare nel titolo, altrimenti escono notizie generiche sui mercati.
 */
export function newsQuery(name: string, fund: boolean) {
  const clean = cleanName(name, fund);
  if (!clean) return null;
  return fund ? `intitle:"${clean}" when:90d` : `"${clean}" azioni when:30d`;
}

/** Pagine di quotazione travestite da notizia (es. "… Grafico e Quotazione"). */
const NOT_NEWS = /grafico e quotazione|quotazione in tempo reale|\| ?[A-Z0-9]{12} ?\|/i;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .trim();
}

/** Legge gli <item> di un feed RSS di Google News. */
export function parseRss(xml: string): NewsItem[] {
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (t: string) => decode(item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");
    const publisher = tag("source");
    let title = tag("title");
    // Il titolo finisce con " - Testata": la testata si mostra a parte.
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -publisher.length - 3);
    const link = tag("link");
    const time = Date.parse(tag("pubDate"));
    const key = title.toLowerCase();
    if (!title || !link || seen.has(key) || NOT_NEWS.test(title)) continue;
    seen.add(key);
    out.push({ title, publisher, link, time: Number.isFinite(time) ? time : Date.now() });
  }
  return out;
}

/** Le prime notizie in italiano su un titolo. */
export function getItalianNews(name: string, fund: boolean, count = 5): Promise<NewsItem[]> {
  const q = newsQuery(name, fund);
  if (!q) return Promise.resolve([]);
  return cached(`gn:${q}`, 30 * 60_000, async () => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=it&gl=IT&ceid=IT:it`;
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return [];
    return parseRss(await res.text()).slice(0, count);
  });
}
