import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import type { Quote } from "@/lib/market/yahoo";
import { getFxLatest } from "@/lib/market/fx";
import { bestQuote, parseEntries } from "@/lib/market/sources";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const entries = parseEntries(new URL(req.url).searchParams.get("t"));
  const results = await Promise.allSettled(entries.map((e) => bestQuote(e.ticker, e.isin)));
  const quotes: Record<string, Quote> = {};
  const errors: Record<string, string> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") quotes[entries[i].ticker] = r.value;
    else errors[entries[i].ticker] = String(r.reason);
  });
  const currencies = [...new Set(Object.values(quotes).map((q) => q.currency))];
  const fx = await getFxLatest(currencies).catch(() => ({}));
  return NextResponse.json({ quotes, fx, errors, fetchedAt: Date.now() });
}
