import { describe, expect, it } from "vitest";
import { currencyExposure, type Composition } from "./xray-client";
import type { PositionView } from "./analytics";

const view = (isin: string, name: string, assetClass: string, value: number, currency = "EUR") =>
  ({ value, instrument: { isin, name, assetClass, currency, ticker: isin } }) as unknown as PositionView;

describe("esposizione valutaria", () => {
  it("apre gli ETF per paese, gli ETF coperti contano come euro, le azioni per emittente", () => {
    const comp: Record<string, Composition> = {
      IE00B4L5Y983: { isin: "IE00B4L5Y983", countries: [{ name: "Stati Uniti", weight: 0.7 }, { name: "Germania", weight: 0.1 }, { name: "Paesi bassi", weight: 0.05 }, { name: "Altri", weight: 0.15 }], sectors: [], holdings: [], asOf: null },
      IE00BDBRDM35: { isin: "IE00BDBRDM35", countries: [{ name: "Stati Uniti", weight: 0.3 }], sectors: [], holdings: [], hedged: true, asOf: null },
    };
    const out = currencyExposure(
      [
        view("IE00B4L5Y983", "iShares Core MSCI World UCITS ETF (Acc)", "etf_azionario", 1000),
        view("IE00BDBRDM35", "iShares Core Global Aggregate Bond UCITS ETF EUR Hedged (Acc)", "etf_obbligazionario", 500),
        view("US0378331005", "Apple Inc.", "azione", 200),
        view("IT0003132476", "Eni S.p.A.", "azione", 100),
        view("XS2115336336", "Gold ETC", "etc", 50),
      ],
      comp,
    );
    const by = Object.fromEntries(out.map((x) => [x.code, Math.round(x.value)]));
    expect(by).toEqual({ USD: 700 + 200 + 50, EUR: 150 + 500 + 100, OTHER: 150 });
    expect(out.at(-1)!.code).toBe("OTHER");
  });
});
