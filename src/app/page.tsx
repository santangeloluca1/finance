"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronRight, Coins, Eye, EyeOff, FileUp, Landmark, Calculator, SlidersHorizontal, Settings } from "lucide-react";
import { usePortfolioView, type Filter } from "@/components/PortfolioProvider";
import { InteractiveChart, type ChartEvent, type Selection, type SeriesPoint } from "@/components/InteractiveChart";
import { BigAmount } from "@/components/BigAmount";
import { buildRows, PERIOD_OPTIONS, PositionList } from "@/components/PositionList";
import { Analisi } from "@/components/home/Analisi";
import { Prestazioni } from "@/components/home/Prestazioni";
import { Salute } from "@/components/home/Salute";
import { Dividendi } from "@/components/home/Dividendi";
import { BankDot, Chip, ChipRow, Panel, SectionHeader, Segmented, SelectButton } from "@/components/ui";
import { ASSET_CLASS_LABEL, cutoffDate, type Period } from "@/lib/analytics";
import type { AssetClass } from "@/lib/engine/types";
import { usableLosses } from "@/lib/engine/portfolio";
import { fmtDate, fmtEur, fmtEur0, fmtNum, fmtSignedEur, fmtSignedPct, fmtTime } from "@/lib/format";
import { usePrivacy } from "@/lib/privacy";
import { computeAlerts } from "@/lib/alerts";
import { twrSeries } from "@/lib/performance";

type Tab = "panoramica" | "analisi" | "dividendi";
const TABS: { id: Tab; label: string }[] = [
  { id: "panoramica", label: "Panoramica" },
  { id: "analisi", label: "Analisi" },
  { id: "dividendi", label: "Cedole" },
];

type Range = "1S" | "1M" | "3M" | "YTD" | "1A" | "MAX";
const RANGE_DAYS: Record<Exclude<Range, "YTD" | "MAX">, number> = { "1S": 7, "1M": 31, "3M": 92, "1A": 366 };
const RANGE_LABEL: Record<Range, string> = { "1S": "nell'ultima settimana", "1M": "nell'ultimo mese", "3M": "negli ultimi 3 mesi", YTD: "da inizio anno", "1A": "nell'ultimo anno", MAX: "dall'inizio" };
type Mode = "percentuale" | "valore";

export default function Home() {
  const [tab, setTab] = useState<Tab>("panoramica");
  const [filter, setFilter] = useState<Filter>({ account: "all", asset: "all" });
  const view = usePortfolioView(filter);
  const [privacy, togglePrivacy] = usePrivacy();

  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.slice(1) as Tab;
      setTab(TABS.some((t) => t.id === h) ? h : "panoramica");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "panoramica" ? "/" : `/#${t}`);
    window.scrollTo({ top: 0 });
  };

  return (
    <div>
      {/* Schede testuali in alto (getquin) + privacy e impostazioni */}
      <div className="flex items-center justify-between gap-1 pl-4 pr-1.5">
        <div role="tablist" className="no-scrollbar flex min-w-0 gap-3 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => go(t.id)}
              className={`font-display shrink-0 py-1 text-[20px] font-semibold tracking-[-0.03em] transition-colors ${tab === t.id ? "text-ink" : "text-faint"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0">
          <button onClick={togglePrivacy} aria-label={privacy ? "Mostra importi" : "Nascondi importi"} aria-pressed={privacy} className="rounded-full p-1.5 text-mut active:opacity-50">
            {privacy ? <EyeOff size={20} strokeWidth={1.8} /> : <Eye size={20} strokeWidth={1.8} />}
          </button>
          <AlertsBell view={view} />
          <Link href="/impostazioni" aria-label="Impostazioni" className="rounded-full p-1.5 text-mut active:opacity-50">
            <Settings size={20} strokeWidth={1.8} />
          </Link>
        </div>
      </div>

      {/* Filtri banca e asset class: valgono per tutte le schede */}
      <Filters filter={filter} setFilter={setFilter} view={view} />

      {view.totals && view.state ? (
        tab === "panoramica" ? (
          <Panoramica view={view} filter={filter} goto={go} />
        ) : tab === "analisi" ? (
          <AnalisiTab view={view} filter={filter} />
        ) : (
          <Dividendi data={view.data} state={view.state} totals={view.totals} views={view.views} />
        )
      ) : null}
    </div>
  );
}

type View = ReturnType<typeof usePortfolioView>;

function AlertsBell({ view }: { view: View }) {
  const count = useMemo(
    () => (view.state && view.totals ? computeAlerts(view.data, view.state, view.views, view.totals.value).filter((a) => a.level !== "info").length : 0),
    [view.data, view.state, view.views, view.totals],
  );
  return (
    <Link href="/avvisi" aria-label={count ? `Avvisi, ${count} nuovi` : "Avvisi"} className="relative rounded-full p-1.5 text-mut active:opacity-50">
      <Bell size={20} strokeWidth={1.8} />
      {count > 0 && (
        <span className="num absolute right-0.5 top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-bg bg-dn px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}

function AnalisiTab({ view, filter }: { view: View; filter: Filter }) {
  const [sub, setSub] = useState<"prestazioni" | "allocazione" | "salute">("prestazioni");
  const txs = useMemo(() => {
    const assetOf = new Map(view.data.instruments.map((i) => [i.isin, i.assetClass]));
    return view.data.transactions.filter(
      (t) =>
        (filter.account === "all" || t.account === filter.account) &&
        (filter.asset === "all" || (filter.asset === "liquidita" ? t.type === "cash" : assetOf.get(t.isin) === filter.asset)),
    );
  }, [view.data, filter]);
  if (!view.totals || !view.state) return null;
  return (
    <div>
      <div className="flex gap-2 px-4 pt-4">
        {(["prestazioni", "allocazione", "salute"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            aria-pressed={sub === k}
            className={`rounded-full px-4 py-2 text-[14px] font-semibold ${sub === k ? "bg-accent text-accent-ink" : "bg-chip text-ink-2"}`}
          >
            {k === "prestazioni" ? "Prestazioni" : k === "allocazione" ? "Allocazione" : "Salute"}
          </button>
        ))}
      </div>
      {sub === "prestazioni" ? (
        <Prestazioni
          history={view.history}
          state={view.state}
          totals={view.totals}
          transactions={txs}
          views={view.views}
          priceSeries={view.priceSeries}
          fx={view.fx}
          accounts={view.data.accounts}
        />
      ) : sub === "allocazione" ? (
        <Analisi views={view.views} totals={view.totals} accounts={view.data.accounts} cash={view.state.cash} />
      ) : (
        <Salute views={view.views} totals={view.totals} state={view.state} accounts={view.data.accounts} />
      )}
    </div>
  );
}

function Filters({ filter, setFilter, view }: { filter: Filter; setFilter: (f: Filter) => void; view: View }) {
  const presentAssets = useMemo(() => {
    const set = new Set(view.data.instruments.map((i) => i.assetClass));
    return (Object.keys(ASSET_CLASS_LABEL) as AssetClass[]).filter((a) => set.has(a));
  }, [view.data.instruments]);
  const hasCash = view.data.transactions.some((t) => t.type === "cash");
  return (
    <div className="mt-3">
      <ChipRow>
        <Chip active={filter.account === "all"} onClick={() => setFilter({ ...filter, account: "all" })}>
          Tutti i conti
        </Chip>
        {view.data.accounts.map((a) => (
          <Chip key={a.id} active={filter.account === a.id} onClick={() => setFilter({ ...filter, account: a.id })}>
            <BankDot color={a.color} />
            {a.name}
          </Chip>
        ))}
        <SelectButton
          variant="chip"
          label="Asset class"
          value={filter.asset}
          onChange={(asset) => setFilter({ ...filter, asset })}
          options={[
            { value: "all" as const, label: "Tutti gli asset" },
            ...presentAssets.map((a) => ({ value: a as Filter["asset"], label: ASSET_CLASS_LABEL[a] })),
            ...(hasCash ? [{ value: "liquidita" as const, label: "Liquidità" }] : []),
          ]}
        />
      </ChipRow>
    </div>
  );
}

function Panoramica({ view, filter, goto }: { view: View; filter: Filter; goto: (t: Tab) => void }) {
  const { data, state, views, totals, history, priceSeries, fx, fetchedAt, loading, historyReady } = view;
  const [range, setRange] = useState<Range>("1A");
  const [mode, setMode] = useState<Mode>("percentuale");
  const [showInvested, setShowInvested] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [period, setPeriod] = useState<Period>("oggi");

  // Serie giornaliera del periodo + punto live di oggi.
  const series = useMemo(() => {
    if (!history?.length || !totals || !state) return [];
    const cutoff = rangeStart(range);
    const today = new Date().toISOString().slice(0, 10);
    const slice = history.filter((h) => h.date >= cutoff && h.date < today);
    const realized = state.realized.reduce((a, r) => a + r.gain, 0);
    return [...slice, { date: today, value: totals.value, invested: totals.cost + totals.cash, gain: totals.unrealized + realized + totals.income }];
  }, [history, totals, range, state]);

  // Rendimento ponderato nel tempo dall'inizio del periodo: i versamenti non lo gonfiano.
  const twr = useMemo(() => twrSeries(series).map((p) => p.value), [series]);
  const points = useMemo<SeriesPoint[]>(
    () => series.map((h, i) => (mode === "valore" ? { date: h.date, value: h.value, invested: h.invested } : { date: h.date, value: twr[i] })),
    [series, mode, twr],
  );

  // Operazioni da mostrare sulla linea del tempo.
  const events = useMemo<ChartEvent[]>(() => {
    const ins = new Map(data.instruments.map((i) => [i.isin, i]));
    return data.transactions
      .filter((t) => (filter.account === "all" || t.account === filter.account) && (filter.asset === "all" || ins.get(t.isin)?.assetClass === filter.asset))
      .filter((t) => t.type !== "split")
      .map((t) => {
        const name = ins.get(t.isin)?.shortName ?? t.isin;
        const label = t.type === "dividend" ? `${name} +${fmtEur(t.amount ?? 0)}` : `${name} · ${fmtNum(t.quantity ?? 0)} quote`;
        return { date: t.date, kind: t.type as ChartEvent["kind"], label };
      });
  }, [data, filter]);

  const rows = useMemo(() => buildRows(views, period, priceSeries, fx, filter.account === "all"), [views, period, priceSeries, fx, filter.account]);

  if (!totals || !state) return null;

  // Guadagno tra due indici della serie: esclude acquisti e vendite.
  const gainBetween = (i: number, j: number) => series[j].gain - series[i].gain;
  // Rendimento tra due date, ponderato nel tempo.
  const pctBetween = (i: number, j: number) => (1 + twr[j]) / (1 + twr[i]) - 1;

  const last = series.length - 1;
  const from = sel?.b != null ? sel.a : 0;
  const to = sel ? (sel.b ?? sel.a) : last;
  const ready = series.length > 1;
  const gain = ready ? gainBetween(from, to) : 0;
  const gainPct = ready ? pctBetween(from, to) : 0;
  const shownValue = ready && sel ? series[to].value : totals.value;
  const caption = !sel
    ? "Valore del portafoglio"
    : sel.b != null
      ? `Dal ${fmtDate(series[from].date, { day: "numeric", month: "short", year: "numeric" })} al ${fmtDate(series[to].date, { day: "numeric", month: "short", year: "numeric" })}`
      : fmtDate(series[to].date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const totalReturn = totals.unrealized + state.realized.reduce((a, r) => a + r.gain, 0) + totals.income;
  const today = new Date().toISOString().slice(0, 10);
  const backpack = data.accounts
    .filter((a) => filter.account === "all" || a.id === filter.account)
    .flatMap((a) => usableLosses(state.losses, a.id, today))
    .reduce((s, l) => s + l.remaining, 0);

  return (
    <div>
      {/* Totale: segue il dito sul grafico */}
      <div className="px-4 pt-6">
        <p className="h-5 truncate text-[14px] font-medium capitalize-first text-mut">{caption}</p>
        <BigAmount value={shownValue} className="mt-1" />
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
          <span className={`num inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${pill(gain)}`}>
            <span className="sensitive">
              {gain >= 0 ? "▲" : "▼"} {fmtEur(Math.abs(gain))}
            </span>
            <span className="opacity-80">{fmtSignedPct(gainPct)}</span>
          </span>
          <span className="text-mut">{sel ? (sel.b != null ? "nell'intervallo" : `da inizio periodo`) : RANGE_LABEL[range]}</span>
        </div>
        <p className="mt-2 h-5 text-[13px] text-mut">
          {sel ? null : (
            <>
              Oggi{" "}
              <span className={`num sensitive font-semibold ${tint(totals.dayChange)}`}>
                {fmtSignedEur(totals.dayChange)} ({fmtSignedPct(totals.dayChangePct)})
              </span>
              <span className="mx-1.5 text-faint">·</span>
              Investito <span className="num sensitive font-semibold text-ink-2">{fmtEur0(totals.cost)}</span>
              {totals.cash > 0 && (
                <>
                  <span className="mx-1.5 text-faint">·</span>
                  Liquidità <span className="num sensitive font-semibold text-ink-2">{fmtEur0(totals.cash)}</span>
                </>
              )}
            </>
          )}
        </p>
      </div>

      {/* Grafico navigabile */}
      <div className="mt-8 px-4">
        <InteractiveChart
          points={points}
          height={264}
          reference={mode === "percentuale" ? 0 : undefined}
          showInvested={mode === "valore" && showInvested}
          events={events}
          onSelect={setSel}
          loading={!historyReady}
          format={mode === "valore" ? fmtEur : (v) => fmtSignedPct(v)}
          formatAxis={(v) => (mode === "valore" ? compact(v, false) : axisPct(v))}
          describePoint={(i) =>
            mode === "valore"
              ? `${fmtEur(points[i].value)} · ${fmtSignedEur(gainBetween(0, i))}`
              : `${fmtSignedPct(pctBetween(0, i))} · ${fmtSignedEur(gainBetween(0, i))}`
          }
          describeRange={(i, j) => `${fmtSignedEur(gainBetween(i, j))} · ${fmtSignedPct(pctBetween(i, j))}`}
          trend={gainBetween}
        />
      </div>

      <div className="mt-6 grid grid-cols-6 px-3">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={`num rounded-full py-1.5 text-[13px] font-semibold transition-colors ${range === r ? "bg-ink text-bg" : "text-mut active:bg-chip"}`}
          >
            {r === "YTD" ? "Da gen" : r}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 px-4">
        <div className="w-[190px]">
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "percentuale", label: "Rendimento %" },
              { value: "valore", label: "Valore €" },
            ]}
          />
        </div>
        {mode === "valore" && (
          <button
            onClick={() => setShowInvested(!showInvested)}
            aria-pressed={showInvested}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${showInvested ? "bg-ink text-bg" : "bg-chip text-ink-2"}`}
          >
            <span className="inline-block w-3.5 border-t-[1.5px] border-dashed border-current" />
            Investito
          </button>
        )}
      </div>
      <p className="mt-3 px-4 text-[12px] text-faint">Scorri sul grafico · due dita per confrontare due date</p>

      {/* Azioni rapide */}
      <div className="mt-8 grid grid-cols-4 px-2">
        <QuickAction href="/movimenti" label="Importa" icon={<FileUp size={20} />} />
        <QuickAction href="/posizioni" label="Simula vendita" icon={<Calculator size={20} />} />
        <QuickAction href="/fisco" label="Zainetto" icon={<Landmark size={20} />} badge={backpack > 0} />
        <QuickAction onClick={() => goto("dividendi")} label="Cedole" icon={<Coins size={20} />} />
      </div>

      <SectionHeader right={<SelectButton label="Periodo della variazione" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />}>Titoli</SectionHeader>
      <Panel>
        {rows.length || totals.cash > 0 ? (
          <>
            <PositionList rows={rows.slice(0, 6)} accounts={data.accounts} showBanks={filter.account === "all"} cash={state.cash} />
            {rows.length > 6 && (
              <Link href="/posizioni" className="flex items-center justify-between border-t border-sep px-4 py-3 text-[15px] font-semibold text-accent">
                Tutti i {rows.length} titoli <ChevronRight size={18} />
              </Link>
            )}
          </>
        ) : (
          <p className="px-4 py-8 text-center text-[15px] text-mut">Nessun titolo con questi filtri.</p>
        )}
      </Panel>

      {/* Riepilogo: tre numeri chiave in un unico pannello, come la posizione nel dettaglio titolo */}
      <Panel className="mt-4">
        <div className="grid grid-cols-3">
          <SummaryCell
            label="Rendimento"
            value={compactSigned(totalReturn)}
            valueClass={tint(totalReturn)}
            note={`${fmtSignedPct(totals.cost ? totalReturn / totals.cost : 0)} totale`}
          />
          <SummaryCell href="/fisco" label="Netto se vendi" value={compactPlain(totals.netLiquidation)} note={`−${compactPlain(totals.taxIfSold)} tasse`} border />
          <SummaryCell
            onClick={() => goto("dividendi")}
            label={`Cedole ${new Date().getFullYear()}`}
            value={compactPlain(state.incomeByYear[String(new Date().getFullYear())] ?? 0)}
            valueClass="text-up"
            note="nette"
            border
          />
        </div>
      </Panel>

      {data.isDemo && (
        <Link href="/movimenti" className="mx-4 mt-4 flex items-center justify-between rounded-[22px] bg-accent px-4 py-3.5 text-accent-ink active:opacity-80">
          <span>
            <span className="block text-[15px] font-semibold">Stai guardando un esempio</span>
            <span className="text-[13px] opacity-85">Prezzi reali, operazioni inventate. Importa le tue.</span>
          </span>
          <ChevronRight size={20} />
        </Link>
      )}

      <p className="px-6 pb-2 pt-6 text-center text-[12px] leading-relaxed text-faint">
        {loading ? "Aggiornamento quotazioni…" : fetchedAt ? `Quotazioni delle ${fmtTime(fetchedAt)}` : "Quotazioni non ancora disponibili"} · aggiornate ogni 5 minuti, borse
        europee con circa 15 minuti di ritardo
      </p>
    </div>
  );
}

/** Primo giorno del periodo selezionato. */
function rangeStart(r: Range) {
  if (r === "YTD") return `${new Date().getFullYear()}-01-01`;
  if (r === "MAX") return "0000-01-01";
  return cutoffDate(RANGE_DAYS[r]);
}

/** Etichette dell'asse in percentuale: +4%, −1,5%. */
function axisPct(v: number) {
  const n = v * 100;
  const s = Math.abs(n).toLocaleString("it-IT", { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 });
  return `${n < -0.0001 ? "−" : n > 0.0001 ? "+" : ""}${s}%`;
}

/** Etichette compatte per l'asse: 58,1k €. */
function compact(v: number, signed: boolean) {
  const abs = Math.abs(v);
  const s = abs >= 1000 ? `${(abs / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k` : abs.toLocaleString("it-IT", { maximumFractionDigits: 0 });
  return `${v < 0 ? "−" : signed && v > 0 ? "+" : ""}${s} €`;
}

function QuickAction({ href, onClick, label, icon, badge }: { href?: string; onClick?: () => void; label: string; icon: React.ReactNode; badge?: boolean }) {
  const inner = (
    <>
      <span className="relative flex h-[54px] w-[54px] items-center justify-center rounded-full bg-chip text-ink">
        {icon}
        {badge && <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-bg bg-warn" />}
      </span>
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
    </>
  );
  const cls = "flex flex-col items-center gap-1.5 active:opacity-60";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function SummaryCell({
  label,
  value,
  note,
  href,
  onClick,
  border,
  valueClass = "",
}: {
  label: string;
  value: string;
  note: string;
  href?: string;
  onClick?: () => void;
  border?: boolean;
  valueClass?: string;
}) {
  const body = (
    <>
      <p className="truncate text-[12px] text-mut">{label}</p>
      <p className={`num sensitive mt-1.5 truncate text-[18px] font-semibold tracking-[-0.03em] ${valueClass}`}>{value}</p>
      <p className="num mt-0.5 truncate text-[11px] text-mut">{note}</p>
    </>
  );
  const cls = `block min-w-0 px-4 py-3.5 text-left ${border ? "border-l border-sep" : ""} ${href || onClick ? "active:bg-panel-2" : ""}`;
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button onClick={onClick} className={cls}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

/** 4.414,79 € → "+4.415 €"; oltre 100k → "+101,2k €". */
function compactSigned(v: number) {
  return (v > 0 ? "+" : v < 0 ? "−" : "") + compactPlain(Math.abs(v));
}

function compactPlain(v: number) {
  const abs = Math.abs(v);
  const s = abs >= 100_000 ? `${(abs / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k` : abs.toLocaleString("it-IT", { maximumFractionDigits: 0 });
  return `${v < 0 ? "−" : ""}${s} €`;
}

function tint(n: number) {
  return n > 0.005 ? "text-up" : n < -0.005 ? "text-dn" : "text-mut";
}

function pill(n: number) {
  return n > 0.005 ? "bg-up/12 text-up" : n < -0.005 ? "bg-dn/12 text-dn" : "bg-chip text-mut";
}
