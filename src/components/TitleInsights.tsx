"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, KeyRound, Newspaper } from "lucide-react";
import { DayCell, InfoRow, Panel, Segmented } from "@/components/ui";
import type { Instrument } from "@/lib/engine/types";
import { isFundLike } from "@/lib/engine/tax";
import { exchangeName, fmtDate, fmtEur, fmtN, fmtPct, fmtPrice, fmtSignedPct, fmtWhen } from "@/lib/format";
import { dividendInfo, priceStats } from "@/lib/insights";
import { useCompositions } from "@/lib/xray-client";

type Tab = "panoramica" | "dividendi" | "notizie" | "analisti";
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

interface Insights {
  currency: string;
  dividends: [string, number][];
  news: { title: string; publisher: string; link: string; time: number }[];
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
  const q = new URLSearchParams({ t: instrument.ticker, n: instrument.shortName ?? instrument.name, ...(hasIsin ? { isin: instrument.isin } : {}) });
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
    <section className="pt-8">
      <div className="px-4">
        <Segmented value={tab} onChange={setTab} options={options} size="sm" />
      </div>
      <div key={tab} className="page-in pt-4">
        {tab === "panoramica" && <Overview series={series} loading={!hist} price={price} instrument={instrument} fund={fund && hasIsin} />}
        {tab === "dividendi" && <Dividends insights={insights} price={price} instrument={instrument} quantity={quantity} taxRate={taxRate} fund={fund} />}
        {tab === "notizie" && <News insights={insights} />}
        {tab === "analisti" && <Analysts instrument={instrument} q={q.toString()} />}
      </div>
    </section>
  );
}

// ---------- Panoramica ----------

function Overview({ series, loading, price, instrument, fund }: { series: [string, number][] | null; loading: boolean; price: number | null; instrument: Instrument; fund: boolean }) {
  const stats = useMemo(() => (series ? priceStats(series, price) : null), [series, price]);
  const cur = instrument.currency;
  if (loading) return <Skeleton rows={4} />;
  return (
    <div>
      {stats ? (
        <>
          <Range52 low={stats.low52} high={stats.high52} price={price ?? stats.low52} currency={cur} />
          <Panel className="mt-4">
            {stats.r1 !== null && <InfoRow label="Rendimento a 1 anno" value={fmtSignedPct(stats.r1)} valueClass={tone(stats.r1)} />}
            {stats.r3 !== null && <InfoRow label="A 3 anni" hint="media annua" value={fmtSignedPct(stats.r3)} valueClass={tone(stats.r3)} />}
            {stats.r5 !== null && <InfoRow label="A 5 anni" hint="media annua" value={fmtSignedPct(stats.r5)} valueClass={tone(stats.r5)} />}
            {stats.volatility !== null && <InfoRow label="Volatilità" hint="oscillazione annua tipica" value={fmtPct(stats.volatility)} />}
            <InfoRow
              label="Calo massimo"
              hint={stats.drawdownDate ? `dal picco, ${fmtDate(stats.drawdownDate, { month: "short", year: "numeric" })}` : "dal picco, ultimi 5 anni"}
              value={fmtSignedPct(stats.maxDrawdown)}
              valueClass={stats.maxDrawdown < -0.0001 ? "text-dn" : ""}
            />
          </Panel>
          <p className="px-8 pt-2 text-[12px] leading-snug text-mut">Variazioni di prezzo: dividendi e cedole non inclusi.</p>
          {stats.years.length > 1 && (
            <div className="mx-4 mt-4 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${stats.years.length}, minmax(0, 1fr))` }}>
              {stats.years.map((y) => (
                <div key={y.year} className="rounded-[8px] py-1.5 text-center" style={{ background: cellBg(y.ret) }}>
                  <p className="num text-[11px] font-semibold text-mut">{y.year}</p>
                  <p className={`num text-[13px] font-semibold ${tone(y.ret)}`}>{signedShort(y.ret)}</p>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="px-4 text-[15px] text-mut">Storico dei prezzi non disponibile.</p>
      )}
      {fund && <Composition isin={instrument.isin} />}
    </div>
  );
}

/** Barra delle 52 settimane: dove si trova il prezzo tra minimo e massimo. */
function Range52({ low, high, price, currency }: { low: number; high: number; price: number; currency: string }) {
  const pos = high > low ? Math.min(1, Math.max(0, (price - low) / (high - low))) : 0.5;
  return (
    <div className="px-4">
      <div className="flex items-baseline justify-between text-[13px] text-mut">
        <span>Minimo 52 settimane</span>
        <span>Massimo</span>
      </div>
      <div className="relative mt-2 h-1.5 rounded-full bg-chip">
        <div className="grow-x absolute inset-y-0 left-0 rounded-full bg-accent/35" style={{ width: `${pos * 100}%` }} />
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-bg bg-accent" style={{ left: `${pos * 100}%` }} />
      </div>
      <div className="num mt-1.5 flex justify-between text-[14px] font-medium">
        <span>{fmtPrice(low, currency)}</span>
        <span>{fmtPrice(high, currency)}</span>
      </div>
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
    <div className="pt-8">
      <div className="flex items-center justify-between px-4 pb-3">
        <h3 className="text-[17px] font-semibold">Composizione</h3>
        <div className="w-[230px]">
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
  if (!insights) return <Skeleton rows={4} />;
  const cur = insights.currency || instrument.currency;
  if (!info) {
    return (
      <p className="px-4 text-[15px] leading-snug text-mut">
        {fund ? "Nessuna distribuzione negli ultimi 10 anni: probabilmente è un ETF ad accumulazione, che reinveste i dividendi." : "Nessun dividendo pagato negli ultimi 10 anni."}
      </p>
    );
  }
  const max = Math.max(...info.byYear.map((b) => b.amount + b.estimate), 0.0001);
  const thisYear = String(new Date().getFullYear());
  // Netto per te: solo se la valuta del dividendo coincide con quella del titolo che possiedi (euro).
  const mine = quantity > 0 && cur === "EUR" ? (a: number) => a * quantity * (1 - taxRate) : null;
  return (
    <div>
      <Panel>
        {info.yield !== null && <InfoRow label="Rendimento" hint="ultimi 12 mesi sul prezzo attuale" value={fmtPct(info.yield)} />}
        <InfoRow label="Dividendo annuo" hint="per azione, ultimi 12 mesi" value={fmtPrice(info.trailing, cur)} />
        <InfoRow label="Frequenza" value={FREQ[info.frequency]} />
        {info.growth !== null && <InfoRow label="Crescita" hint={`media annua, ultimi ${info.growthYears} anni`} value={fmtSignedPct(info.growth)} valueClass={tone(info.growth)} />}
        {info.last && <InfoRow label="Ultimo stacco" hint={fmtDate(info.last.date)} value={fmtPrice(info.last.amount, cur)} />}
        {mine && <InfoRow label="Per te in un anno" hint="stima netta sulle tue quote" value={fmtEur(mine(info.trailing))} valueClass="text-up" />}
      </Panel>

      {/* Andamento per anno: l'anno in corso con la parte stimata tratteggiata. */}
      <div className="mx-4 mt-6 flex h-[120px] items-end gap-2">
        {info.byYear.map((b) => (
          <div key={b.year} className="flex h-full flex-1 flex-col items-center justify-end">
            {b.estimate > 0 && (
              <div className="grow-y hatch-box w-full rounded-[6px] border-[1.5px] border-dashed border-accent" style={{ height: `${(b.estimate / max) * 100}%` }} />
            )}
            {b.amount > 0 && <div className="grow-y mt-[2px] w-full rounded-[6px] bg-accent" style={{ height: `${(b.amount / max) * 100}%` }} />}
            <p className={`num mt-1.5 text-[11px] font-semibold ${b.year === thisYear ? "text-ink" : "text-mut"}`}>{b.year}</p>
          </div>
        ))}
      </div>

      {info.upcoming.length > 0 && (
        <>
          <h3 className="px-4 pb-1 pt-7 text-[17px] font-semibold">Prossimi stacchi stimati</h3>
          <ul className="stagger">
            {info.upcoming.slice(0, 4).map((u) => (
              <li key={u.date} className="flex min-h-[56px] items-center gap-3.5 px-4 py-2">
                <DayCell date={u.date} year={u.date.slice(0, 4) !== thisYear} className="text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="num text-[16px] font-medium">{fmtPrice(u.amount, cur)} per azione</p>
                  {mine && <p className="num text-[13px] text-mut">circa {fmtEur(mine(u.amount))} netti per te</p>}
                </div>
                <span className="text-[13px] text-mut">Stima</span>
              </li>
            ))}
          </ul>
          <p className="px-4 pt-1 text-[12px] leading-snug text-mut">Stime: stesse date e importi degli ultimi 12 mesi. Lo stacco effettivo lo decide la società.</p>
        </>
      )}
    </div>
  );
}

// ---------- Notizie ----------

function News({ insights }: { insights: Insights | null }) {
  if (!insights) return <Skeleton rows={4} />;
  if (!insights.news.length) return <p className="px-4 text-[15px] text-mut">Nessuna notizia recente.</p>;
  return (
    <ul className="stagger">
      {insights.news.map((n) => (
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
    recommendation: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
    target: { mean: number; low: number; high: number } | null;
    metrics: { marketCap?: number; pe?: number; eps?: number; beta?: number; dividendYield?: number; revenueGrowth?: number; netMargin?: number } | null;
    nextEarnings: { date: string; epsEstimate: number | null; revenueEstimate: number | null; hour?: string } | null;
    earnings: { period: string; actual: number | null; estimate: number | null; surprisePercent: number | null }[];
  };
}

function Analysts({ instrument, q }: { instrument: Instrument; q: string }) {
  const res = useJson<AnalystResponse>(`/api/analysts?${q}`);
  const symbol = res?.data?.symbol;
  // Prezzo della quotazione USA, per confrontarlo con il prezzo obiettivo (in dollari).
  const usQuote = useJson<{ quotes: Record<string, { price: number }> }>(symbol ? `/api/quotes?t=${symbol}` : null);
  if (!res) return <Skeleton rows={4} />;
  if (res.status === "nokey") {
    return (
      <Panel className="px-4 py-4">
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
    return <p className="px-4 text-[15px] leading-snug text-mut">Dati degli analisti disponibili per le azioni americane. Per questo titolo il servizio gratuito non li fornisce.</p>;
  }
  const d = res.data;
  const usPrice = symbol ? usQuote?.quotes?.[symbol]?.price ?? null : null;
  const r = d.recommendation;
  const total = r ? r.strongBuy + r.buy + r.hold + r.sell + r.strongSell : 0;
  const score = r && total ? (r.strongBuy * 2 + r.buy - r.sell - r.strongSell * 2) / total : 0;
  const verdict = score > 1.2 ? "Acquisto forte" : score > 0.4 ? "Acquisto" : score > -0.4 ? "Mantenere" : score > -1.2 ? "Vendita" : "Vendita forte";
  const m = d.metrics;
  return (
    <div>
      {r && total > 0 && (
        <div className="px-4">
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
            <h3 className="text-[17px] font-semibold">Prezzo obiettivo a 12 mesi</h3>
            {usPrice && <p className={`num text-[15px] font-semibold ${tone(d.target.mean / usPrice - 1)}`}>{fmtSignedPct(d.target.mean / usPrice - 1)}</p>}
          </div>
          <TargetBar low={d.target.low} mean={d.target.mean} high={d.target.high} price={usPrice} />
        </div>
      )}

      <Panel className="mt-6">
        {d.nextEarnings && (
          <InfoRow
            label="Prossimi risultati"
            hint={d.nextEarnings.epsEstimate != null ? `utile per azione atteso ${fmtPrice(d.nextEarnings.epsEstimate, "USD")}` : undefined}
            value={fmtDate(d.nextEarnings.date, { day: "numeric", month: "short", year: "numeric" })}
          />
        )}
        {m?.marketCap && <InfoRow label="Capitalizzazione" value={`${fmtN(m.marketCap / 1e9, { maximumFractionDigits: m.marketCap > 1e11 ? 0 : 1 })} mld $`} />}
        {m?.pe && <InfoRow label="Prezzo / utili" hint="ultimi 12 mesi" value={fmtN(m.pe, { maximumFractionDigits: 1 })} />}
        {m?.revenueGrowth != null && <InfoRow label="Crescita dei ricavi" hint="anno su anno" value={fmtSignedPct(m.revenueGrowth / 100)} valueClass={tone(m.revenueGrowth)} />}
        {m?.netMargin != null && <InfoRow label="Margine netto" value={fmtPct(m.netMargin / 100)} />}
        {m?.beta != null && <InfoRow label="Beta" hint="sensibilità al mercato (1 = come l'indice)" value={fmtN(m.beta, { maximumFractionDigits: 2 })} />}
        {m?.dividendYield ? <InfoRow label="Rendimento da dividendo" value={fmtPct(m.dividendYield / 100)} /> : null}
      </Panel>

      {d.earnings.length > 0 && (
        <>
          <h3 className="px-4 pb-1 pt-7 text-[17px] font-semibold">Ultimi risultati</h3>
          <ul className="stagger">
            {d.earnings.map((e) => (
              <li key={e.period} className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-2">
                <p className="text-[15px]">{fmtDate(e.period, { month: "short", year: "numeric" })}</p>
                <p className="num text-[14px] text-mut">
                  {e.actual != null ? fmtPrice(e.actual, "USD") : "—"} vs {e.estimate != null ? fmtPrice(e.estimate, "USD") : "—"}
                </p>
                {e.surprisePercent != null && <p className={`num w-[64px] text-right text-[15px] font-semibold ${tone(e.surprisePercent)}`}>{fmtSignedPct(e.surprisePercent / 100)}</p>}
              </li>
            ))}
          </ul>
          <p className="px-4 pt-1 text-[12px] text-mut">Utile per azione effettivo contro atteso. Quotazione USA {d.symbol} · {exchangeName(d.symbol)}.</p>
        </>
      )}
      <p className="px-4 pt-4 text-[12px] leading-snug text-mut">Dati Finnhub. Opinioni degli analisti, non consigli di investimento.</p>
    </div>
  );
}

function TargetBar({ low, mean, high, price }: { low: number; mean: number; high: number; price: number | null }) {
  const lo = Math.min(low, price ?? low);
  const hi = Math.max(high, price ?? high);
  const x = (v: number) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  return (
    <div className="pb-1 pt-4">
      <div className="relative h-1.5 rounded-full bg-chip">
        <div className="absolute inset-y-0 rounded-full bg-accent/35" style={{ left: x(low), width: `calc(${x(high)} - ${x(low)})` }} />
        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-bg bg-accent" style={{ left: x(mean) }} />
        {price && <span className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" style={{ left: x(price) }} />}
      </div>
      <div className="num mt-2 flex justify-between text-[13px] text-mut">
        <span>min {fmtPrice(low, "USD")}</span>
        <span className="font-semibold text-accent">media {fmtPrice(mean, "USD")}</span>
        <span>max {fmtPrice(high, "USD")}</span>
      </div>
      {price && <p className="num mt-1 text-[12px] text-mut">Prezzo attuale {fmtPrice(price, "USD")} (barra scura)</p>}
    </div>
  );
}

// ---------- comuni ----------

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 px-4" aria-label="Caricamento">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between">
          <span className="skeleton h-3.5" style={{ width: `${40 + ((i * 17) % 30)}%` }} />
          <span className="skeleton h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
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
