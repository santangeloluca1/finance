import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getHistory, resolveTicker } from "@/lib/market/yahoo";
import { bestQuote } from "@/lib/market/sources";

export const dynamic = "force-dynamic";

/** Simbolo Yahoo funzionante per un ISIN: ?isin=…&currency=EUR&name=…&ref=16.3 */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const p = new URL(req.url).searchParams;
  const isin = (p.get("isin") ?? "").toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return NextResponse.json({ ticker: null }, { status: 400 });
  const ref = Number(p.get("ref"));
  const currency = (p.get("currency") ?? "EUR").toUpperCase();
  // Se il simbolo attuale funziona (anche passando da Tradegate) non si cambia nulla:
  // un prezzo arrivato in ritardo non deve sostituire un simbolo buono.
  const current = p.get("current");
  if (current) {
    const ok = await bestQuote(current, currency === "EUR" ? isin : undefined).catch(() => null);
    if (ok) return NextResponse.json({ ticker: current, price: ok.price, name: ok.name ?? null });
  }
  const q = await resolveTicker({
    isin,
    name: p.get("name") ?? undefined,
    currency,
    refPrice: Number.isFinite(ref) && ref > 0 ? ref : undefined,
  }).catch(() => null);
  // Un simbolo nuovo vale solo se ha almeno un mese di storico.
  if (q) {
    const from = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
    const hist = await getHistory(q.ticker, from).catch(() => []);
    if (hist.length < 20) return NextResponse.json({ ticker: null });
  }
  return NextResponse.json({ ticker: q?.ticker ?? null, price: q?.price ?? null, name: q?.name ?? null });
}
