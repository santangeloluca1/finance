import { NextResponse } from "next/server";
import { bestIntraday, parseEntries } from "@/lib/market/sources";

export const dynamic = "force-dynamic";

const EMPTY = { points: [] as [string, number][], previousClose: 0, source: undefined };

/**
 * Andamento della giornata: ?t=SIMBOLO~ISIN per un titolo,
 * ?t=A~ISIN,B,...&batch=1 per più titoli insieme ({ series: { simbolo: … } }).
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const entries = parseEntries(params.get("t"));
  if (!entries.length) return NextResponse.json(EMPTY, { status: 400 });
  if (params.get("batch") !== "1") {
    const data = await bestIntraday(entries[0].ticker, entries[0].isin).catch(() => EMPTY);
    return NextResponse.json(data);
  }
  const results = await Promise.all(entries.map((e) => bestIntraday(e.ticker, e.isin).catch(() => EMPTY)));
  return NextResponse.json({ series: Object.fromEntries(entries.map((e, i) => [e.ticker, results[i]])) });
}
