import { NextResponse } from "next/server";
import { bestIntraday, parseEntries } from "@/lib/market/sources";

export const dynamic = "force-dynamic";

/** Andamento della giornata per un titolo: ?t=SIMBOLO~ISIN */
export async function GET(req: Request) {
  const [entry] = parseEntries(new URL(req.url).searchParams.get("t"));
  if (!entry) return NextResponse.json({ points: [], previousClose: 0 }, { status: 400 });
  const data = await bestIntraday(entry.ticker, entry.isin).catch(() => ({ points: [], previousClose: 0, source: undefined }));
  return NextResponse.json(data);
}
