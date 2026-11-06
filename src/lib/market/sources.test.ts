import { afterEach, describe, expect, test, vi } from "vitest";
import { parseTradegate, tradegateOpen, tradegateTime } from "./tradegate";
import { bestQuote, parseEntries } from "./sources";

afterEach(() => vi.unstubAllGlobals());

describe("Tradegate", () => {
  test("legge numeri e stringhe all'italiana", () => {
    expect(parseTradegate({ last: "36,00", close: 37.525, bid: 35.94 })).toEqual({ last: 36, close: 37.525, bid: 35.94, ask: undefined });
    expect(parseTradegate({ last: 0 })).toBeNull();
  });

  test("è aperta nei giorni feriali dalle 8 alle 22 di Berlino", () => {
    expect(tradegateOpen(Date.parse("2026-11-05T20:30:00Z"))).toBe(true); // 21:30 a Berlino
    expect(tradegateOpen(Date.parse("2026-11-05T21:30:00Z"))).toBe(false); // 22:30
    expect(tradegateOpen(Date.parse("2026-11-07T12:00:00Z"))).toBe(false); // sabato
  });

  test("fuori orario l'ultimo prezzo è quello delle 22 dell'ultimo giorno feriale", () => {
    expect(new Date(tradegateTime(Date.parse("2026-11-05T22:30:00Z"))).toISOString()).toBe("2026-11-05T21:00:00.000Z"); // inverno, UTC+1
    expect(new Date(tradegateTime(Date.parse("2026-11-08T10:00:00Z"))).toISOString()).toBe("2026-11-06T21:00:00.000Z"); // domenica → venerdì
    expect(new Date(tradegateTime(Date.parse("2026-07-01T21:00:00Z"))).toISOString()).toBe("2026-07-01T20:00:00.000Z"); // estate, UTC+2
  });
});

describe("scelta della quotazione", () => {
  const yahoo = (price: number, time: number) =>
    new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: 47.736, currency: "EUR", regularMarketTime: time / 1000, fullExchangeName: "XETRA" }, indicators: { quote: [{ close: [] }] } }] } }));

  test("la sera usa Tradegate, con la variazione sulla chiusura ufficiale", async () => {
    const now = Date.parse("2026-11-05T20:00:00Z");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("tradegate") ? new Response(JSON.stringify({ last: 46.168, close: 47.791 })) : yahoo(46.723, Date.parse("2026-11-05T16:36:00Z")))));
    const q = await bestQuote("SPPW.DE", "IE00BFY0GT14", now);
    expect(q).toMatchObject({ price: 46.168, previousClose: 47.736, source: "Tradegate" });
  });

  test("di giorno usa il prezzo in tempo reale (medio tra denaro e lettera), sulla chiusura ufficiale di ieri", async () => {
    const now = Date.parse("2026-11-05T14:47:00Z");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("tradegate") ? new Response(JSON.stringify({ last: 47.2, bid: 47.18, ask: 47.22, close: 46.9 })) : yahoo(47, now - 15 * 60_000))));
    expect(await bestQuote("SPPX.DE", "IE00BFY0GT22", now)).toMatchObject({ price: 47.2, previousClose: 47.736, source: "Tradegate" });
  });

  test("al mattino, prima dell'apertura ufficiale, il riferimento è l'ultima chiusura ufficiale", async () => {
    const now = Date.parse("2026-11-06T07:30:00Z"); // venerdì 8:30
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("tradegate") ? new Response(JSON.stringify({ last: 46.5, close: 46.4 })) : yahoo(46.723, Date.parse("2026-11-05T16:36:00Z")))));
    // Yahoo mostra ancora la seduta di giovedì: la sua chiusura (46,723) è il riferimento, non quella di mercoledì.
    expect(await bestQuote("SPPY.DE", "IE00BFY0GT30", now)).toMatchObject({ price: 46.5, previousClose: 46.723 });
  });

  test("senza ISIN (titoli USA) resta la borsa ufficiale", async () => {
    const now = Date.parse("2026-11-05T15:00:00Z");
    vi.stubGlobal("fetch", vi.fn(async () => yahoo(47, now - 15 * 60_000)));
    expect(await bestQuote("SPPW.F", undefined, now)).toMatchObject({ price: 47, source: "Xetra" });
  });

  test("ignora Tradegate se il prezzo è incoerente (ISIN sbagliato)", async () => {
    const now = Date.parse("2026-11-05T14:47:00Z");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("tradegate") ? new Response(JSON.stringify({ last: 120, close: 119 })) : yahoo(47, now - 15 * 60_000))));
    expect(await bestQuote("SPPZ.DE", "IE00BFY0GT48", now)).toMatchObject({ price: 47, source: "Xetra" });
  });

  test("se Yahoo non ha il titolo usa Tradegate anche di notte", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("tradegate") ? new Response(JSON.stringify({ last: 16.134, close: 17.024 })) : new Response("{}", { status: 404 }))));
    expect(await bestQuote("WBIT.DE", "GB00BJYDH287", Date.parse("2026-11-05T23:00:00Z"))).toMatchObject({ price: 16.134, previousClose: 17.024, source: "Tradegate" });
  });

  test("legge le richieste simbolo~ISIN", () => {
    expect(parseEntries("SPPW.DE~IE00BFY0GT14,AAPL,SPPW.DE")).toEqual([{ ticker: "SPPW.DE", isin: "IE00BFY0GT14" }, { ticker: "AAPL", isin: undefined }]);
  });
});
