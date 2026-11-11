import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { ISIN_RE, TICKER_RE, usSymbol } from "@/lib/market/listing";
import { getDividends, getNews } from "@/lib/market/yahoo";
import { getItalianNews } from "@/lib/market/gnews";

export const dynamic = "force-dynamic";

/** Dividendi storici e notizie di un titolo: ?t=SIMBOLO&isin=…&n=Nome&fn=Nome completo&f=1 (ETF) */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const p = new URL(req.url).searchParams;
  const t = p.get("t");
  if (!t || !TICKER_RE.test(t)) return NextResponse.json({ message: "Simbolo mancante" }, { status: 400 });
  const isin = ISIN_RE.test(p.get("isin") ?? "") ? p.get("isin") : null;
  const name = p.get("n");
  const fullName = p.get("fn") ?? name;
  const fund = p.get("f") === "1";
  const us = await usSymbol(t, isin, name).catch(() => null);
  const [div, news, newsIt] = await Promise.all([
    getDividends(t).catch(() => ({ currency: "", dividends: [] as [string, number][] })),
    // Notizie: col simbolo USA sono molto più pertinenti; altrimenti col nome.
    getNews(us ?? name ?? t).catch(() => []),
    // Le prime notizie in italiano, per pertinenza.
    fullName ? getItalianNews(fullName, fund).catch(() => []) : Promise.resolve([]),
  ]);
  return NextResponse.json({ ...div, news, newsIt, us });
}
