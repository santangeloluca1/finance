import { NextResponse } from "next/server";
import { resolveTicker } from "@/lib/market/yahoo";

export const dynamic = "force-dynamic";

/** Simbolo Yahoo funzionante per un ISIN: ?isin=…&currency=EUR&name=…&ref=16.3 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const isin = (p.get("isin") ?? "").toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return NextResponse.json({ ticker: null }, { status: 400 });
  const ref = Number(p.get("ref"));
  const q = await resolveTicker({
    isin,
    name: p.get("name") ?? undefined,
    currency: (p.get("currency") ?? "EUR").toUpperCase(),
    refPrice: Number.isFinite(ref) && ref > 0 ? ref : undefined,
  }).catch(() => null);
  return NextResponse.json({ ticker: q?.ticker ?? null, price: q?.price ?? null, name: q?.name ?? null });
}
