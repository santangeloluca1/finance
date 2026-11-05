"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Settings } from "lucide-react";
import { usePortfolioView, type Filter } from "@/components/PortfolioProvider";
import { AreaChart, type ChartPoint } from "@/components/AreaChart";
import { buildRows, PERIOD_OPTIONS, PositionList } from "@/components/PositionList";
import { BankDot, Chip, ChipRow, Panel, SectionHeader, Segmented, SelectButton } from "@/components/ui";
import { ASSET_CLASS_COLOR, ASSET_CLASS_LABEL, cutoffDate, groupBy, type Period } from "@/lib/analytics";
import { usableLosses } from "@/lib/engine/portfolio";
import type { AssetClass } from "@/lib/engine/types";
import { fmtDate, fmtEur, fmtEur0, fmtPct, fmtSignedEur, fmtSignedPct, fmtTime } from "@/lib/format";

type Range = "1S" | "1M" | "3M" | "6M" | "1A" | "MAX";
const RANGE_DAYS: Record<Range, number> = { "1S": 7, "1M": 31, "3M": 92, "6M": 183, "1A": 366, MAX: 99999 };
const RANGE_LABEL: Record<Range, string> = { "1S": "nell'ultima settimana", "1M": "nell'ultimo mese", "3M": "negli ultimi 3 mesi", "6M": "negli ultimi 6 mesi", "1A": "nell'ultimo anno", MAX: "dall'inizio" };
type Mode = "valore" | "rendimento";

export default function Home() {
  const [filter, setFilter] = useState<Filter>({ account: "all", asset: "all" });
  const { data, state, views, totals, history, priceSeries, fx, fetchedAt, loading, historyReady } = usePortfolioView(filter);
  const [range, setRange] = useState<Range>("1A");
  const [mode, setMode] = useState<Mode>("valore");
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [period, setPeriod] = useState<Period>("oggi");

  const presentAssets = useMemo(() => {
    const set = new Set(data.instruments.map((i) => i.assetClass));
    return (Object.keys(ASSET_CLASS_LABEL) as AssetClass[]).filter((a) => set.has(a));
  }, [data.instruments]);

  // Serie del grafico: valore di mercato oppure guadagno totale (senza l'effetto dei versamenti).
  const series = useMemo(() => {
    if (!history?.length || !totals || !state) return [];
    const cutoff = cutoffDate(RANGE_DAYS[range]);
    const today = new Date().toISOString().slice(0, 10);
    const slice = history.filter((h) => h.date >= cutoff && h.date < today);
    const realized = state.realized.reduce((a, r) => a + r.gain, 0);
    return [...slice, { date: today, value: totals.value, invested: totals.cost, gain: totals.unrealized + realized + totals.income }];
  }, [history, totals, range, state]);
  const points = useMemo<ChartPoint[]>(
    () => series.map((h) => ({ date: h.date, value: mode === "valore" ? h.value : h.gain - series[0].gain })),
    [series, mode],
  );

  const rows = useMemo(() => buildRows(views, period, priceSeries, fx, filter.account === "all"), [views, period, priceSeries, fx, filter.account]);

  if (!totals || !state) return null;

  // Variazione del periodo = guadagno nel periodo (esclude acquisti e vendite).
  const first = series[0];
  const end = (scrub && series.find((h) => h.date === scrub.date)) || series[series.length - 1];
  const periodGain = first && end ? end.gain - first.gain : 0;
  const periodPct = first?.value ? periodGain / first.value : 0;

  const heroValue = scrub && mode === "valore" ? scrub.value : totals.value;
  const accounts = data.accounts;
  const allocation = groupBy(views, (v) => ({ key: v.instrument.assetClass, label: ASSET_CLASS_LABEL[v.instrument.assetClass], color: ASSET_CLASS_COLOR[v.instrument.assetClass] }));
  const losses = usableLosses(state.losses, filter.account === "all" ? "" : filter.account, new Date().toISOString().slice(0, 10));
  const allLosses = filter.account === "all" ? accounts.flatMap((a) => usableLosses(state.losses, a.id, new Date().toISOString().slice(0, 10))) : losses;
  const backpack = allLosses.reduce((a, l) => a + l.remaining, 0);
  const nextExpiry = allLosses.map((l) => l.expires).sort()[0];
  const year = new Date().getFullYear().toString();
  const filtered = filter.account !== "all" || filter.asset !== "all";

  return (
    <div>
      {/* Intestazione */}
      <div className="flex items-center justify-between px-4 pt-1">
        <p className="text-[15px] font-semibold text-mut">
          {filtered ? [accounts.find((a) => a.id === filter.account)?.name, filter.asset !== "all" && ASSET_CLASS_LABEL[filter.asset]].filter(Boolean).join(" · ") : "Patrimonio"}
        </p>
        <Link href="/impostazioni" aria-label="Impostazioni" className="-mr-2 rounded-full p-2 text-mut active:opacity-50">
          <Settings size={22} strokeWidth={1.8} />
        </Link>
      </div>

      {/* Numero principale */}
      <div className="px-4">
        <p className="num hero-number">{fmtEur(heroValue)}</p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-[15px]">
          {scrub ? (
            <>
              <span className={`num font-semibold ${tint(periodGain)}`}>
                {fmtSignedEur(periodGain)} ({fmtSignedPct(periodPct)})
              </span>
              <span className="text-mut">al {fmtDate(scrub.date)}</span>
            </>
          ) : (
            <>
              <span className={`num font-semibold ${tint(totals.dayChange)}`}>
                {fmtSignedEur(totals.dayChange)} ({fmtSignedPct(totals.dayChangePct)})
              </span>
              <span className="text-mut">oggi</span>
            </>
          )}
        </p>
        <p className="mt-0.5 text-[13px] text-mut">
          <span className={`num font-semibold ${tint(periodGain)}`}>
            {fmtSignedEur(periodGain)} ({fmtSignedPct(periodPct)})
          </span>{" "}
          {scrub ? `dall'inizio del periodo al ${fmtDate(scrub.date, { day: "numeric", month: "short" })}` : RANGE_LABEL[range]}
        </p>
        {data.isDemo && (
          <Link href="/movimenti" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent">
            Portafoglio di esempio · importa il tuo <ChevronRight size={14} />
          </Link>
        )}
      </div>

      {/* Filtri */}
      <div className="mt-4">
        <ChipRow>
          <Chip active={filter.account === "all"} onClick={() => setFilter({ ...filter, account: "all" })}>
            Tutti i conti
          </Chip>
          {accounts.map((a) => (
            <Chip key={a.id} active={filter.account === a.id} onClick={() => setFilter({ ...filter, account: a.id })}>
              <BankDot color={a.color} />
              {a.name}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {/* Grafico */}
      <div className="mt-3 flex items-center justify-between gap-3 px-4">
        <SelectButton
          label="Asset class"
          value={filter.asset}
          onChange={(asset) => setFilter({ ...filter, asset })}
          options={[{ value: "all" as const, label: "Tutti gli asset" }, ...presentAssets.map((a) => ({ value: a, label: ASSET_CLASS_LABEL[a] }))]}
        />
        <div className="w-[176px]">
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "valore", label: "Valore" },
              { value: "rendimento", label: "Rendimento" },
            ]}
          />
        </div>
      </div>
      <div className="mt-2">
        <AreaChart points={points} height={210} onScrub={setScrub} reference={mode === "rendimento" ? 0 : undefined} loading={!historyReady} />
      </div>
      <div className="mt-2 px-4">
        <Segmented value={range} onChange={setRange} options={(Object.keys(RANGE_DAYS) as Range[]).map((r) => ({ value: r, label: r }))} />
      </div>

      {/* Titoli */}
      <SectionHeader
        id="titoli"
        right={<SelectButton label="Periodo della variazione" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />}
      >
        Titoli
      </SectionHeader>
      <Panel>
        {rows.length ? (
          <>
            <PositionList rows={rows.slice(0, 6)} accounts={accounts} showBanks={filter.account === "all"} />
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

      {/* Analisi */}
      <SectionHeader>Analisi</SectionHeader>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1">
        <Panel className="!mx-0 w-[300px] shrink-0 snap-start p-4">
          <p className="text-[15px] font-semibold">Allocazione</p>
          <div className="mt-3 flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full">
            {allocation.map((s) => (
              <span key={s.key} style={{ width: `${(s.value / (totals.value || 1)) * 100}%`, background: s.color }} />
            ))}
          </div>
          <ul className="mt-3 space-y-2">
            {allocation.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-[14px]">
                <BankDot color={s.color} />
                <span className="flex-1 text-ink-2">{s.label}</span>
                <span className="num font-semibold">{fmtPct(s.value / (totals.value || 1))}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Tile title="Netto se vendi oggi" value={fmtEur0(totals.netLiquidation)} note={`${fmtEur0(totals.taxIfSold)} di tasse stimate`} href="/fisco" />
        <Tile title={`Cedole e dividendi ${year}`} value={fmtEur(state.incomeByYear[year] ?? 0)} valueClass="text-up" note={`${fmtEur(totals.income)} in totale, netti`} href="/movimenti" />
        <Tile
          title="Zainetto fiscale"
          value={fmtEur0(backpack)}
          valueClass={backpack > 0 ? "text-warn" : ""}
          note={nextExpiry ? `prima scadenza ${fmtDate(nextExpiry, { month: "short", year: "numeric" })}` : "nessuna minus da recuperare"}
          href="/fisco"
        />
      </div>

      <p className="px-6 pb-2 pt-8 text-center text-[12px] leading-relaxed text-faint">
        {loading ? "Aggiornamento quotazioni…" : fetchedAt ? `Quotazioni aggiornate alle ${fmtTime(fetchedAt)}` : "Quotazioni non ancora disponibili"} · ogni 5 minuti, borse europee con circa 15 minuti di ritardo
      </p>
    </div>
  );
}

function Tile({ title, value, note, href, valueClass = "" }: { title: string; value: string; note: string; href: string; valueClass?: string }) {
  return (
    <Link href={href} className="flex w-[172px] shrink-0 snap-start flex-col justify-between rounded-[18px] bg-panel p-4 shadow-panel active:opacity-70">
      <p className="text-[13px] font-medium leading-snug text-mut">{title}</p>
      <div className="mt-6">
        <p className={`num text-[22px] font-bold tracking-[-0.02em] ${valueClass}`}>{value}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-mut">{note}</p>
      </div>
    </Link>
  );
}

function tint(n: number) {
  return n > 0.005 ? "text-up" : n < -0.005 ? "text-dn" : "text-mut";
}
