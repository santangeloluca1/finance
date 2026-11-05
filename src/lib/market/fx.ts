import { cached } from "./cache";

/** Cambi di riferimento BCE tramite Frankfurter (gratuito, ufficiale). */
const BASE = "https://api.frankfurter.dev/v1";

/** 1 EUR = rate unità di valuta. */
export function getFxLatest(currencies: string[]): Promise<Record<string, number>> {
  const list = currencies.filter((c) => c !== "EUR").sort();
  if (list.length === 0) return Promise.resolve({});
  return cached(`fx:${list.join(",")}`, 30 * 60_000, async () => {
    const res = await fetch(`${BASE}/latest?from=EUR&to=${list.join(",")}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
    const json = (await res.json()) as { rates: Record<string, number> };
    return json.rates;
  });
}

export function getFxHistory(currencies: string[], from: string): Promise<Record<string, [string, number][]>> {
  const list = currencies.filter((c) => c !== "EUR").sort();
  if (list.length === 0) return Promise.resolve({});
  return cached(`fxh:${list.join(",")}:${from}`, 6 * 3600_000, async () => {
    const res = await fetch(`${BASE}/${from}..?from=EUR&to=${list.join(",")}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
    const json = (await res.json()) as { rates: Record<string, Record<string, number>> };
    const out: Record<string, [string, number][]> = {};
    for (const [date, rates] of Object.entries(json.rates)) {
      for (const [cur, rate] of Object.entries(rates)) (out[cur] ??= []).push([date, rate]);
    }
    return out;
  });
}
