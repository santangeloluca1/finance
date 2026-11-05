"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Coins, Eye, EyeOff, FileUp, Landmark, Calculator, SlidersHorizontal, Settings } from "lucide-react";
import { usePortfolioView, type Filter } from "@/components/PortfolioProvider";
import { AreaChart, type ChartPoint } from "@/components/AreaChart";
import { BigAmount } from "@/components/BigAmount";
import { buildRows, PERIOD_OPTIONS, PositionList } from "@/components/PositionList";
import { Analisi } from "@/components/home/Analisi";
import { Dividendi } from "@/components/home/Dividendi";
import { BankDot, Chip, ChipRow, Panel, SectionHeader, SelectButton } from "@/components/ui";
import { ASSET_CLASS_LABEL, cutoffDate, type Period } from "@/lib/analytics";
import type { AssetClass } from "@/lib/engine/types";
import { usableLosses } from "@/lib/engine/portfolio";
import { fmtDate, fmtEur, fmtEur0, fmtSignedEur, fmtSignedPct, fmtTime } from "@/lib/format";
import { usePrivacy } from "@/lib/privacy";

type Tab = "panoramica" | "analisi" | "dividendi";
const TABS: { id: Tab; label: string }[] = [
  { id: "panoramica", label: "Panoramica" },
  { id: "analisi", label: "Analisi" },
  { id: "dividendi", label: "Dividendi" },
];

type Range = "1S" | "1M" | "3M" | "6M" | "1A" | "MAX";
const RANGE_DAYS: Record<Range, number> = { "1S": 7, "1M": 31, "3M": 92, "6M": 183, "1A": 366, MAX: 99999 };
const RANGE_LABEL: Record<Range, string> = { "1S": "1 settimana", "1M": "1 mese", "3M": "3 mesi", "6M": "6 mesi", "1A": "1 anno", MAX: "dall'inizio" };
type Mode = "valore" | "rendimento";

export default function Home() {
  const [tab, setTab] = useState<Tab>("panoramica");
  const [filter, setFilter] = useState<Filter>({ account: "all", asset: "all" });
  const view = usePortfolioView(filter);
  const [privacy, togglePrivacy] = usePrivacy();

  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (TABS.some((t) => t.id === h)) setTab(h);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "panoramica" ? "/" : `/#${t}`);
    window.scrollTo({ top: 0 });
  };

  return (
    <div>
      {/* Schede testuali in alto (getquin) + privacy e impostazioni */}
      <div className="flex items-center justify-between pl-4 pr-2">
        <div role="tablist" className="no-scrollbar flex min-w-0 gap-3.5 overflow-x-auto">
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
          <button onClick={togglePrivacy} aria-label={privacy ? "Mostra importi" : "Nascondi importi"} aria-pressed={privacy} className="rounded-full p-2 text-mut active:opacity-50">
            {privacy ? <EyeOff size={21} strokeWidth={1.8} /> : <Eye size={21} strokeWidth={1.8} />}
          </button>
          <Link href="/impostazioni" aria-label="Impostazioni" className="rounded-full p-2 text-mut active:opacity-50">
            <Settings size={21} strokeWidth={1.8} />
          </Link>
        </div>
      </div>

      {/* Filtri banca e asset class: valgono per tutte le schede */}
      <Filters filter={filter} setFilter={setFilter} view={view} />

      {view.totals && view.state ? (
        tab === "panoramica" ? (
          <Panoramica view={view} filter={filter} goto={go} />
        ) : tab === "analisi" ? (
          <Analisi views={view.views} totals={view.totals} accounts={view.data.accounts} />
        ) : (
          <Dividendi data={view.data} state={view.state} totals={view.totals} />
        )
      ) : null}
    </div>
  );
}

type View = ReturnType<typeof usePortfolioView>;

function Filters({ filter, setFilter, view }: { filter: Filter; setFilter: (f: Filter) => void; view: View }) {
  const presentAssets = useMemo(() => {
    const set = new Set(view.data.instruments.map((i) => i.assetClass));
    return (Object.keys(ASSET_CLASS_LABEL) as AssetClass[]).filter((a) => set.has(a));
  }, [view.data.instruments]);
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
          options={[{ value: "all" as const, label: "Tutti gli asset" }, ...presentAssets.map((a) => ({ value: a, label: ASSET_CLASS_LABEL[a] }))]}
        />
      </ChipRow>
    </div>
  );
}

function Panoramica({ view, filter, goto }: { view: View; filter: Filter; goto: (t: Tab) => void }) {
  const { data, state, views, totals, history, priceSeries, fx, fetchedAt, loading, historyReady } = view;
  const [range, setRange] = useState<Range>("1A");
  const [mode, setMode] = useState<Mode>("valore");
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [period, setPeriod] = useState<Period>("oggi");

  const series = useMemo(() => {
    if (!history?.length || !totals || !state) return [];
    const cutoff = cutoffDate(RANGE_DAYS[range]);
    const today = new Date().toISOString().slice(0, 10);
    const slice = history.filter((h) => h.date >= cutoff && h.date < today);
    const realized = state.realized.reduce((a, r) => a + r.gain, 0);
    return [...slice, { date: today, value: totals.value, invested: totals.cost, gain: totals.unrealized + realized + totals.income }];
  }, [history, totals, range, state]);
  const points = useMemo<ChartPoint[]>(() => series.map((h) => ({ date: h.date, value: mode === "valore" ? h.value : h.gain - series[0].gain })), [series, mode]);
  const rows = useMemo(() => buildRows(views, period, priceSeries, fx, filter.account === "all"), [views, period, priceSeries, fx, filter.account]);

  if (!totals || !state) return null;

  // Guadagno nel periodo: esclude l'effetto di acquisti e vendite.
  const first = series[0];
  const end = (scrub && series.find((h) => h.date === scrub.date)) || series[series.length - 1];
  const periodGain = first && end ? end.gain - first.gain : 0;
  const periodPct = first?.value ? periodGain / first.value : 0;
  const heroValue = scrub && end ? end.value : totals.value;
  const totalReturn = totals.unrealized + state.realized.reduce((a, r) => a + r.gain, 0) + totals.income;
  const today = new Date().toISOString().slice(0, 10);
  const backpack = data.accounts
    .filter((a) => filter.account === "all" || a.id === filter.account)
    .flatMap((a) => usableLosses(state.losses, a.id, today))
    .reduce((s, l) => s + l.remaining, 0);

  return (
    <div>
      {/* Cifra principale con decimali in apice (Revolut, Scalable) */}
      <div className="px-4 pt-6">
        <BigAmount value={heroValue} />
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
          <span className={`num inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${pill(periodGain)}`}>
            <span className="sensitive">
              {periodGain >= 0 ? "▲" : "▼"} {fmtEur(Math.abs(periodGain))}
            </span>
            <span className="ml-1.5 opacity-80">{fmtSignedPct(periodPct)}</span>
          </span>
          <span className="text-mut">{scrub ? fmtDate(scrub.date) : RANGE_LABEL[range]}</span>
          {!scrub && (
            <span className="text-mut">
              · oggi <span className={`num sensitive font-semibold ${tint(totals.dayChange)}`}>{fmtSignedEur(totals.dayChange)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Grafico pulito con riferimento tratteggiato (Trade Republic) e minimo/massimo (Scalable) */}
      <div className="mt-7">
        <AreaChart
          points={points}
          height={180}
          onScrub={setScrub}
          reference={mode === "rendimento" ? 0 : undefined}
          loading={!historyReady}
          tooltip={(p) => `${mode === "valore" ? fmtEur0(p.value) : fmtSignedEur(p.value).replace(/,\d+/, "")} · ${fmtDate(p.date, { day: "numeric", month: "short" })}`}
          extremes={(v) => (mode === "valore" ? fmtEur0(v) : fmtSignedEur(v).replace(/,\d+/, ""))}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 px-3">
        <div className="flex">
          {(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`num rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${range === r ? "bg-ink text-bg" : "text-mut"}`}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          onClick={() => setMode(mode === "valore" ? "rendimento" : "valore")}
          className="flex items-center gap-1.5 rounded-full bg-chip px-3 py-1.5 text-[13px] font-semibold text-ink-2"
          aria-label={`Mostra ${mode === "valore" ? "rendimento" : "valore"}`}
        >
          <SlidersHorizontal size={14} />
          {mode === "valore" ? "Valore" : "Rendimento"}
        </button>
      </div>

      {/* Azioni rapide (Revolut) */}
      <div className="mt-8 grid grid-cols-4 px-2">
        <QuickAction href="/movimenti" label="Importa" icon={<FileUp size={20} />} />
        <QuickAction href="/posizioni" label="Simula vendita" icon={<Calculator size={20} />} />
        <QuickAction href="/fisco" label="Zainetto" icon={<Landmark size={20} />} badge={backpack > 0} />
        <QuickAction onClick={() => goto("dividendi")} label="Cedole" icon={<Coins size={20} />} />
      </div>

      {/* Widget a due colonne (Revolut) */}
      <div className="mt-6 grid grid-cols-2 gap-3 px-4">
        <Widget label="Rendimento totale" value={fmtSignedEur(totalReturn)} valueClass={tint(totalReturn)} note={`${fmtSignedPct(totals.cost ? totalReturn / totals.cost : 0)} sull'investito`} />
        <Widget label="Netto se vendi oggi" value={fmtEur0(totals.netLiquidation)} note={`${fmtEur0(totals.taxIfSold)} di tasse stimate`} href="/fisco" />
      </div>

      <SectionHeader right={<SelectButton label="Periodo della variazione" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />}>Titoli</SectionHeader>
      <Panel>
        {rows.length ? (
          <>
            <PositionList rows={rows.slice(0, 6)} accounts={data.accounts} showBanks={filter.account === "all"} />
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

      {data.isDemo && (
        <Link href="/movimenti" className="mx-4 mt-4 flex items-center justify-between rounded-[18px] bg-accent px-4 py-3.5 text-accent-ink active:opacity-80">
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

function Widget({ label, value, note, href, valueClass = "" }: { label: string; value: string; note: string; href?: string; valueClass?: string }) {
  const body = (
    <>
      <p className="text-[13px] font-medium text-mut">{label}</p>
      <p className={`num sensitive mt-3.5 text-[23px] font-semibold tracking-[-0.03em] ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-[12px] text-mut">{note}</p>
    </>
  );
  const cls = "rounded-[22px] bg-panel p-4 shadow-panel";
  return href ? (
    <Link href={href} className={`${cls} active:opacity-70`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function tint(n: number) {
  return n > 0.005 ? "text-up" : n < -0.005 ? "text-dn" : "text-mut";
}

function pill(n: number) {
  return n > 0.005 ? "bg-up/12 text-up" : n < -0.005 ? "bg-dn/12 text-dn" : "bg-chip text-mut";
}
