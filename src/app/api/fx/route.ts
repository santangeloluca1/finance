import { NextResponse } from "next/server";
import { cached } from "@/lib/market/cache";

export const dynamic = "force-dynamic";

/** Cambio BCE di una data: 1 EUR = rate unità di valuta. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const date = params.get("date") ?? "";
  const currency = (params.get("c") ?? "").toUpperCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ message: "Parametri non validi" }, { status: 400 });
  }
  if (currency === "EUR") return NextResponse.json({ rate: 1, date });
  try {
    const data = await cached(`fxd:${date}:${currency}`, 24 * 3600_000, async () => {
      const res = await fetch(`https://api.frankfurter.dev/v1/${date}?from=EUR&to=${currency}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { date: string; rates: Record<string, number> };
    });
    return NextResponse.json({ rate: data.rates[currency] ?? null, date: data.date });
  } catch {
    return NextResponse.json({ rate: null, date }, { status: 502 });
  }
}
