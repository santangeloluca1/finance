import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { ISIN_RE, TICKER_RE } from "@/lib/market/listing";
import { fetchDividendFeed } from "@/lib/market/dividend-feed";

export const dynamic = "force-dynamic";

/** Stacchi recenti dei titoli: ?t=SIMBOLO~ISIN,SIMBOLO~ISIN */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const list = (new URL(req.url).searchParams.get("t") ?? "")
    .split(",")
    .map((s) => s.split("~"))
    .filter(([t, isin]) => t && isin && TICKER_RE.test(t) && ISIN_RE.test(isin))
    .slice(0, 80)
    .map(([ticker, isin]) => ({ ticker, isin }));
  if (!list.length) return NextResponse.json({ feed: {}, fx: {} });
  return NextResponse.json(await fetchDividendFeed(list));
}
