import { NextResponse } from "next/server";
import { cached } from "@/lib/market/cache";
import { usSymbol } from "@/lib/market/listing";
import { adrFor } from "@/lib/market/adr";

export const dynamic = "force-dynamic";

/**
 * Analisti e fondamentali (titoli USA) da servizi con piano gratuito:
 * - Finnhub (FINNHUB_API_KEY): consenso degli analisti, indicatori, prossimi risultati, utili passati;
 * - Financial Modeling Prep (FMP_API_KEY), facoltativo: prezzo obiettivo.
 * Senza chiavi risponde { status: "nokey" }.
 */

const FINNHUB = "https://finnhub.io/api/v1";

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

export interface AnalystData {
  symbol: string;
  currency: string;
  recommendation: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
  target: { mean: number; low: number; high: number; median?: number } | null;
  metrics: {
    marketCap?: number;
    pe?: number;
    eps?: number;
    beta?: number;
    dividendYield?: number;
    revenueGrowth?: number;
    netMargin?: number;
    high52?: number;
    low52?: number;
  } | null;
  nextEarnings: { date: string; epsEstimate: number | null; revenueEstimate: number | null; hour?: string } | null;
  earnings: { period: string; actual: number | null; estimate: number | null; surprisePercent: number | null }[];
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const t = p.get("t");
  if (!t) return NextResponse.json({ message: "Simbolo mancante" }, { status: 400 });
  const fh = process.env.FINNHUB_API_KEY;
  const fmp = process.env.FMP_API_KEY;
  if (!fh && !fmp) return NextResponse.json({ status: "nokey" });

  const symbol = await usSymbol(t, p.get("isin"), p.get("n")).catch(() => null);
  if (!symbol) return NextResponse.json({ status: "unavailable" });

  const data = await cached(`an:${symbol}`, 6 * 3600_000, async (): Promise<AnalystData> => {
    const today = new Date().toISOString().slice(0, 10);
    const in120 = new Date(Date.now() + 120 * 86400_000).toISOString().slice(0, 10);
    const q = (path: string) => (fh ? getJson<unknown>(`${FINNHUB}${path}${path.includes("?") ? "&" : "?"}token=${fh}`) : Promise.resolve(null));
    const [rec, metric, cal, earn, fhTarget, fmpTarget] = await Promise.all([
      q(`/stock/recommendation?symbol=${symbol}`) as Promise<AnalystData["recommendation"][] | null>,
      q(`/stock/metric?symbol=${symbol}&metric=all`) as Promise<{ metric?: Record<string, number> } | null>,
      q(`/calendar/earnings?symbol=${symbol}&from=${today}&to=${in120}`) as Promise<{
        earningsCalendar?: { date: string; epsEstimate: number | null; revenueEstimate: number | null; hour?: string }[];
      } | null>,
      q(`/stock/earnings?symbol=${symbol}`) as Promise<AnalystData["earnings"] | null>,
      // Su alcuni piani è a pagamento: se non risponde si usa FMP.
      q(`/stock/price-target?symbol=${symbol}`) as Promise<{ targetMean?: number; targetLow?: number; targetHigh?: number; targetMedian?: number } | null>,
      fmp
        ? (getJson(`https://financialmodelingprep.com/stable/price-target-consensus?symbol=${symbol}&apikey=${fmp}`) as Promise<
            { targetConsensus?: number; targetLow?: number; targetHigh?: number; targetMedian?: number }[] | null
          >)
        : Promise.resolve(null),
    ]);
    const m = metric?.metric ?? null;
    const ft = Array.isArray(fmpTarget) ? fmpTarget[0] : null;
    const target =
      fhTarget?.targetMean && fhTarget.targetLow && fhTarget.targetHigh
        ? { mean: fhTarget.targetMean, low: fhTarget.targetLow, high: fhTarget.targetHigh, median: fhTarget.targetMedian }
        : ft?.targetConsensus && ft.targetLow && ft.targetHigh
          ? { mean: ft.targetConsensus, low: ft.targetLow, high: ft.targetHigh, median: ft.targetMedian }
          : null;
    const next = cal?.earningsCalendar?.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
    return {
      symbol,
      currency: "USD",
      recommendation: Array.isArray(rec) && rec.length ? rec[0] : null,
      target,
      metrics: m
        ? {
            marketCap: m.marketCapitalization ? m.marketCapitalization * 1e6 : undefined,
            pe: m.peTTM ?? m.peBasicExclExtraTTM,
            eps: m.epsTTM ?? m.epsBasicExclExtraItemsTTM,
            beta: m.beta,
            dividendYield: m.dividendYieldIndicatedAnnual,
            revenueGrowth: m.revenueGrowthTTMYoy,
            netMargin: m.netProfitMarginTTM,
            high52: m["52WeekHigh"],
            low52: m["52WeekLow"],
          }
        : null,
      nextEarnings: next ? { date: next.date, epsEstimate: next.epsEstimate, revenueEstimate: next.revenueEstimate, hour: next.hour } : null,
      earnings: Array.isArray(earn) ? earn.slice(0, 4) : [],
    };
  });
  const empty = !data.recommendation && !data.target && !data.metrics && !data.nextEarnings && !data.earnings.length;
  // ADR: i dati per azione si riferiscono all'ADR (che può valere più azioni europee).
  const adr = !!adrFor(t, p.get("isin"));
  return NextResponse.json(empty ? { status: "unavailable" } : { status: "ok", data: { ...data, adr } });
}
