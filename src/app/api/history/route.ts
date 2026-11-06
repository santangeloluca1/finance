import { NextResponse } from "next/server";
import { bestHistory, parseEntries } from "@/lib/market/sources";
import { getFxHistory } from "@/lib/market/fx";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const entries = parseEntries(params.get("t"));
  const currencies = [...new Set((params.get("c") ?? "").split(",").filter(Boolean))];
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.get("from") ?? "") ? params.get("from")! : oneYearAgo();

  const results = await Promise.allSettled(entries.map((e) => bestHistory(e.ticker, e.isin, from)));
  const series: Record<string, [string, number][]> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length) series[entries[i].ticker] = r.value;
  });
  const fx = await getFxHistory(currencies, from).catch(() => ({}));
  return NextResponse.json({ series, fx });
}

function oneYearAgo() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}
