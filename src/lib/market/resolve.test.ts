import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveTicker } from "./yahoo";

/** Finto Yahoo: ricerca e quotazioni da tabelle. */
function mockYahoo(hits: Record<string, { symbol: string; exchange: string }[]>, quotes: Record<string, { price: number; currency: string }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.includes("/search")) return new Response(JSON.stringify({ quotes: hits[u.searchParams.get("q") ?? ""] ?? [] }));
      const sym = decodeURIComponent(u.pathname.split("/").pop()!);
      const q = quotes[sym];
      if (!q) return new Response("{}", { status: 404 });
      return new Response(
        JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: q.price, currency: q.currency, regularMarketTime: 1 }, indicators: { quote: [{ close: [] }] } }] } }),
      );
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveTicker", () => {
  test("sceglie la quotazione in euro con il prezzo in scala, preferendo Milano", async () => {
    mockYahoo(
      {
        GB00BJYDH287: [
          { symbol: "BTCW.L", exchange: "LSE" },
          { symbol: "WBIT.DE", exchange: "GER" },
        ],
        "WisdomTree Physical Bitcoin": [{ symbol: "BTCW.MI", exchange: "MIL" }],
      },
      { "BTCW.L": { price: 19, currency: "USD" }, "WBIT.DE": { price: 16.3, currency: "EUR" }, "BTCW.MI": { price: 16.33, currency: "EUR" } },
    );
    const q = await resolveTicker({ isin: "GB00BJYDH287", name: "WisdomTree Physical Bitcoin", currency: "EUR", refPrice: 15.33 });
    expect(q?.ticker).toBe("BTCW.MI");
  });

  test("scarta prezzi fuori scala e restituisce null se non trova nulla", async () => {
    mockYahoo({ XX0000000001: [{ symbol: "AAA.DE", exchange: "GER" }] }, { "AAA.DE": { price: 500, currency: "EUR" } });
    expect(await resolveTicker({ isin: "XX0000000001", currency: "EUR", refPrice: 15 })).toBeNull();
  });
});
