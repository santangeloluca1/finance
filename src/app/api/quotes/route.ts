import { NextResponse } from "next/server";
import { getQuote, type Quote } from "@/lib/market/yahoo";
import { getFxLatest } from "@/lib/market/fx";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const tickers = parseList(new URL(req.url).searchParams.get("t"));
  const results = await Promise.allSettled(tickers.map(getQuote));
  const quotes: Record<string, Quote> = {};
  const errors: Record<string, string> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") quotes[tickers[i]] = r.value;
    else errors[tickers[i]] = String(r.reason);
  });
  const currencies = [...new Set(Object.values(quotes).map((q) => q.currency))];
  const fx = await getFxLatest(currencies).catch(() => ({}));
  return NextResponse.json({ quotes, fx, errors, fetchedAt: Date.now() });
}

function parseList(v: string | null): string[] {
  return [...new Set((v ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 100);
}
