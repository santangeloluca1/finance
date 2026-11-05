import { NextResponse } from "next/server";
import { getQuote } from "@/lib/market/yahoo";
import { cached } from "@/lib/market/cache";

export const dynamic = "force-dynamic";

interface YahooHit {
  symbol: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
  longname?: string;
  shortname?: string;
}

export interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
  isin: string | null;
  currency: string | null;
  price: number | null;
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
/** Borse preferite per un investitore italiano, in ordine. */
const PREFERRED = ["MIL", "GER", "AMS", "PAR", "EBS", "NMS", "NYQ", "LSE"];

function search(q: string, count = 10): Promise<YahooHit[]> {
  return cached(`s:${q}:${count}`, 10 * 60_000, async () => {
    const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${count}&newsCount=0`, {
      headers: { "User-Agent": "Mozilla/5.0 (portafoglio personale)" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { quotes?: YahooHit[] };
    return (json.quotes ?? []).filter((h) => h.symbol && h.quoteType !== "OPTION" && h.quoteType !== "FUTURE");
  });
}

/**
 * Cerca un titolo per nome, ticker o ISIN. Con un ISIN cerca anche per nome,
 * così da trovare le quotazioni in euro (Milano, Xetra) oltre a quella principale.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const isin = ISIN_RE.test(q.toUpperCase()) ? q.toUpperCase() : null;
  let hits = await search(q);
  if (isin && hits.length) {
    const name = hits.find((h) => h.longname)?.longname ?? hits[0].shortname;
    if (name) {
      const key = name.split(" ").slice(0, 3).join(" ").toLowerCase();
      const more = (await search(name, 15)).filter((h) => (h.longname ?? h.shortname ?? "").toLowerCase().startsWith(key));
      hits = [...hits, ...more];
    }
  }

  const seen = new Set<string>();
  const unique = hits
    .filter((h) => !h.symbol.includes(isin ?? "\u0000") && !seen.has(h.symbol) && seen.add(h.symbol))
    .sort((a, b) => rank(a.exchange) - rank(b.exchange))
    .slice(0, 8);

  const quotes = await Promise.allSettled(unique.map((h) => getQuote(h.symbol)));
  const results: SearchResult[] = unique.map((h, i) => {
    const qt = quotes[i].status === "fulfilled" ? quotes[i].value : null;
    return {
      ticker: h.symbol,
      name: h.longname ?? h.shortname ?? h.symbol,
      exchange: h.exchDisp ?? h.exchange ?? "",
      type: h.quoteType ?? "",
      isin,
      currency: qt?.currency ?? null,
      price: qt?.price ?? null,
    };
  });
  return NextResponse.json({ results });
}

function rank(exchange?: string) {
  const i = PREFERRED.indexOf(exchange ?? "");
  return i < 0 ? 99 : i;
}
