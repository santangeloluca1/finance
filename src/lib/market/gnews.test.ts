import { describe, expect, it } from "vitest";
import { cleanName, newsQuery, parseRss } from "./gnews";

describe("Google News", () => {
  it("pulisce i nomi per la ricerca", () => {
    expect(cleanName("Enel S.p.A.", false)).toBe("Enel");
    expect(cleanName("Intesa Sanpaolo SpA", false)).toBe("Intesa Sanpaolo");
    expect(cleanName("iShares Core MSCI World UCITS ETF (Acc)", true)).toBe("MSCI World");
    expect(cleanName("Vanguard FTSE All-World UCITS ETF (Acc)", true)).toBe("FTSE All-World");
  });

  it("azioni col nome tra virgolette, ETF con l'indice", () => {
    expect(newsQuery("Enel S.p.A.", false)).toBe('"Enel" azioni when:30d');
    expect(newsQuery("iShares Core MSCI World UCITS ETF (Acc)", true)).toBe('intitle:"MSCI World" when:90d');
  });

  it("legge il feed: testata separata, entità decodificate, niente doppioni", () => {
    const xml = `<rss><channel>
      <item><title>Enel &amp; Eni: cosa cambia - Il Sole 24 ORE</title><link>https://news.google.com/a</link><pubDate>Mon, 09 Nov 2026 10:00:00 GMT</pubDate><source url="https://www.ilsole24ore.com">Il Sole 24 ORE</source></item>
      <item><title>Enel &amp; Eni: cosa cambia - Il Sole 24 ORE</title><link>https://news.google.com/b</link><pubDate>Mon, 09 Nov 2026 11:00:00 GMT</pubDate><source url="x">Il Sole 24 ORE</source></item>
      <item><title>VWCE.DE ETF Oggi | Vanguard FTSE All-World UCITS ETF Grafico e Quotazione - eToro</title><link>https://news.google.com/d</link><pubDate>Sun, 08 Nov 2026 09:00:00 GMT</pubDate><source url="z">eToro</source></item>
      <item><title>Azioni Enel, il consensus - SoldiOnline.it</title><link>https://news.google.com/c</link><pubDate>Sun, 08 Nov 2026 09:00:00 GMT</pubDate><source url="y">SoldiOnline.it</source></item>
    </channel></rss>`;
    const items = parseRss(xml);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "Enel & Eni: cosa cambia", publisher: "Il Sole 24 ORE", link: "https://news.google.com/a" });
    expect(items[0].time).toBe(Date.parse("2026-11-09T10:00:00Z"));
    expect(items[1].publisher).toBe("SoldiOnline.it");
  });
});
