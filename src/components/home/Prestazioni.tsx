"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { InteractiveChart } from "@/components/InteractiveChart";
import { buildRows, PERIOD_OPTIONS } from "@/components/PositionList";
import { InfoRow, Logo, Panel, SectionHeader, Segmented, SelectButton } from "@/components/ui";
import { BigAmount } from "@/components/BigAmount";
import { cutoffDate, type FxRates, type HistoryPoint, type Period, type PositionView, type Totals } from "@/lib/analytics";
import type { Account, PortfolioState, Transaction } from "@/lib/engine/types";
import { fmtSignedEur, fmtSignedPct } from "@/lib/format";
import { annualize, cashFlows, monthlyReturns, twrSeries, xirr } from "@/lib/performance";
import { alignIntraday } from "@/lib/intraday";
import { useIntradaySeries, usePortfolioIntraday } from "@/lib/intraday-client";

type Range = "1G" | "1A" | "YTD" | "3A" | "MAX";
const RANGE_LABEL: Record<Range, string> = { "1G": "Oggi", "1A": "1 anno", YTD: "Da gennaio", "3A": "3 anni", MAX: "Dall'inizio" };

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
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [contribPeriod, setContribPeriod] = useState<Period>("1A");
  const [contribUnit, setContribUnit] = useState<"eur" | "pct">("eur");
  const [bench, setBench] = useState<Bench>("SWDA.MI");
  const [benchSeries, setBenchSeries] = useState<[string, number][] | null>(null);

  const day = range === "1G";
  const intraday = usePortfolioIntraday(views, fx, day);
  const benchDay = useIntradaySeries(bench === "none" ? [] : [bench], day && bench !== "none");

  // Serie storica + punto di oggi; per "1G" i prezzi della giornata.
  const series = useMemo(() => {
    if (day) return intraday ? intraday.dates.map((date, i) => ({ date, value: intraday.values[i], invested: 0, gain: intraday.values[i] - intraday.base })) : [];
    if (!history?.length) return [];
    const today = new Date().toISOString().slice(0, 10);
    const realized = state.realized.reduce((a, r) => a + r.gain, 0);
    // Solo investimenti: la liquidità resta nel patrimonio della Home.
    const live = { date: today, value: totals.value - totals.cash, invested: totals.cost, gain: totals.unrealized + realized + totals.income };
    const all = [...history.filter((h) => h.date < today).map((h) => ({ ...h, value: h.value - (h.cash ?? 0), invested: h.invested - (h.cash ?? 0) })), live];
    const from = range === "MAX" ? "0000" : range === "YTD" ? `${new Date().getFullYear()}-01-01` : cutoffDate(range === "1A" ? 366 : 1096);
    return all.filter((h) => h.date >= from);
  }, [history, state, totals, range, day, intraday]);

  const twr = useMemo(
    () => (day ? series.map((h) => ({ date: h.date, value: intraday?.base ? h.value / intraday.base - 1 : 0 })) : twrSeries(series)),
    [series, day, intraday],
  );
  const twrAll = useMemo(() => {
    if (!history?.length) return [];
    return twrSeries([
      ...history.map((h) => ({ ...h, value: h.value - (h.cash ?? 0) })),
      { date: new Date().toISOString().slice(0, 10), value: totals.value - totals.cash, invested: 0, gain: totals.unrealized + state.realized.reduce((a, r) => a + r.gain, 0) + totals.income },
    ]);
  }, [history, totals, state]);
  const months = useMemo(() => monthlyReturns(twrAll), [twrAll]);

  const start = day ? undefined : series[0]?.date;
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
    if (day) return bench === "none" ? undefined : alignIntraday(twr.map((p) => p.date), benchDay?.[bench]);
    if (!benchSeries?.length || !twr.length) return undefined;
    let j = 0;
    let last: number | null = null;
    const aligned = twr.map((p) => {
      while (j < benchSeries.length && benchSeries[j][0] <= p.date) last = benchSeries[j++][1];
      return last;
    });
    const base = aligned.find((v) => v !== null);
    return base ? aligned.map((v) => (v === null ? null : v / base - 1)) : undefined;
  }, [benchSeries, twr, day, bench, benchDay]);

  const total = day && !twr.length ? totals.dayChangePct : (twr.at(-1)?.value ?? 0);
  const gain = day ? (series.at(-1)?.gain ?? totals.dayChange) : series.length ? series[series.length - 1].gain - series[0].gain : 0;
  const benchTotal = compare?.at(-1) ?? null;
  const days = start ? (Date.now() - Date.parse(start)) / 86400_000 : 0;
  const annual = day ? null : annualize(total, days);

  const irr = useMemo(() => {
    const flows = cashFlows(transactions);
    if (!flows.length) return null;
    return xirr([...flows, { date: new Date().toISOString().slice(0, 10), amount: totals.value - totals.cash }]);
  }, [transactions, totals.value, totals.cash]);

  const contributions = useMemo(
    () => buildRows(views, contribPeriod, priceSeries, fx, true, "valore", transactions).sort((a, b) => (contribUnit === "eur" ? b.change.abs - a.change.abs : b.change.pct - a.change.pct)),
    [views, contribPeriod, contribUnit, priceSeries, fx, transactions],
  );
  const measure = (c: (typeof contributions)[number]) => (contribUnit === "eur" ? c.change.abs : c.change.pct);
  const maxAbs = Math.max(contribUnit === "eur" ? 1 : 0.0001, ...contributions.map((c) => Math.abs(measure(c))));

  const years = [...new Set(Object.keys(months).map((m) => m.slice(0, 4)))].sort().reverse();

  if (!history) return <p className="px-4 py-10 text-center text-[14px] text-mut">Calcolo delle prestazioni…</p>;

  return (
    <div>
      {/* Patrimonio e rendimento del periodo, come in Panoramica */}
      <div className="flex items-end justify-between gap-3 px-4 pt-6">
        <div className="min-w-0">
          <p className="text-[14px] text-mut">Valore degli investimenti</p>
          <BigAmount value={day && series.length ? series[series.length - 1].value : totals.value - totals.cash} className="mt-1" />
        </div>
        <div className={`num sensitive shrink-0 pb-1 text-right ${tone(total)}`}>
          <p className="text-[17px] font-semibold">{fmtSignedPct(total)}</p>
          <p className="text-[15px] font-medium">{fmtSignedEur(gain)}</p>
        </div>
      </div>
      <p className="num mt-2 px-4 text-[14px] text-mut">
        {day ? (intraday && !intraday.today && twr.length ? "Ultima seduta, sulla chiusura precedente" : "Variazione sulla chiusura di ieri") : "Rendimento ponderato nel tempo"}{annual !== null ? ` · ${fmtSignedPct(annual)} all'anno` : ""}
      </p>
      <div role="group" aria-label="Periodo" className="mt-4 grid grid-cols-5 gap-1 px-3">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={`num h-9 rounded-full text-[14px] font-semibold ${range === r ? "bg-chip text-ink" : "text-mut active:text-ink"}`}
          >
            {r === "YTD" ? "Da gen" : r}
          </button>
        ))}
      </div>

      {/* Grafico rendimento vs indice */}
      <div className="mt-8 flex items-center justify-between px-4">
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
      <div className="mt-3 pl-4 pr-3">
        <InteractiveChart
          points={twr}
          height={230}
          loading={day && !intraday}
          reference={0}
          compare={compare}
          format={(v) => fmtSignedPct(v)}
          formatAxis={(v) => {
            const n = v * 100;
            return `${n > 0.0001 ? "+" : n < -0.0001 ? "−" : ""}${Math.abs(n).toLocaleString("it-IT", { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 })}%`;
          }}
          describePoint={(i) => `${fmtSignedPct(twr[i].value)}${compare?.[i] != null ? ` · indice ${fmtSignedPct(compare[i]!)}` : ""}`}
          describeRange={(a, b) => `${fmtSignedPct((1 + twr[b].value) / (1 + twr[a].value) - 1)}${day ? ` · ${fmtSignedEur(series[b].value - series[a].value)}` : ""}`}
          trend={(a, b) => twr[b].value - twr[a].value}
        />
      </div>

      <Panel className="mt-6">
        <InfoRow
          label={BENCHMARKS.find((b) => b.value === bench)?.label ?? "Indice"}
          hint={benchTotal !== null ? `${total - benchTotal >= 0 ? "Fai meglio" : "Fai peggio"} di ${Math.abs((total - benchTotal) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} punti` : "Nessun confronto"}
          value={benchTotal !== null ? fmtSignedPct(benchTotal) : "—"}
          valueClass={tone(benchTotal ?? 0)}
        />
        <InfoRow label="Rendimento sui tuoi versamenti" hint="XIRR annuo dall'inizio" value={irr !== null ? fmtSignedPct(irr) : "—"} valueClass={tone(irr ?? 0)} />
      </Panel>

      {/* Rendimenti mensili */}
      <SectionHeader>Mese per mese</SectionHeader>
      <Panel className="px-3 py-3">
        <div className="grid grid-cols-[30px_repeat(12,minmax(0,1fr))_40px] gap-[3px] text-center">
          <span />
          {MONTHS.map((m, i) => (
            <span key={i} className="pb-1 text-[11px] font-semibold text-mut">
              {m}
            </span>
          ))}
          <span className="pb-1 text-right text-[11px] font-semibold text-mut">Anno</span>
          {years.map((y) => (
            <YearRow key={y} year={y} months={months} open={openMonth} setOpen={setOpenMonth} />
          ))}
        </div>
        <p className="num mt-2.5 h-4 px-1 text-[13px] text-mut">
          {openMonth && months[openMonth] !== undefined ? (
            <>
              {MONTH_NAMES[Number(openMonth.slice(5)) - 1]} {openMonth.slice(0, 4)}:{" "}
              <span className={`font-semibold ${tone(months[openMonth])}`}>{fmtSignedPct(months[openMonth])}</span>
            </>
          ) : (
            "Tocca un mese per il valore esatto"
          )}
        </p>
      </Panel>

      {/* Contributo di ogni titolo */}
      <SectionHeader right={<SelectButton label="Periodo del contributo" value={contribPeriod} onChange={setContribPeriod} options={PERIOD_OPTIONS} />}>
        Chi ha contribuito
      </SectionHeader>
      <div className="px-4 pb-2">
        <div className="w-[120px]">
          <Segmented
            size="sm"
            value={contribUnit}
            onChange={setContribUnit}
            options={[
              { value: "eur", label: "€" },
              { value: "pct", label: "%" },
            ]}
          />
        </div>
      </div>
      <ul>
        {contributions.map((c) => (
          <li key={c.key}>
          <Link href={`/posizioni/${c.instrument.isin}`} className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5 active:bg-panel-2">
            <Logo isin={c.instrument.isin} name={c.instrument.shortName ?? c.instrument.name} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[17px] font-semibold">{c.instrument.shortName ?? c.instrument.name}</p>
                <p className={`num sensitive shrink-0 text-[17px] font-medium ${c.change.abs > 0.005 ? "text-up" : c.change.abs < -0.005 ? "text-dn" : "text-mut"}`}>
                  {contribUnit === "eur" ? fmtSignedEur(c.change.abs) : fmtSignedPct(c.change.pct)}
                </p>
              </div>
              <p className="num sensitive text-[14px] text-mut">{contribUnit === "eur" ? fmtSignedPct(c.change.pct) : fmtSignedEur(c.change.abs)}</p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${measure(c) >= 0 ? "bg-up" : "bg-dn"}`}
                  style={{ width: `${(Math.abs(measure(c)) / maxAbs) * 100}%` }}
                />
              </div>
            </div>
          </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function tone(n: number) {
  return n > 0.0001 ? "text-up" : n < -0.0001 ? "text-dn" : "";
}

/** Valore nella cella: il colore dice il segno, il numero la misura. */
function cell(v: number) {
  const n = Math.abs(v * 100);
  return n.toLocaleString("it-IT", { maximumFractionDigits: n >= 10 ? 0 : 1, minimumFractionDigits: n >= 10 ? 0 : 1 });
}

const MONTH_NAMES = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function YearRow({ year, months, open, setOpen }: { year: string; months: Record<string, number>; open: string | null; setOpen: (k: string | null) => void }) {
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
            className={`num flex h-8 items-center justify-center rounded-[6px] text-[11px] font-semibold tracking-[-0.03em] ${open === key ? "ring-2 ring-ink" : ""}`}
            style={{
              background:
                v === undefined ? "var(--chip)" : `color-mix(in srgb, ${v >= 0 ? "var(--up)" : "var(--dn)"} ${15 + strength * 65}%, transparent)`,
              color: v === undefined ? "transparent" : strength > 0.55 ? "var(--bg)" : "var(--ink)",
            }}
          >
            {v === undefined ? "" : cell(v)}
          </button>
        );
      })}
      {(() => {
        const t = Object.entries(months)
          .filter(([k]) => k.startsWith(year))
          .reduce((a, [, r]) => a * (1 + r), 1) - 1;
        return <span className={`num self-center text-right text-[11px] font-bold ${t >= 0 ? "text-up" : "text-dn"}`}>{`${t >= 0 ? "+" : "−"}${Math.abs(t * 100).toFixed(1).replace(".", ",")}%`}</span>;
      })()}
    </>
  );
}
