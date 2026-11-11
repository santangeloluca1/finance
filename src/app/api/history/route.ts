import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { bestHistory, parseEntries } from "@/lib/market/sources";
import { getFxHistory } from "@/lib/market/fx";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  const params = new URL(req.url).searchParams;
  const entries = parseEntries(params.get("t"));
  // Valute: solo codici ISO, finiscono nell'URL di Frankfurter.
  const currencies = [...new Set((params.get("c") ?? "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c)))].slice(0, 20);
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
