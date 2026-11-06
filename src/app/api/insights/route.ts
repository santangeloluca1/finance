import { NextResponse } from "next/server";
import { usSymbol } from "@/lib/market/listing";
import { getDividends, getNews } from "@/lib/market/yahoo";

export const dynamic = "force-dynamic";

/** Dividendi storici e notizie di un titolo: ?t=SIMBOLO&isin=…&n=Nome */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const t = p.get("t");
  if (!t) return NextResponse.json({ message: "Simbolo mancante" }, { status: 400 });
  const isin = p.get("isin");
  const name = p.get("n");
  const us = await usSymbol(t, isin, name).catch(() => null);
  const [div, news] = await Promise.all([
    getDividends(t).catch(() => ({ currency: "", dividends: [] as [string, number][] })),
    // Notizie: col simbolo USA sono molto più pertinenti; altrimenti col nome.
    getNews(us ?? name ?? t).catch(() => []),
  ]);
  return NextResponse.json({ ...div, news, us });
}
