"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { InteractiveChart } from "@/components/InteractiveChart";
import { buildRows } from "@/components/PositionList";
import { Logo, Panel, SectionHeader, SelectButton, Segmented } from "@/components/ui";
import { cutoffDate, type FxRates, type HistoryPoint, type Period, type PositionView, type Totals } from "@/lib/analytics";
import type { Account, PortfolioState, Transaction } from "@/lib/engine/types";
import { fmtSignedEur, fmtSignedPct } from "@/lib/format";
import { annualize, cashFlows, monthlyReturns, twrSeries, xirr } from "@/lib/performance";

type Range = "1A" | "YTD" | "3A" | "MAX";
const RANGE_LABEL: Record<Range, string> = { "1A": "1 anno", YTD: "Da gennaio", "3A": "3 anni", MAX: "Dall'inizio" };

const BENCHMARKS = [
  { value: "SWDA.MI", label: "MSCI World" },
  { value: "VWCE.DE", label: "FTSE All-World" },
  { value: "CSSPX.MI", label: "S&P 500" },
  { value: "MEUD.PA", label: "Stoxx Europe 600" },
  { value: "AGGH.MI", label: "Obbligazioni globali" },
  { value: "none", label: "Nessun confronto" },
] as const;
type Bench = (typeof BENCHMARKS)[number]["value"];

const MONTHS = ["G", "F", "M", "A", "M", "G", "L", "A", "S", "O", "N", "D"];

export function Prestazioni({
  history,
  state,
  totals,
  transactions,
  views,
  priceSeries,
  fx,
  accounts,
}: {
  history: HistoryPoint[] | null;
  state: PortfolioState;
  totals: Totals;
  transactions: Transaction[];
  views: PositionView[];
  priceSeries: Record<string, [string, number][]>;
  fx: FxRates;
  accounts: Account[];
}) {
  const [range, setRange] = useState<Range>("1A");
  const [bench, setBench] = useState<Bench>("SWDA.MI");
  const [benchSeries, setBenchSeries] = useState<[string, number][] | null>(null);

  // Serie storica + punto di oggi.
  const series = useMemo(() => {
    if (!history?.length) return [];
    const today = new Date().toISOString().slice(0, 10);
    const realized = state.realized.reduce((a, r) => a + r.gain, 0);
    const live = { date: today, value: totals.value, invested: totals.cost + totals.cash, gain: totals.unrealized + realized + totals.income };
    const all = [...history.filter((h) => h.date < today), live];
    const from = range === "MAX" ? "0000" : range === "YTD" ? `${new Date().getFullYear()}-01-01` : cutoffDate(range === "1A" ? 366 : 1096);
    return all.filter((h) => h.date >= from);
  }, [history, state, totals, range]);

  const twr = useMemo(() => twrSeries(series), [series]);
  const twrAll = useMemo(() => {
    if (!history?.length) return [];
    return twrSeries([...history, { date: new Date().toISOString().slice(0, 10), value: totals.value, invested: 0, gain: totals.unrealized + state.realized.reduce((a, r) => a + r.gain, 0) + totals.income }]);
  }, [history, totals, state]);
  const months = useMemo(() => monthlyReturns(twrAll), [twrAll]);

  const start = series[0]?.date;
  useEffect(() => {
    if (bench === "none" || !start) {
      setBenchSeries(null);
      return;
    }
    let stop = false;
    fetch(`/api/history?from=${start}&t=${bench}`)
      .then((r) => r.json())
      .then((j: { series: Record<string, [string, number][]> }) => !stop && setBenchSeries(j.series[bench] ?? null))
      .catch(() => setBenchSeries(null));
    return () => {
      stop = true;
    };
  }, [bench, start]);

  // Indice allineato alle date del portafoglio, rendimento cumulato dal primo giorno.
  const compare = useMemo(() => {
    if (!benchSeries?.length || !twr.length) return undefined;
    let j = 0;
    let last: number | null = null;
    const aligned = twr.map((p) => {
      while (j < benchSeries.length && benchSeries[j][0] <= p.date) last = benchSeries[j++][1];
      return last;
    });
    const base = aligned.find((v) => v !== null);
    return base ? aligned.map((v) => (v === null ? null : v / base - 1)) : undefined;
  }, [benchSeries, twr]);

  const total = twr.at(-1)?.value ?? 0;
  const benchTotal = compare?.at(-1) ?? null;
  const days = start ? (Date.now() - Date.parse(start)) / 86400_000 : 0;
  const annual = annualize(total, days);

  const irr = useMemo(() => {
    const flows = cashFlows(transactions);
    if (!flows.length) return null;
    return xirr([...flows, { date: new Date().toISOString().slice(0, 10), amount: totals.value }]);
  }, [transactions, totals.value]);

  const period: Period = range === "MAX" ? "totale" : "1A";
  const contributions = useMemo(
    () => buildRows(views, range === "YTD" ? "6M" : period, priceSeries, fx, true).sort((a, b) => b.change.abs - a.change.abs),
    [views, range, period, priceSeries, fx],
  );
  const maxAbs = Math.max(1, ...contributions.map((c) => Math.abs(c.change.abs)));

  const years = [...new Set(Object.keys(months).map((m) => m.slice(0, 4)))].sort().reverse();

  if (!history) return <p className="px-4 py-10 text-center text-[14px] text-mut">Calcolo delle prestazioni…</p>;

  return (
    <div>
      <div className="px-4 pt-2">
        <Segmented value={range} onChange={setRange} options={(Object.keys(RANGE_LABEL) as Range[]).map((r) => ({ value: r, label: r === "YTD" ? "Da gen" : r }))} />
      </div>

      {/* Indicatori principali */}
      <div className="mt-5 grid grid-cols-3 gap-2.5 px-4">
        <Kpi label="Rendimento" value={fmtSignedPct(total)} tone={total} note={annual !== null ? `${fmtSignedPct(annual)} l'anno` : "ponderato nel tempo"} />
        <Kpi
          label={BENCHMARKS.find((b) => b.value === bench)?.label ?? "Indice"}
          value={benchTotal !== null ? fmtSignedPct(benchTotal) : "—"}
          tone={benchTotal ?? 0}
          note={benchTotal !== null ? `${total - benchTotal >= 0 ? "batti" : "sotto"} di ${Math.abs((total - benchTotal) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} pt` : "nessun confronto"}
        />
        <Kpi label="Il tuo XIRR" value={irr !== null ? fmtSignedPct(irr) : "—"} tone={irr ?? 0} note="annuo dall'inizio, con i tuoi versamenti" />
      </div>

      {/* Grafico rendimento vs indice */}
      <div className="mt-6 flex items-center justify-between px-4">
        <p className="flex items-center gap-3 text-[12px] text-mut">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-up" /> Basis
          </span>
          {bench !== "none" && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-accent" /> Indice
            </span>
          )}
        </p>
        <SelectButton label="Indice di confronto" value={bench} onChange={setBench} options={BENCHMARKS.map((b) => ({ value: b.value, label: b.label }))} />
      </div>
      <div className="mt-3 px-4">
        <InteractiveChart
          points={twr}
          height={230}
          reference={0}
          compare={compare}
          format={(v) => fmtSignedPct(v)}
          formatAxis={(v) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toLocaleString("it-IT", { maximumFractionDigits: 0 })}%`}
          describePoint={(i) => `${fmtSignedPct(twr[i].value)}${compare?.[i] != null ? ` · indice ${fmtSignedPct(compare[i]!)}` : ""}`}
          describeRange={(a, b) => `${fmtSignedPct((1 + twr[b].value) / (1 + twr[a].value) - 1)}`}
          trend={(a, b) => twr[b].value - twr[a].value}
        />
      </div>
      <p className="px-5 pt-3 text-[12px] leading-snug text-faint">
        Rendimento ponderato nel tempo: non tiene conto di quando e quanto hai versato, quindi è confrontabile con l&apos;indice.
      </p>

      {/* Rendimenti mensili */}
      <SectionHeader>Mese per mese</SectionHeader>
      <Panel className="px-3 py-3">
        <div className="grid grid-cols-[30px_repeat(12,minmax(0,1fr))_40px] gap-[3px] text-center">
          <span />
          {MONTHS.map((m, i) => (
            <span key={i} className="pb-1 text-[10px] font-semibold text-faint">
              {m}
            </span>
          ))}
          <span className="pb-1 text-right text-[10px] font-semibold text-faint">Anno</span>
          {years.map((y) => (
            <YearRow key={y} year={y} months={months} />
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] text-mut">Tocca un mese per il valore preciso.</p>
      </Panel>

      {/* Contributo di ogni titolo */}
      <SectionHeader right={<span className="text-[13px] text-mut">{range === "MAX" ? "dall'acquisto" : range === "YTD" ? "6 mesi" : "1 anno"}</span>}>
        Chi ha contribuito
      </SectionHeader>
      <Panel>
        {contributions.map((c) => (
          <Link key={c.key} href={`/posizioni/${c.instrument.isin}`} className="flex items-center gap-3 border-b border-sep px-4 py-3 last:border-0 active:bg-panel-2">
            <Logo isin={c.instrument.isin} name={c.instrument.shortName ?? c.instrument.name} size={34} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[15px] font-semibold">{c.instrument.shortName ?? c.instrument.name}</p>
                <p className={`num sensitive shrink-0 text-[14px] font-semibold ${c.change.abs >= 0 ? "text-up" : "text-dn"}`}>{fmtSignedEur(c.change.abs)}</p>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-chip">
                <div
                  className={`h-full rounded-full ${c.change.abs >= 0 ? "bg-up" : "bg-dn"}`}
                  style={{ width: `${(Math.abs(c.change.abs) / maxAbs) * 100}%` }}
                />
              </div>
            </div>
          </Link>
        ))}
      </Panel>
    </div>
  );
}

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone: number }) {
  return (
    <div className="rounded-[18px] bg-panel p-3.5 shadow-panel">
      <p className="truncate text-[12px] text-mut">{label}</p>
      <p className={`num mt-2 text-[19px] font-semibold tracking-[-0.03em] ${tone > 0.0001 ? "text-up" : tone < -0.0001 ? "text-dn" : ""}`}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-mut">{note}</p>
    </div>
  );
}

function YearRow({ year, months }: { year: string; months: Record<string, number> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <span className="num self-center text-left text-[11px] font-semibold text-mut">{year}</span>
      {Array.from({ length: 12 }, (_, i) => {
        const key = `${year}-${String(i + 1).padStart(2, "0")}`;
        const v = months[key];
        const strength = v === undefined ? 0 : Math.min(1, Math.abs(v) / 0.04);
        return (
          <button
            key={key}
            onClick={() => setOpen(open === key ? null : key)}
            aria-label={v === undefined ? `${key}: nessun dato` : `${key}: ${fmtSignedPct(v)}`}
            className="num flex h-8 items-center justify-center rounded-[6px] text-[9px] font-semibold"
            style={{
              background:
                v === undefined ? "var(--chip)" : `color-mix(in srgb, ${v >= 0 ? "var(--up)" : "var(--dn)"} ${15 + strength * 65}%, transparent)`,
              color: v === undefined ? "transparent" : strength > 0.55 ? "var(--bg)" : "var(--ink)",
            }}
          >
            {v === undefined ? "" : open === key ? fmtSignedPct(v).replace("%", "") : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1).replace(".", ",")}`}
          </button>
        );
      })}
      {(() => {
        const t = Object.entries(months)
          .filter(([k]) => k.startsWith(year))
          .reduce((a, [, r]) => a * (1 + r), 1) - 1;
        return <span className={`num self-center text-right text-[10px] font-bold ${t >= 0 ? "text-up" : "text-dn"}`}>{`${t >= 0 ? "+" : "−"}${Math.abs(t * 100).toFixed(1).replace(".", ",")}%`}</span>;
      })()}
    </>
  );
}
