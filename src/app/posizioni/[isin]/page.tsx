"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { usePortfolioView } from "@/components/PortfolioProvider";
import { type ChartPoint } from "@/components/AreaChart";
import { InteractiveChart } from "@/components/InteractiveChart";
import { RANGES, RANGE_PHRASE, rangeStart, type Range } from "@/lib/range";
import { BENCHMARKS, alignSeries } from "@/lib/benchmarks";
import { twrSeries } from "@/lib/performance";
import { toggleWatch, usePortfolioData } from "@/lib/store";
import { Plus, Star } from "lucide-react";
import { TitleInsights } from "@/components/TitleInsights";
import { DayCell, BackLink, RangePicker, SelectButton, BankDot, Change, InfoRow, Logo, Panel, SectionHeader, Segmented } from "@/components/ui";
import { ASSET_CLASS_LABEL, cutoffDate, type FxRates, type HistoryPoint, type PositionView } from "@/lib/analytics";
import { simulateSale } from "@/lib/engine/portfolio";
import { detectPac } from "@/lib/pac";
import { effectiveRate } from "@/lib/engine/tax";
import type { Account, Instrument, PortfolioState } from "@/lib/engine/types";
import { exchangeName, fmtDate, fmtEur, fmtNum, fmtPct, fmtPrice, fmtSignedEur, fmtSignedPct, fmtWhen, fmtN, fmtDay } from "@/lib/format";


/** Etichette dell'asse in percentuale: +4%, −1,5%. */
function axisPct(v: number) {
  const n = v * 100;
  const s = fmtN(Math.abs(n), { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 });
  return `${n < -0.0001 ? "−" : n > 0.0001 ? "+" : ""}${s}%`;
}
const TX_LABEL = { buy: "Acquisto", sell: "Vendita", dividend: "Cedola/dividendo", split: "Frazionamento", cash: "Liquidità", deposit: "Versamento", withdrawal: "Prelievo", transfer: "Bonifico" } as const;

export default function PositionDetail() {
  const { isin: rawId } = useParams<{ isin: string }>();
  const id = decodeURIComponent(rawId);
  const search = useSearchParams();
  const { data, state, views, quotes: ownQuotes, fx, priceSeries: ownSeries, historyReady: ownReady, history } = usePortfolioView();
  const [range, setRange] = useState<Range>("1A");
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [bank, setBank] = useState<string>("all");
  const [allTx, setAllTx] = useState(false);

  // Titolo del portafoglio (per ISIN o simbolo) oppure titolo cercato, descritto nell'indirizzo.
  const known = data.instruments.find((i) => i.isin === id) ?? data.instruments.find((i) => i.ticker === id);
  const instrument = useMemo<Instrument | undefined>(() => {
    if (known) return known;
    const t = search.get("t");
    if (!t) return undefined;
    const name = search.get("n") ?? t;
    const type = search.get("k") ?? "";
    return {
      isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(id) ? id : t,
      name,
      shortName: name,
      ticker: t,
      currency: search.get("c") ?? "EUR",
      assetClass: type === "ETF" ? "etf_azionario" : type === "CRYPTOCURRENCY" ? "crypto" : "azione",
    };
  }, [known, search, id]);
  const isin = instrument?.isin ?? id;
  const watched = !known && !!instrument;
  const extra = useWatchedData(watched ? instrument : undefined);
  const quotes = watched ? extra.quotes : ownQuotes;
  const priceSeries = watched ? extra.series : ownSeries;
  const historyReady = watched ? extra.ready : ownReady;
  const [cmp, setCmp] = useState<string>("none");
  const cmpSeries = useCompareSeries(cmp, ownSeries, history);
  const accounts = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts]);
  const allRows = views.filter((v) => v.instrument.isin === isin);
  const rows = bank === "all" ? allRows : allRows.filter((r) => r.position.account === bank);
  const txs = data.transactions.filter((t) => t.isin === isin).sort((a, b) => b.date.localeCompare(a.date));

  // Andamento della giornata (ogni 5 minuti), caricato solo quando serve.
  const [intraday, setIntraday] = useState<{ points: [string, number][]; previousClose: number } | null>(null);
  useEffect(() => {
    if (range !== "1G" || !instrument) return;
    let stop = false;
    setIntraday(null);
    const t = instrument.currency === "EUR" ? `${instrument.ticker}~${instrument.isin}` : instrument.ticker;
    fetch(`/api/intraday?t=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((j) => !stop && setIntraday(j))
      .catch(() => !stop && setIntraday({ points: [], previousClose: 0 }));
    return () => {
      stop = true;
    };
  }, [range, instrument]);

  /** Prezzi del periodo (in valuta del titolo). */
  const prices = useMemo<ChartPoint[]>(() => {
    if (!instrument) return [];
    if (range === "1G") return (intraday?.points ?? []).map(([date, value]) => ({ date, value }));
    const s = priceSeries[instrument.ticker] ?? [];
    const cutoff = rangeStart(range);
    return s.filter(([d]) => d >= cutoff).map(([date, value]) => ({ date, value }));
  }, [priceSeries, instrument, range, intraday]);
  // Base della percentuale: chiusura di ieri per "1G", primo prezzo del periodo altrimenti.
  const base = range === "1G" ? intraday?.previousClose || prices[0]?.value : prices[0]?.value;
  const points = useMemo<ChartPoint[]>(() => (base ? prices.map((p) => ({ date: p.date, value: p.value / base - 1 })) : []), [prices, base]);
  // Confronto: stessa partenza del titolo (0% al primo giorno del periodo). Non in giornata.
  const compare = useMemo(() => (range === "1G" || cmp === "none" ? undefined : alignSeries(prices.map((p) => p.date), cmpSeries ?? undefined)), [range, cmp, prices, cmpSeries]);

  if (!instrument) {
    return (
      <div className="px-4 pt-10 text-center text-mut">
        Titolo non trovato.{" "}
        <Link href="/posizioni" className="text-accent">
          Torna ai titoli
        </Link>
      </div>
    );
  }

  const q = quotes[instrument.ticker];
  const price = scrub?.value ?? q?.price ?? prices.at(-1)?.value;
  const rangeChange = base && price ? (price - base) / base : 0;
  const qty = rows.reduce((a, r) => a + r.position.quantity, 0);
  const value = rows.reduce((a, r) => a + r.value, 0);
  const cost = rows.reduce((a, r) => a + r.position.totalCost, 0);
  const tax = rows.reduce((a, r) => a + r.taxIfSold, 0);
  const income = state?.positions.filter((p) => p.isin === isin && (bank === "all" || p.account === bank)).reduce((a, p) => a + p.income, 0) ?? 0;
  const name = instrument.shortName ?? instrument.name;
  const compareOptions = [
    { value: "none", label: "Nessun confronto" },
    ...(known || views.length ? [{ value: "portfolio", label: "Il tuo portafoglio" }] : []),
    ...BENCHMARKS.filter((b) => b.value !== instrument.ticker).map((b) => ({ value: b.value as string, label: b.label })),
    ...(data.watchlist ?? []).filter((w) => w.ticker !== instrument.ticker).map((w) => ({ value: w.ticker, label: w.name })),
  ];
  const pmcMarker =
    instrument.currency === "EUR" && qty > 0 && base && range !== "1G" ? { value: cost / qty / base - 1, label: `Il tuo prezzo medio ${fmtEur(cost / qty)}` } : undefined;

  return (
    <div>
      <div className="flex items-center justify-between pr-4">
        <BackLink href="/posizioni" label="Titoli" />
        {watched && instrument && <WatchStar instrument={instrument} type={search.get("k") ?? undefined} />}
      </div>

      <div className="flex items-center gap-3.5 px-4 pt-2">
        <Logo isin={instrument.isin} name={name} size={48} />
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-bold tracking-[-0.025em]">{name}</h1>
          <p className="num truncate text-[14px] text-mut">
            {instrument.ticker.split(".")[0]} · {watched ? exchangeName(instrument.ticker) : instrument.isin}
          </p>
        </div>
      </div>
      <div className="px-4 pt-6">
        {price === undefined ? (
          <p className="text-[15px] text-mut">Quotazione non disponibile al momento.</p>
        ) : (
          <>
            <PriceBig value={price} currency={instrument.currency} />
            <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-[14px] text-mut">
              <span className={`num font-semibold ${rangeChange > 0 ? "text-up" : rangeChange < 0 ? "text-dn" : "text-mut"}`}>
                {rangeChange > 0 ? "↗ " : rangeChange < 0 ? "↘ " : ""}
                {fmtPct(Math.abs(rangeChange))}
              </span>
              {scrub ? (scrub.date.length > 10 ? `alle ${new Date(scrub.date).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : `al ${fmtDate(scrub.date)}`) : range === "1G" && prices.length && new Date(prices[prices.length - 1].date).toDateString() !== new Date().toDateString() ? "ultima seduta" : RANGE_PHRASE[range]}
              {!scrub && q && range !== "1G" && (
                <>
                  <span className="text-faint">·</span>
                  oggi <Change pct={(q.price - q.previousClose) / q.previousClose} size="sm" />
                </>
              )}
            </p>
            {q && (
              <p className="mt-1 text-[13px] text-mut">
                {q.source ?? exchangeName(instrument.ticker)} · prezzo {fmtWhen(q.time)}
                {q.source === "Tradegate" ? ", fuori orario di borsa" : Date.now() - q.time > 30 * 60_000 ? " (borsa chiusa)" : ", ritardo ~15 min"}
              </p>
            )}
          </>
        )}
      </div>

      {range !== "1G" && points.length > 1 && (
        <div className="mt-5 flex items-center justify-between px-4">
          <p className="flex items-center gap-3 text-[12px] text-mut">
            {compare && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className={`h-0.5 w-4 rounded ${points[points.length - 1].value >= 0 ? "bg-up" : "bg-dn"}`} /> {name}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-dashed border-accent" /> Confronto
                </span>
              </>
            )}
          </p>
          <SelectButton label="Confronta con" value={cmp} onChange={setCmp} display={cmp === "none" ? "Confronta" : undefined} options={compareOptions} />
        </div>
      )}
      <div className={`pl-4 pr-3 ${points.length > 1 ? (range !== "1G" ? "mt-3" : "mt-6") : "mt-2"}`}>
        <InteractiveChart
          compare={compare}
          points={points}
          height={points.length > 1 || (range === "1G" ? !intraday : !historyReady) ? 234 : 72}
          reference={0}
          onSelect={(sel) => setScrub(sel ? prices[sel.b ?? sel.a] : null)}
          loading={range === "1G" ? !intraday : !historyReady}
          format={(v) => fmtSignedPct(v)}
          formatAxis={axisPct}
          describePoint={(i) => `${fmtPrice(prices[i].value, instrument.currency)} · ${fmtSignedPct(points[i].value)}${compare?.[i] != null ? ` · confronto ${fmtSignedPct(compare[i]!)}` : ""}`}
          describeRange={(i, j) => `${fmtSignedPct(prices[j].value / prices[i].value - 1)} · ${fmtPrice(prices[j].value - prices[i].value, instrument.currency)}`}
          marker={pmcMarker}
          events={
            range === "1G"
              ? []
              : txs
                  .filter((t) => t.type === "buy" || t.type === "sell" || t.type === "dividend")
                  .map((t) => ({
                    date: t.date,
                    kind: t.type as "buy" | "sell" | "dividend",
                    label: t.type === "dividend" ? `+${fmtEur(t.amount ?? 0)}` : `${fmtNum(t.quantity ?? 0)} quote a ${fmtPrice(t.price ?? 0, instrument.currency)}`,
                  }))
          }
        />
      </div>
      <RangePicker value={range} onChange={setRange} options={RANGES} />

      {watched && (
        <div className="px-4 pt-6">
          <Link
            href={`/movimenti/nuovo?${new URLSearchParams({ t: instrument.ticker, n: name, c: instrument.currency, k: search.get("k") ?? "", ...(/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(instrument.isin) ? { isin: instrument.isin } : {}), ...(q?.price ? { p: String(q.price) } : {}) })}`}
            className="press flex h-[50px] items-center justify-center gap-2 rounded-[16px] bg-ink text-[16px] font-semibold text-bg"
          >
            <Plus size={18} strokeWidth={2.6} /> Registra un acquisto
          </Link>
        </div>
      )}

      <TitleInsights instrument={instrument} price={q?.price ?? prices.at(-1)?.value ?? null} quantity={qty} taxRate={effectiveRate(instrument)} />

      {allRows.length > 0 && (
        <>
          <SectionHeader>La tua posizione</SectionHeader>
          {allRows.length > 1 && (
            <div className="px-4 pb-3">
              <Segmented
                value={bank}
                onChange={setBank}
                options={[{ value: "all", label: "Tutte" }, ...allRows.map((r) => ({ value: r.position.account, label: accounts.get(r.position.account)?.name ?? r.position.account }))]}
              />
            </div>
          )}
          <Panel>
            <InfoRow
              label={`Valore${bank !== "all" || allRows.length === 1 ? ` · ${accounts.get(rows[0]?.position.account ?? "")?.name ?? ""}` : ""}`}
              value={<span className="sensitive">{fmtEur(value)}</span>}
            />
            <InfoRow
              label="Guadagno"
              value={<span className="sensitive">{`${fmtSignedEur(value - cost)} · ${fmtSignedPct(cost ? (value - cost) / cost : 0)}`}</span>}
              valueClass={value - cost > 0.005 ? "text-up" : value - cost < -0.005 ? "text-dn" : ""}
            />
            <InfoRow label="Quote" value={fmtNum(qty)} />
            <InfoRow
              label="Prezzo medio di carico"
              value={fmtEur(qty ? cost / qty : 0)}
              hint={bank === "all" && allRows.length > 1 ? "Calcolato per ogni banca" : undefined}
            />
            <InfoRow label="Investito" value={<span className="sensitive">{fmtEur(cost)}</span>} />
            {income > 0 && <InfoRow label="Cedole e dividendi incassati" value={`+${fmtEur(income)}`} valueClass="text-up" />}
            {allRows.map((r) => {
              const pac = detectPac(data.transactions, isin, r.position.account);
              if (!pac) return null;
              return (
                <InfoRow
                  key={`pac-${r.position.account}`}
                  label={`Piano di accumulo${allRows.length > 1 ? ` · ${accounts.get(r.position.account)?.name}` : ""}`}
                  hint={`${pac.installments} rate dal ${fmtDate(pac.since, { month: "short", year: "numeric" })}`}
                  value={`${fmtEur(pac.monthly)} al mese`}
                />
              );
            })}
            <InfoRow label="Tasse se vendi oggi" value={fmtEur(tax)} />
            <InfoRow label="Netto se vendi oggi" value={<span className="sensitive">{fmtEur(value - tax)}</span>} />
          </Panel>

          {state && (
            <Simulator
              key={bank}
              state={state}
              instrument={instrument}
              rows={bank === "all" ? allRows : rows}
              accounts={accounts}
              price={q?.price}
              fx={fx}
            />
          )}
        </>
      )}

      <SectionHeader>Informazioni</SectionHeader>
      <Panel>
        {/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(instrument.isin) ? <InfoRow label="ISIN" value={instrument.isin} /> : <InfoRow label="Simbolo" value={instrument.ticker} />}
        {watched && <InfoRow label="Borsa" value={exchangeName(instrument.ticker)} />}
        <InfoRow label="Valuta" value={instrument.currency} />
        {instrument.ter !== undefined && <InfoRow label="Costo annuo (TER)" value={`${fmtN(instrument.ter)}%`} />}
        <InfoRow
          label="Aliquota sulle plusvalenze"
          value={fmtPct(effectiveRate(instrument))}
          hint={instrument.govBondShare ? `${Math.round(instrument.govBondShare * 100)}% in titoli di Stato al 12,5%` : undefined}
        />
      </Panel>

      {txs.length > 0 && <SectionHeader>Operazioni</SectionHeader>}
      <ul>
        {(allTx ? txs : txs.slice(0, 5)).map((t) => (
          <li key={t.id} className="flex min-h-[60px] items-center gap-3.5 px-4 py-2.5">
            <DayCell date={t.date} year={t.date.slice(0, 4) !== String(new Date().getFullYear())} />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold">{TX_LABEL[t.type]}</p>
              <p className="num mt-0.5 flex items-center gap-1.5 text-[14px] text-mut">
                <BankDot color={accounts.get(t.account)?.color ?? "#888"} size={7} />
                {t.type === "buy" || t.type === "sell"
                  ? `${fmtNum(t.quantity ?? 0)} a ${fmtPrice(t.price ?? 0, instrument.currency)}`
                  : t.type === "split"
                    ? `Rapporto ${t.splitRatio}:1`
                    : fmtDate(t.date, { year: "numeric" })}
              </p>
            </div>
            <p className={`num sensitive shrink-0 text-[17px] font-medium ${t.type === "dividend" || t.type === "sell" ? "text-up" : ""}`}>
              {t.type === "dividend"
                ? `+${fmtEur(t.amount ?? 0)}`
                : t.type === "split"
                  ? `× ${t.splitRatio}`
                  : `${t.type === "sell" ? "+" : "−"}${fmtEur(((t.quantity ?? 0) * (t.price ?? 0)) / (t.fxRate ?? 1))}`}
            </p>
          </li>
        ))}
      </ul>
      {txs.length > 5 && (
        <div className="flex justify-end px-4">
          <button onClick={() => setAllTx(!allTx)} className="min-h-[44px] text-[15px] font-semibold text-accent">
            {allTx ? "Mostra meno" : `Mostra tutte (${txs.length})`}
          </button>
        </div>
      )}
    </div>
  );
}

/** Quotazione e storico di un titolo che non è in portafoglio (cercato con la lente). */
function useWatchedData(instrument: Instrument | undefined) {
  const [state, setState] = useState<{ quotes: Record<string, { price: number; previousClose: number; time: number; source?: string; currency: string }>; series: Record<string, [string, number][]>; ready: boolean }>({
    quotes: {},
    series: {},
    ready: false,
  });
  const key = instrument ? (instrument.currency === "EUR" && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(instrument.isin) ? `${instrument.ticker}~${instrument.isin}` : instrument.ticker) : null;
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const from = new Date(Date.now() - 10 * 366 * 86400_000).toISOString().slice(0, 10);
    fetch(`/api/quotes?t=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then((j) => !stop && setState((s) => ({ ...s, quotes: j.quotes ?? {} })))
      .catch(() => {});
    fetch(`/api/history?from=${from}&t=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then((j) => !stop && setState((s) => ({ ...s, series: j.series ?? {}, ready: true })))
      .catch(() => !stop && setState((s) => ({ ...s, ready: true })));
    return () => {
      stop = true;
    };
  }, [key]);
  return state;
}

/** Serie per il confronto: il portafoglio (rendimento nel tempo) o un indice/titolo. */
function useCompareSeries(cmp: string, own: Record<string, [string, number][]>, history: HistoryPoint[] | null): [string, number][] | null {
  const [fetched, setFetched] = useState<Record<string, [string, number][]>>({});
  const portfolio = useMemo(() => {
    if (cmp !== "portfolio" || !history?.length) return null;
    return twrSeries(history.map((h) => ({ ...h, value: h.value - (h.cash ?? 0) }))).map((p) => [p.date, 1 + p.value] as [string, number]);
  }, [cmp, history]);
  useEffect(() => {
    if (cmp === "none" || cmp === "portfolio" || own[cmp] || fetched[cmp]) return;
    let stop = false;
    const from = new Date(Date.now() - 10 * 366 * 86400_000).toISOString().slice(0, 10);
    fetch(`/api/history?from=${from}&t=${encodeURIComponent(cmp)}`)
      .then((r) => r.json())
      .then((j: { series: Record<string, [string, number][]> }) => !stop && j.series?.[cmp] && setFetched((f) => ({ ...f, [cmp]: j.series[cmp] })))
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [cmp, own, fetched]);
  if (cmp === "none") return null;
  if (cmp === "portfolio") return portfolio;
  return own[cmp] ?? fetched[cmp] ?? null;
}

/** Stellina per aggiungere o togliere il titolo dagli osservati. */
function WatchStar({ instrument, type }: { instrument: Instrument; type?: string }) {
  const data = usePortfolioData();
  const on = (data.watchlist ?? []).some((w) => w.ticker === instrument.ticker);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Togli dagli osservati" : "Aggiungi agli osservati"}
      onClick={() =>
        toggleWatch({
          ticker: instrument.ticker,
          isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(instrument.isin) ? instrument.isin : undefined,
          name: instrument.shortName ?? instrument.name,
          currency: instrument.currency,
          type,
          addedAt: new Date().toISOString(),
        })
      }
      className="press flex h-9 w-9 items-center justify-center rounded-full bg-chip"
    >
      <Star size={18} strokeWidth={2.2} className={on ? "fill-warn text-warn" : "text-ink"} />
    </button>
  );
}

function Simulator({
  state,
  instrument,
  rows,
  accounts,
  price,
  fx,
}: {
  state: PortfolioState;
  instrument: Instrument;
  rows: PositionView[];
  accounts: Map<string, Account>;
  price: number | undefined;
  fx: FxRates;
}) {
  const [account, setAccount] = useState(rows[0].position.account);
  const row = rows.find((r) => r.position.account === account) ?? rows[0];
  const [qty, setQty] = useState(row.position.quantity);
  const rate = instrument.currency === "EUR" ? 1 : fx[instrument.currency] ?? 1;
  const priceNow = price ?? row.position.avgCost * rate;
  const sim = useMemo(() => {
    try {
      return simulateSale(state, instrument, account, Math.min(qty, row.position.quantity), priceNow, { fxRate: rate });
    } catch {
      return null;
    }
  }, [state, instrument, account, qty, row, priceNow, rate]);

  return (
    <>
      <SectionHeader>Simula una vendita</SectionHeader>
      <Panel>
        <div className="px-4 pb-3 pt-4">
          {rows.length > 1 && (
            <div className="mb-4">
              <Segmented
                size="sm"
                value={account}
                onChange={(a) => {
                  setAccount(a);
                  setQty(rows.find((r) => r.position.account === a)!.position.quantity);
                }}
                options={rows.map((r) => ({ value: r.position.account, label: accounts.get(r.position.account)?.name ?? r.position.account }))}
              />
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <p className="text-[15px] text-ink-2">Quote da vendere</p>
            <p className="num text-[15px] font-semibold">
              {fmtNum(qty)} <span className="font-normal text-mut">di {fmtNum(row.position.quantity)}</span>
            </p>
          </div>
          <input
            type="range"
            aria-label="Quote da vendere"
            min={0}
            max={row.position.quantity}
            step={row.position.quantity >= 10 ? 1 : 0.01}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="mt-3 w-full"
          />
          <div className="mt-3 flex gap-2 text-[13px] font-semibold">
            {[0.25, 0.5, 1].map((f) => (
              <button
                key={f}
                onClick={() => setQty(f === 1 ? row.position.quantity : Math.round(row.position.quantity * f))}
                className="h-9 rounded-full bg-chip px-3.5 active:opacity-60"
              >
                {f === 1 ? "Tutte" : `${f * 100}%`}
              </button>
            ))}
          </div>
        </div>
        {sim && qty > 0 ? (
          <div className="border-t border-sep">
            <InfoRow label="Controvalore" value={fmtEur(sim.gross)} />
            <InfoRow
              label="Plus/minus sul prezzo medio"
              value={fmtSignedEur(sim.gain)}
              valueClass={sim.gain >= 0 ? "text-up" : "text-dn"}
              hint={sim.kind === "redditi_capitale" ? "reddito di capitale: non compensa lo zainetto" : "reddito diverso"}
            />
            {sim.lossesUsed > 0 && <InfoRow label="Minus dello zainetto usate" value={fmtEur(sim.lossesUsed)} valueClass="text-up" />}
            {sim.lossCreated > 0 && <InfoRow label="Minus che entra nello zainetto" value={fmtEur(sim.lossCreated)} valueClass="text-warn" />}
            <InfoRow label="Imposta stimata" value={fmtEur(sim.tax)} />
            <div className="flex items-center justify-between bg-panel-2 px-4 py-3.5">
              <div>
                <p className="text-[16px] font-semibold">Incasso netto</p>
                <p className="text-[13px] text-mut">Al prezzo attuale, senza commissioni</p>
              </div>
              <p className="num text-[24px] font-semibold tracking-[-0.03em]">{fmtEur(sim.net)}</p>
            </div>
          </div>
        ) : (
          <p className="border-t border-sep px-4 py-4 text-[14px] text-mut">Sposta il cursore per simulare la vendita.</p>
        )}
      </Panel>
    </>
  );
}

/** Prezzo grande con decimali in apice. */
function PriceBig({ value, currency }: { value: number | undefined; currency: string }) {
  if (value === undefined) return <p className="hero-number mt-1.5">—</p>;
  const s = fmtPrice(value, currency);
  const i = s.lastIndexOf(",");
  return (
    <p className="hero-number mt-1.5" aria-label={s}>
      {i > 0 ? s.slice(0, i) : s}
      {i > 0 && <span className="dec">{s.slice(i)}</span>}
    </p>
  );
}
