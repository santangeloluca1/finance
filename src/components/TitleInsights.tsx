"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, KeyRound, Newspaper } from "lucide-react";
import { Panel, Segmented } from "@/components/ui";
import type { Instrument } from "@/lib/engine/types";
import { isFundLike } from "@/lib/engine/tax";
import { exchangeName, fmtDate, fmtEur, fmtN, fmtPct, fmtPrice, fmtSignedPct, fmtWhen } from "@/lib/format";
import { dividendInfo, growthLabel, priceStats } from "@/lib/insights";
import { useCompositions } from "@/lib/xray-client";

type Tab = "panoramica" | "dividendi" | "notizie" | "analisti";
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  time: number;
}

interface Insights {
  currency: string;
  dividends: [string, number][];
  news: NewsItem[];
  /** Le prime notizie in italiano (Google News), per pertinenza. */
  newsIt?: NewsItem[];
  us: string | null;
}

/** Cache in memoria per non riscaricare passando da una scheda all'altra. */
const memo = new Map<string, unknown>();
function useJson<T>(url: string | null): T | null {
  const [v, setV] = useState<T | null>(() => (url ? ((memo.get(url) as T) ?? null) : null));
  useEffect(() => {
    if (!url) return;
    if (memo.has(url)) return setV(memo.get(url) as T);
    let stop = false;
    setV(null);
    fetch(url)
      .then((r) => r.json())
      .then((j: T) => {
        memo.set(url, j);
        if (!stop) setV(j);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [url]);
  return v;
}

/**
 * Approfondimenti della scheda titolo, in schede per non allungare la pagina:
 * statistiche (e composizione per gli ETF), dividendi con le stime, notizie, analisti.
 */
export function TitleInsights({ instrument, price, quantity, taxRate }: { instrument: Instrument; price: number | null; quantity: number; taxRate: number }) {
  const fund = isFundLike(instrument);
  const [tab, setTab] = useState<Tab>("panoramica");
  const hasIsin = ISIN_RE.test(instrument.isin);
  const q = new URLSearchParams({ t: instrument.ticker, n: instrument.shortName ?? instrument.name, fn: instrument.name, ...(fund ? { f: "1" } : {}), ...(hasIsin ? { isin: instrument.isin } : {}) });
  const insights = useJson<Insights>(`/api/insights?${q}`);
  const from = useMemo(() => new Date(Date.now() - 10 * 366 * 86400_000).toISOString().slice(0, 10), []);
  const histKey = instrument.currency === "EUR" && hasIsin ? `${instrument.ticker}~${instrument.isin}` : instrument.ticker;
  const hist = useJson<{ series: Record<string, [string, number][]> }>(`/api/history?from=${from}&t=${encodeURIComponent(histKey)}`);
  const series = hist?.series?.[instrument.ticker] ?? null;

  const options: { value: Tab; label: string }[] = [
    { value: "panoramica", label: "Panoramica" },
    { value: "dividendi", label: "Dividendi" },
    { value: "notizie", label: "Notizie" },
    ...(fund ? [] : [{ value: "analisti" as Tab, label: "Analisti" }]),
  ];

  return (
    <section className="pt-7">
      {/* Schede di testo, quella scelta su una pillola (come getquin). Il padding in alto lascia spazio all'area di tocco. */}
      <div role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-sep px-3 pb-3 pt-1">
        {options.map((o) => (
          <button
            key={o.value}
            role="tab"
            aria-selected={tab === o.value}
            onClick={() => setTab(o.value)}
            className={`press hit relative h-9 shrink-0 rounded-full px-3.5 text-[16px] transition-colors ${tab === o.value ? "bg-chip font-semibold text-ink" : "text-mut"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div key={tab} className="page-in">
        {tab === "panoramica" && <Overview series={series} loading={!hist} price={price} instrument={instrument} fund={fund && hasIsin} q={q.toString()} histKey={histKey} />}
        {tab === "dividendi" && <Dividends insights={insights} price={price} instrument={instrument} quantity={quantity} taxRate={taxRate} fund={fund} />}
        {tab === "notizie" && <News insights={insights} />}
        {tab === "analisti" && <Analysts instrument={instrument} q={q.toString()} price={price} />}
      </div>
    </section>
  );
}

/** Titolo di sezione grande, come le altre pagine. */
function H({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pb-4 pt-7">
      <h3 className="text-[22px] font-bold tracking-[-0.025em]">{children}</h3>
      {right}
    </div>
  );
}

/** Dati su due colonne: etichetta grigia sopra, valore sotto. */
function Stats({ items }: { items: ({ label: string; value: React.ReactNode; tone?: string; hint?: string } | null | false | undefined | 0 | "")[] }) {
  const list = items.filter(Boolean) as { label: string; value: React.ReactNode; tone?: string; hint?: string }[];
  return (
    <dl className="stagger grid grid-cols-2 gap-x-4 gap-y-5 px-4">
      {list.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[14px] leading-snug text-mut">{i.label}</dt>
          <dd className={`num mt-1 truncate text-[18px] font-medium ${i.tone ?? ""}`}>{i.value}</dd>
          {i.hint && <p className="text-[12px] text-mut">{i.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

/** Barra minimo–massimo con il segmento scuro dove si trova il prezzo (come getquin). */
function RangeBar({ title, low, high, price, currency }: { title: string; low: number; high: number; price: number; currency: string }) {
  const pos = high > low ? Math.min(1, Math.max(0, (price - low) / (high - low))) : 0.5;
  const w = 15;
  return (
    <div className="px-4 pb-6">
      <p className="text-[14px] text-mut">{title}</p>
      <div className="num mt-1 flex justify-between text-[18px] font-medium">
        <span>{px(low, currency)}</span>
        <span>{px(high, currency)}</span>
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-chip">
        <div className="absolute inset-y-0 rounded-full bg-ink transition-[left] duration-500" style={{ width: `${w}%`, left: `${pos * (100 - w)}%` }} />
      </div>
    </div>
  );
}

// ---------- Panoramica ----------

function Overview({ series, loading, price, instrument, fund, q, histKey }: { series: [string, number][] | null; loading: boolean; price: number | null; instrument: Instrument; fund: boolean; q: string; histKey: string }) {
  const stats = useMemo(() => (series ? priceStats(series, price) : null), [series, price]);
  const day = useJson<{ points: [string, number][]; previousClose: number }>(`/api/intraday?t=${encodeURIComponent(histKey)}`);
  // Indicatori di Finnhub (azioni USA): stessa richiesta della scheda Analisti, già in memoria.
  const an = useJson<AnalystResponse>(fund ? null : `/api/analysts?${q}`);
  const m = an?.status === "ok" ? an.data?.metrics : null;
  const L = useLocal(an, instrument, price);
  const cur = instrument.currency;
  if (loading) return <Skeleton rows={5} />;
  const pts = day?.points ?? [];
  const dayLow = pts.length ? Math.min(...pts.map((p) => p[1])) : null;
  const dayHigh = pts.length ? Math.max(...pts.map((p) => p[1])) : null;
  return (
    <div>
      <H>Dati finanziari</H>
      {dayLow !== null && dayHigh !== null && dayHigh > dayLow && <RangeBar title="Giornaliero" low={dayLow} high={dayHigh} price={price ?? pts[pts.length - 1][1]} currency={cur} />}
      {stats && <RangeBar title="Ultime 52 settimane" low={stats.low52} high={stats.high52} price={price ?? stats.low52} currency={cur} />}
      <Stats
        items={[
          pts.length > 0 && { label: "Apertura", value: px(pts[0][1], cur) },
          !!day?.previousClose && { label: "Chiusura precedente", value: px(day.previousClose, cur) },
          m?.marketCap && { label: "Capitalizzazione", value: L.company(m.marketCap) },
          m?.pe && { label: "Prezzo / utili", value: fmtN(m.pe, { maximumFractionDigits: 2 }) },
          m?.eps && !L.adr && { label: "Utile per azione", value: L.perShare(m.eps) },
          m?.revenueGrowth != null && { label: "Crescita ricavi", value: fmtSignedPct(m.revenueGrowth / 100), tone: tone(m.revenueGrowth) },
          m?.netMargin != null && { label: "Margine netto", value: fmtPct(m.netMargin / 100) },
          m?.beta != null && { label: "Beta", value: fmtN(m.beta, { maximumFractionDigits: 2 }) },
        ]}
      />
      {stats ? (
        <>
          <H>Rendimento</H>
          <Stats
            items={[
              stats.r1 !== null && { label: "1 anno", value: arrowPct(stats.r1), tone: tone(stats.r1) },
              stats.r3 !== null && { label: "3 anni, annuo", value: arrowPct(stats.r3), tone: tone(stats.r3) },
              stats.r5 !== null && { label: "5 anni, annuo", value: arrowPct(stats.r5), tone: tone(stats.r5) },
              stats.volatility !== null && { label: "Volatilità", value: fmtPct(stats.volatility) },
              {
                label: "Calo massimo",
                value: fmtSignedPct(stats.maxDrawdown),
                tone: stats.maxDrawdown < -0.0001 ? "text-dn" : "",
                hint: stats.drawdownDate ? `dal picco, ${fmtDate(stats.drawdownDate, { month: "short", year: "numeric" })}` : undefined,
              },
            ]}
          />
          {stats.years.length > 1 && (
            <div className="mx-4 mt-6 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${stats.years.length}, minmax(0, 1fr))` }}>
              {stats.years.map((y) => (
                <div key={y.year} className="rounded-[8px] py-1.5 text-center" style={{ background: cellBg(y.ret) }}>
                  <p className="num text-[11px] font-semibold text-mut">{y.year}</p>
                  <p className={`num text-[13px] font-semibold ${tone(y.ret)}`}>{signedShort(y.ret)}</p>
                </div>
              ))}
            </div>
          )}
          <p className="px-4 pt-3 text-[12px] leading-snug text-mut">Variazioni di prezzo: dividendi e cedole non inclusi.</p>
        </>
      ) : (
        <p className="px-4 pt-4 text-[15px] text-mut">Storico dei prezzi non disponibile.</p>
      )}
      {fund && <Composition isin={instrument.isin} />}
    </div>
  );
}

function Composition({ isin }: { isin: string }) {
  const { compositions, loading } = useCompositions(useMemo(() => [isin], [isin]));
  const [kind, setKind] = useState<"countries" | "sectors" | "holdings">("countries");
  const c = compositions[isin];
  if (loading && !c) return <Skeleton rows={3} />;
  if (!c) return null;
  const rows = (kind === "countries" ? c.countries : kind === "sectors" ? c.sectors : c.holdings ?? []).slice(0, 6);
  if (!rows.length && kind !== "countries") return null;
  const max = Math.max(...rows.map((r) => r.weight), 0.0001);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-7">
        <h3 className="text-[22px] font-bold tracking-[-0.025em]">Composizione</h3>
        <div className="w-[200px]">
          <Segmented
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: "countries", label: "Paesi" },
              { value: "sectors", label: "Settori" },
              ...(c.holdings?.length ? [{ value: "holdings" as const, label: "Aziende" }] : []),
            ]}
          />
        </div>
      </div>
      <ul key={kind} className="stagger">
        {rows.map((r) => (
          <li key={r.name} className="px-4 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-[15px]">{r.name}</p>
              <p className="num shrink-0 text-[15px] font-semibold">{fmtPct(r.weight)}</p>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-chip">
              <div className="grow-x h-full rounded-full bg-accent" style={{ width: `${(r.weight / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="px-4 pt-1 text-[12px] text-mut">Dati justETF.</p>
    </div>
  );
}

// ---------- Dividendi ----------

const FREQ: Record<string, string> = { mensile: "Mensile", trimestrale: "Trimestrale", semestrale: "Semestrale", annuale: "Annuale", irregolare: "Irregolare" };

function Dividends({ insights, price, instrument, quantity, taxRate, fund }: { insights: Insights | null; price: number | null; instrument: Instrument; quantity: number; taxRate: number; fund: boolean }) {
  const info = useMemo(() => (insights ? dividendInfo(insights.dividends, price) : null), [insights, price]);
  if (!insights) return <Skeleton rows={5} />;
  const cur = insights.currency || instrument.currency;
  if (!info) {
    return (
      <p className="px-4 pt-6 text-[15px] leading-snug text-mut">
        {fund ? "Nessuna distribuzione negli ultimi 10 anni: probabilmente è un ETF ad accumulazione, che reinveste i dividendi." : "Nessun dividendo pagato negli ultimi 10 anni."}
      </p>
    );
  }
  // Netto per te: solo se il dividendo è in euro come il titolo che possiedi.
  const mine = quantity > 0 && cur === "EUR" ? (a: number) => a * quantity * (1 - taxRate) : null;
  const next = info.upcoming[0];
  const g3 = info.growthBy.find((g) => g.years === 3) ?? info.growthBy[info.growthBy.length - 1];

  // Linea del tempo: i prossimi stimati (in alto, tratteggiati) e gli ultimi pagati.
  const timeline = [
    ...info.upcoming.slice(0, 2).reverse().map((u) => ({ ...u, future: true })),
    ...insights.dividends
      .filter(([d]) => d <= new Date().toISOString().slice(0, 10))
      .slice(-6)
      .reverse()
      .map(([date, amount]) => ({ date, amount, future: false })),
  ];
  const max = Math.max(...timeline.map((t) => t.amount), 0.0001);

  return (
    <div>
      <H>Generale</H>
      <Stats
        items={[
          { label: "Dividendo annuo (12 mesi)", value: fmtPrice(info.trailing, cur) },
          info.yield !== null && { label: "Rendimento (12 mesi)", value: fmtPct(info.yield) },
          { label: "Frequenza", value: FREQ[info.frequency] },
          g3 && { label: `Crescita (${g3.years} ${g3.years === 1 ? "anno" : "anni"})`, value: fmtSignedPct(g3.rate), tone: tone(g3.rate) },
          next && { label: "Prossimo pagamento previsto", value: fmtPrice(next.amount, cur), hint: `stima, ${fmtDate(next.date, { day: "numeric", month: "short" })}` },
          mine && { label: "Per te in un anno", value: fmtEur(mine(info.trailing)), tone: "text-up", hint: "stima netta sulle tue quote" },
        ]}
      />

      {info.growthBy.length > 0 && (
        <>
          <H>Crescita</H>
          <ul className="stagger">
            {info.growthBy.map((g) => (
              <li key={g.years} className="flex min-h-[48px] items-center gap-3 px-4">
                <p className="w-[72px] text-[17px] font-semibold">
                  {g.years} {g.years === 1 ? "anno" : "anni"}
                </p>
                <span className="rounded-full bg-chip px-2.5 py-0.5 text-[14px] text-mut">{growthLabel(g.rate)}</span>
                <p className={`num ml-auto text-[17px] font-medium ${tone(g.rate)}`}>{arrowPct(g.rate)}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Calendario a linea del tempo, come getquin. */}
      <div className="mx-4 mt-7 rounded-[20px] bg-panel px-5 pb-3 pt-5">
        <h3 className="text-[22px] font-bold tracking-[-0.025em]">Calendario</h3>
        <ul className="stagger mt-3">
          {timeline.map((t, i) => {
            const last = i === timeline.length - 1;
            const nextFuture = timeline[i + 1]?.future;
            return (
              <li key={t.date} className="relative flex min-h-[56px] items-center gap-4">
                {/* Pallino e tratto verso il pagamento successivo nella lista. */}
                <span className="relative flex w-3 shrink-0 justify-center self-stretch">
                  {!last && (
                    <span
                      className={`absolute top-1/2 h-full w-0 border-l-2 ${t.future || nextFuture ? "border-dashed border-faint/60" : "border-accent"}`}
                      style={{ top: "50%" }}
                    />
                  )}
                  <span className={`relative z-10 mt-auto mb-auto h-3 w-3 rounded-full ${t.future ? "border-2 border-faint/70 bg-panel" : "bg-accent"}`} />
                </span>
                <p className={`num w-[64px] shrink-0 text-[16px] font-semibold ${t.future ? "text-mut" : ""}`}>{monthYear(t.date)}</p>
                <div className="min-w-0 flex-1">
                  <div className={`grow-x h-2.5 rounded-[3px] ${t.future ? "border border-dashed border-accent/60" : "bg-accent"}`} style={{ width: `${Math.max(6, (t.amount / max) * 100)}%` }} />
                </div>
                <div className="shrink-0 text-right">
                  <p className={`num text-[16px] ${t.future ? "text-mut" : "font-medium"}`}>{fmtPrice(t.amount, cur)}</p>
                  {mine && <p className="num text-[12px] text-mut">{fmtEur(mine(t.amount))} a te</p>}
                </div>
              </li>
            );
          })}
        </ul>
        {info.upcoming.length > 0 && <p className="pb-1 pt-2 text-[12px] leading-snug text-mut">Tratteggiati i prossimi stacchi stimati sugli ultimi 12 mesi.</p>}
      </div>
    </div>
  );
}

/** "dic 26". */
function monthYear(iso: string) {
  const m = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"][Number(iso.slice(5, 7)) - 1];
  return `${m} ${iso.slice(2, 4)}`;
}

// ---------- Notizie ----------

function News({ insights }: { insights: Insights | null }) {
  if (!insights) return <Skeleton rows={4} />;
  const it = insights.newsIt ?? [];
  // Le notizie in inglese restano sotto, senza ripetere quelle già mostrate.
  const seen = new Set(it.map((n) => n.title.toLowerCase()));
  const en = insights.news.filter((n) => !seen.has(n.title.toLowerCase()));
  if (!it.length && !en.length) return <p className="px-4 pt-6 text-[15px] text-mut">Nessuna notizia recente.</p>;
  return (
    <>
      {it.length > 0 && (
        <>
          <H>In primo piano</H>
          <NewsList items={it} />
        </>
      )}
      {en.length > 0 && (
        <>
          <H>{it.length ? "Dalla stampa estera" : "Ultime notizie"}</H>
          <NewsList items={en} />
        </>
      )}
    </>
  );
}

function NewsList({ items }: { items: NewsItem[] }) {
  return (
    <ul className="stagger">
      {items.map((n) => (
        <li key={n.link}>
          <a href={n.link} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3.5 px-4 py-3 active:bg-panel-2">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip text-mut">
              <Newspaper size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-3 text-[16px] font-medium leading-snug">{n.title}</p>
              <p className="mt-1 text-[13px] text-mut">
                {n.publisher} · {fmtWhen(n.time)}
              </p>
            </div>
            <ExternalLink size={15} className="mt-1 shrink-0 text-faint" />
          </a>
        </li>
      ))}
    </ul>
  );
}

// ---------- Analisti ----------

interface AnalystResponse {
  status: "ok" | "nokey" | "unavailable";
  data?: {
    symbol: string;
    adr?: boolean;
    recommendation: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
    target: { mean: number; low: number; high: number } | null;
    metrics: { marketCap?: number; pe?: number; eps?: number; beta?: number; dividendYield?: number; revenueGrowth?: number; netMargin?: number } | null;
    nextEarnings: { date: string; epsEstimate: number | null; revenueEstimate: number | null; hour?: string } | null;
    earnings: { period: string; actual: number | null; estimate: number | null; surprisePercent: number | null }[];
  };
}

/**
 * I dati degli analisti arrivano dalla quotazione USA (in dollari): qui li si
 * riporta alla borsa del titolo. Prezzi obiettivo in proporzione al prezzo
 * locale (stesso potenziale), importi aziendali in euro col cambio BCE, dati
 * per azione nascosti per gli ADR (un ADR può valere più azioni europee).
 */
function useLocal(res: AnalystResponse | null, instrument: Instrument, price: number | null) {
  const symbol = res?.status === "ok" ? res.data?.symbol : undefined;
  const us = useJson<{ quotes: Record<string, { price: number }>; fx: Record<string, number> }>(symbol ? `/api/quotes?t=${symbol}` : null);
  const usPrice = symbol ? (us?.quotes?.[symbol]?.price ?? null) : null;
  const adr = !!res?.data?.adr;
  const cur = instrument.currency;
  const eurPerUsd = us?.fx?.USD ? 1 / us.fx.USD : null;
  const sameUs = cur === "USD";
  return {
    usPrice,
    /** Prezzo obiettivo nella valuta della borsa del titolo. */
    target: (v: number) => (sameUs || !usPrice || !price ? { v, c: "USD" } : { v: (v / usPrice) * price, c: cur }),
    localPrice: sameUs ? usPrice : price,
    /** Importi aziendali (capitalizzazione) in euro per i titoli in euro. */
    company: (v: number) => (cur === "EUR" && eurPerUsd ? `${fmtN((v * eurPerUsd) / 1e9, { maximumFractionDigits: v > 1e11 ? 0 : 1 })} mld €` : `${fmtN(v / 1e9, { maximumFractionDigits: v > 1e11 ? 0 : 1 })} mld $`),
    /** Dati per azione: in euro per i titoli in euro; nascosti per gli ADR. */
    perShare: (v: number) => (adr ? null : cur === "EUR" && eurPerUsd ? fmtPrice(v * eurPerUsd, "EUR") : fmtPrice(v, "USD")),
    adr,
  };
}

function Analysts({ instrument, q, price }: { instrument: Instrument; q: string; price: number | null }) {
  const res = useJson<AnalystResponse>(`/api/analysts?${q}`);
  const L = useLocal(res, instrument, price);
  if (!res) return <Skeleton rows={4} />;
  if (res.status === "nokey") {
    return (
      <Panel className="mt-6 px-4 py-4">
        <p className="flex items-center gap-2 text-[16px] font-semibold">
          <KeyRound size={18} className="text-accent" /> Da attivare una volta
        </p>
        <p className="mt-1.5 text-[14px] leading-snug text-mut">
          Consenso degli analisti, prezzo obiettivo, prossimi risultati e indicatori arrivano da Finnhub, gratuito con una chiave personale. Si attiva una volta sola dalle impostazioni del progetto.
        </p>
      </Panel>
    );
  }
  if (res.status === "unavailable" || !res.data) {
    return <p className="px-4 pt-6 text-[15px] leading-snug text-mut">Dati degli analisti disponibili per le azioni americane e le principali europee. Per questo titolo il servizio gratuito non li fornisce.</p>;
  }
  const d = res.data;
  const r = d.recommendation;
  const usPrice = L.usPrice;
  const total = r ? r.strongBuy + r.buy + r.hold + r.sell + r.strongSell : 0;
  const score = r && total ? (r.strongBuy * 2 + r.buy - r.sell - r.strongSell * 2) / total : 0;
  const verdict = score > 1.2 ? "Acquisto forte" : score > 0.4 ? "Acquisto" : score > -0.4 ? "Mantenere" : score > -1.2 ? "Vendita" : "Vendita forte";
  const m = d.metrics;
  return (
    <div>
      {r && total > 0 && (
        <p className="px-4 pt-7 text-[14px] text-mut">Consenso degli analisti</p>
      )}
      {r && total > 0 && (
        <div className="px-4 pt-1">
          <div className="flex items-baseline justify-between">
            <p className="text-[22px] font-bold tracking-[-0.02em]">{verdict}</p>
            <p className="text-[13px] text-mut">{total} analisti</p>
          </div>
          <div className="mt-2.5 flex h-2 gap-[3px] overflow-hidden rounded-full">
            {[
              [r.strongBuy + r.buy, "var(--up)"],
              [r.hold, "var(--faint)"],
              [r.sell + r.strongSell, "var(--dn)"],
            ].map(([n, c], i) => (n as number) > 0 && <div key={i} className="grow-x h-full" style={{ flex: n as number, background: c as string }} />)}
          </div>
          <div className="mt-2 flex justify-between text-[13px] text-mut">
            <span>
              <b className="text-up">{r.strongBuy + r.buy}</b> comprare
            </span>
            <span>
              <b className="text-ink-2">{r.hold}</b> mantenere
            </span>
            <span>
              <b className="text-dn">{r.sell + r.strongSell}</b> vendere
            </span>
          </div>
        </div>
      )}

      {d.target && (
        <div className="px-4 pt-7">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[22px] font-bold tracking-[-0.025em]">Prezzo obiettivo</h3>
            {usPrice && <p className={`num text-[15px] font-semibold ${tone(d.target.mean / usPrice - 1)}`}>{fmtSignedPct(d.target.mean / usPrice - 1)}</p>}
          </div>
          <TargetBar low={L.target(d.target.low)} mean={L.target(d.target.mean)} high={L.target(d.target.high)} price={L.localPrice} />
        </div>
      )}

      <H>Risultati</H>
      <Stats
        items={[
          d.nextEarnings && { label: "Prossima trimestrale", value: fmtDate(d.nextEarnings.date, { day: "numeric", month: "short", year: "numeric" }) },
          d.nextEarnings?.epsEstimate != null && !L.adr && { label: "Utile per azione atteso", value: L.perShare(d.nextEarnings.epsEstimate) },
        ]}
      />
      {d.earnings.length > 0 && (
        <>
          <p className="px-4 pb-1 pt-6 text-[14px] text-mut">{L.adr ? "Ultimi trimestri" : "Ultimi trimestri: utile per azione effettivo contro atteso"}</p>
          <ul className="stagger">
            {d.earnings.map((e) => (
              <li key={e.period} className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2">
                <p className="text-[15px]">{fmtDate(e.period, { month: "short", year: "numeric" })}</p>
                {!L.adr && (
                  <p className="num text-[14px] text-mut">
                    {e.actual != null ? L.perShare(e.actual) : "—"} vs {e.estimate != null ? L.perShare(e.estimate) : "—"}
                  </p>
                )}
                {e.surprisePercent != null && <p className={`num w-[64px] text-right text-[15px] font-semibold ${tone(e.surprisePercent)}`}>{fmtSignedPct(e.surprisePercent / 100)}</p>}
              </li>
            ))}
          </ul>
          <p className="px-4 pt-1 text-[12px] text-mut">Sorpresa rispetto all&apos;utile atteso dagli analisti.</p>
        </>
      )}
      <p className="px-4 pt-4 text-[12px] leading-snug text-mut">
        Dati Finnhub{L.adr ? `, dalla quotazione americana ${d.symbol}: obiettivi riportati sul prezzo di ${exchangeName(instrument.ticker)}` : ""}. Opinioni degli analisti, non consigli di investimento.
      </p>
    </div>
  );
}

function TargetBar({ low, mean, high, price }: { low: { v: number; c: string }; mean: { v: number; c: string }; high: { v: number; c: string }; price: number | null }) {
  const lo = Math.min(low.v, price ?? low.v);
  const hi = Math.max(high.v, price ?? high.v);
  const x = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  return (
    <div className="pb-1 pt-4">
      <div className="relative h-1.5 rounded-full bg-chip">
        <div className="absolute inset-y-0 rounded-full bg-accent/35" style={{ left: x(low.v), width: `calc(${x(high.v)} - ${x(low.v)})` }} />
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-bg bg-accent" style={{ left: x(mean.v) }} />
        {price && <span className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: x(price) }} />}
      </div>
      <div className="num mt-2 flex justify-between text-[13px] text-mut">
        <span>min {px(low.v, low.c)}</span>
        <span className="font-semibold text-accent">media {px(mean.v, mean.c)}</span>
        <span>max {px(high.v, high.c)}</span>
      </div>
      {price && <p className="num mt-1 text-[12px] text-mut">Prezzo attuale {px(price, mean.c)} (barra scura)</p>}
    </div>
  );
}

// ---------- comuni ----------

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 px-4 pt-6" aria-label="Caricamento">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between">
          <span className="skeleton h-3.5" style={{ width: `${40 + ((i * 17) % 30)}%` }} />
          <span className="skeleton h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Prezzo con due decimali (quattro solo sotto 1, es. 0,0106 €). */
function px(v: number, currency: string) {
  return fmtPrice(v >= 1 ? Math.round(v * 100) / 100 : v, currency);
}

/** "↗ 9,61%" come getquin. */
function arrowPct(v: number) {
  return `${v > 0.00005 ? "↗ " : v < -0.00005 ? "↘ " : ""}${fmtPct(Math.abs(v))}`;
}

function tone(n: number) {
  return n > 0.00005 ? "text-up" : n < -0.00005 ? "text-dn" : "";
}

function cellBg(v: number) {
  const s = Math.min(1, Math.abs(v) / 0.25);
  return `color-mix(in srgb, ${v >= 0 ? "var(--up)" : "var(--dn)"} ${8 + s * 22}%, transparent)`;
}

function signedShort(v: number) {
  const n = Math.abs(v * 100);
  return `${v > 0.0005 ? "+" : v < -0.0005 ? "−" : ""}${fmtN(n, { maximumFractionDigits: n >= 10 ? 0 : 1 })}%`;
}
