"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EventLegend, InteractiveChart, type ChartEvent } from "@/components/InteractiveChart";
import { MonthRecap } from "@/components/MonthRecap";
import { Rischio } from "@/components/home/Rischio";
import { useRisk } from "@/lib/risk-client";
import { fromPeak } from "@/lib/risk";
import { contributions, type Contribution } from "@/lib/contributions";
import { InfoRow, Logo, Panel, RangePicker, SectionHeader, Segmented, SelectButton } from "@/components/ui";
import { RANGES, RANGE_LABEL, RANGE_PHRASE, rangeStart, type Range } from "@/lib/range";
import { BENCHMARKS as BASE_BENCHMARKS } from "@/lib/benchmarks";
import { BigAmount } from "@/components/BigAmount";
import type { FxRates, HistoryPoint, PositionView, Totals } from "@/lib/analytics";
import type { Account, Instrument, PortfolioState, Transaction } from "@/lib/engine/types";
import { fmtEur, fmtSignedEur, fmtSignedPct, fmtN } from "@/lib/format";
import { annualize, cashFlows, monthlyReturns, twrSeries, xirr } from "@/lib/performance";
import { alignIntraday } from "@/lib/intraday";
import { useIntradaySeries, usePortfolioIntraday } from "@/lib/intraday-client";


const BENCHMARKS = [...BASE_BENCHMARKS, { value: "none", label: "Nessun confronto" }] as const;
type Bench = (typeof BENCHMARKS)[number]["value"];

const MONTHS = ["G", "F", "M", "A", "M", "G", "L", "A", "S", "O", "N", "D"];

export function Prestazioni({
  history,
  state,
  totals,
  transactions,
  views,
  priceSeries,
  fxSeries,
  fx,
  accounts,
  instruments,
}: {
  history: HistoryPoint[] | null;
  state: PortfolioState;
  totals: Totals;
  transactions: Transaction[];
  views: PositionView[];
  priceSeries: Record<string, [string, number][]>;
  fxSeries: Record<string, [string, number][]>;
  fx: FxRates;
  accounts: Account[];
  instruments: Instrument[];
}) {
  const [range, setRange] = useState<Range>("1A");
  const [contribUnit, setContribUnit] = useState<"eur" | "pct">("pct");
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
    const from = rangeStart(range);
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
  const { risk, loading: riskLoading } = useRisk(views, bench === "none" ? null : bench);
  const nowFromPeak = twrAll.length > 20 ? fromPeak(twrAll.map((p) => ({ value: 1 + p.value }))) : null;

  // Vendite e cedole sulla linea del tempo (gli acquisti ricorrenti la affollerebbero).
  const events = useMemo<ChartEvent[]>(() => {
    const ins = new Map(instruments.map((i) => [i.isin, i]));
    return transactions
      .filter((t) => t.type === "sell" || t.type === "dividend")
      .map((t) => {
        const name = ins.get(t.isin)?.shortName ?? t.isin;
        const label = t.type === "dividend" ? `${name} +${fmtEur(t.amount ?? 0)}` : `${name} · ${fmtN(t.quantity ?? 0)} quote`;
        return { date: t.date, kind: t.type as ChartEvent["kind"], label };
      });
  }, [transactions, instruments]);

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

  // Cosa ha mosso il rendimento, nello stesso periodo del grafico (titoli venduti compresi).
  // In %: quanto ogni titolo ha mosso il portafoglio, così l'ordine coincide con quello in euro.
  const movers = useMemo(
    () => contributions(day ? "oggi" : rangeStart(range), views, transactions, instruments, priceSeries, fxSeries),
    [day, range, views, transactions, instruments, priceSeries, fxSeries],
  );
  const measure = (c: Contribution) => (contribUnit === "eur" ? c.change : c.share);
  const maxAbs = Math.max(contribUnit === "eur" ? 1 : 0.0001, ...movers.map((c) => Math.abs(measure(c))));

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

      {/* Grafico rendimento vs indice */}
      <div className="mt-6 flex items-center justify-between px-4">
        <p className="flex items-center gap-3 text-[12px] text-mut">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-up" /> Il tuo portafoglio
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
          events={day || !history ? [] : events}
          format={(v) => fmtSignedPct(v)}
          formatAxis={(v) => {
            const n = v * 100;
            return `${n > 0.0001 ? "+" : n < -0.0001 ? "−" : ""}${fmtN(Math.abs(n), { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 })}%`;
          }}
          describePoint={(i) => `${fmtSignedPct(twr[i].value)}${compare?.[i] != null ? ` · indice ${fmtSignedPct(compare[i]!)}` : ""}`}
          describeRange={(a, b) => `${fmtSignedPct((1 + twr[b].value) / (1 + twr[a].value) - 1)}${day ? ` · ${fmtSignedEur(series[b].value - series[a].value)}` : ""}`}
          trend={(a, b) => twr[b].value - twr[a].value}
        />
      </div>
      {!day && <EventLegend events={events} from={twr[0]?.date} />}
      <RangePicker value={range} onChange={setRange} options={RANGES} />

      <MonthRecap />

      <Panel className="mt-6">
        <InfoRow
          label={BENCHMARKS.find((b) => b.value === bench)?.label ?? "Indice"}
          hint={
            benchTotal !== null
              ? Math.abs(total - benchTotal) < 0.0005
                ? `${RANGE_PHRASE[range].replace(/^./, (c) => c.toUpperCase())} sei in linea con l'indice`
                : `${RANGE_PHRASE[range].replace(/^./, (c) => c.toUpperCase())} ${total - benchTotal >= 0 ? "fai meglio" : "fai peggio"} di ${fmtN(Math.abs((total - benchTotal) * 100), { maximumFractionDigits: 1 })} punti percentuali`
              : "Nessun confronto"
          }
          value={benchTotal !== null ? fmtSignedPct(benchTotal) : "—"}
          valueClass={tone(benchTotal ?? 0)}
        />
        <InfoRow label="Rendimento annuo dei tuoi soldi" hint="Dal primo versamento, tiene conto di quando hai investito" value={irr !== null ? fmtSignedPct(irr) : "—"} valueClass={tone(irr ?? 0)} />
      </Panel>

      {/* Contributo di ogni titolo */}
      {/* Stesso periodo del grafico: cambiando uno cambia anche l'altro. */}
      <SectionHeader right={<SelectButton label="Periodo" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))} />}>
        Rendimento titoli
      </SectionHeader>
      <div className="flex items-center gap-3 px-4 pb-2">
        <div className="w-[120px] shrink-0">
          <Segmented
            size="sm"
            value={contribUnit}
            onChange={setContribUnit}
            options={[
              { value: "pct", label: "%" },
              { value: "eur", label: "€" },
            ]}
          />
        </div>
        <p className="text-[13px] leading-snug text-mut">{contribUnit === "pct" ? "Quanto ha mosso il portafoglio" : "Guadagno o perdita in euro"}</p>
      </div>
      <ul className="stagger">
        {movers.map((c) => (
          <li key={c.isin}>
          <Link href={`/posizioni/${c.instrument.isin}`} className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5 active:bg-panel-2">
            <Logo isin={c.instrument.isin} name={c.instrument.shortName ?? c.instrument.name} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[17px] font-semibold">{c.instrument.shortName ?? c.instrument.name}</span>
                  {c.sold && <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-[12px] font-semibold text-mut">venduto</span>}
                </p>
                <p className={`num sensitive shrink-0 text-[17px] font-medium ${c.change > 0.005 ? "text-up" : c.change < -0.005 ? "text-dn" : "text-mut"}`}>
                  {contribUnit === "eur" ? fmtSignedEur(c.change) : fmtSignedPct(c.share)}
                </p>
              </div>
              <p className="num sensitive text-[14px] text-mut">
                {contribUnit === "eur" ? `Titolo ${fmtSignedPct(c.pct)}` : `${fmtSignedEur(c.change)} · titolo ${fmtSignedPct(c.pct)}`}
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full">
                <div
                  className={`grow-x h-full rounded-full ${measure(c) >= 0 ? "bg-up" : "bg-dn"}`}
                  style={{ width: `${(Math.abs(measure(c)) / maxAbs) * 100}%` }}
                />
              </div>
            </div>
          </Link>
          </li>
        ))}
      </ul>

      <Rischio risk={risk} loading={riskLoading} benchLabel={bench === "none" ? null : (BENCHMARKS.find((b) => b.value === bench)?.label ?? null)} nowFromPeak={nowFromPeak} />

      {/* Rendimenti mensili */}
      <MonthBars months={months} years={years} />
    </div>
  );
}

function tone(n: number) {
  return n > 0.0001 ? "text-up" : n < -0.0001 ? "text-dn" : "";
}


const MONTH_NAMES = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/**
 * Rendimento mese per mese di un anno alla volta: una barra per mese, verde
 * sopra lo zero e rossa sotto. Toccando una barra compare il valore esatto.
 */
function MonthBars({ months, years }: { months: Record<string, number>; years: string[] }) {
  const [year, setYear] = useState(years[0] ?? String(new Date().getFullYear()));
  const [open, setOpen] = useState<number | null>(null);
  const vals = Array.from({ length: 12 }, (_, i) => months[`${year}-${String(i + 1).padStart(2, "0")}`]);
  const known = vals.filter((v): v is number => v !== undefined);
  const total = known.reduce((a, r) => a * (1 + r), 1) - 1;
  // Scala dell'asse: da sotto il mese peggiore a sopra il migliore, a passi "tondi" (circa 4 righe).
  const rawHi = Math.max(0.001, ...known);
  const rawLo = Math.min(-0.001, ...known);
  const step = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5].find((st) => (rawHi - rawLo) / st <= 4) ?? 1;
  const hi = Math.ceil(rawHi / step - 1e-9) * step;
  const lo = Math.floor(rawLo / step + 1e-9) * step;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, k) => hi - k * step);
  const H = 160;
  const zero = (hi / (hi - lo)) * H;
  const scale = H / (hi - lo);
  const y = (v: number) => (hi - v) * scale;
  const axis = (v: number) => {
    const n = Math.abs(v * 100);
    const d = step < 0.01 ? 1 : 0;
    return Math.abs(v) < 1e-9 ? "0%" : `${v > 0 ? "+" : "−"}${fmtN(n, { maximumFractionDigits: d, minimumFractionDigits: d })}%`;
  };
  const sel = open !== null ? vals[open] : undefined;

  return (
    <>
      <SectionHeader
        right={years.length > 1 ? <SelectButton label="Anno" value={year} onChange={(y) => (setYear(y), setOpen(null))} options={years.map((y) => ({ value: y, label: y }))} /> : undefined}
      >
        Mese per mese
      </SectionHeader>
      <p className="num h-6 px-4 text-[15px] text-mut">
        {open !== null && sel !== undefined ? (
          <>
            {MONTH_NAMES[open].replace(/^./, (c) => c.toUpperCase())} {year} <span className={`font-semibold ${tone(sel)}`}>{fmtSignedPct(sel)}</span>
          </>
        ) : known.length ? (
          <>
            {year === String(new Date().getFullYear()) ? "Da inizio anno" : `Nel ${year}`} <span className={`font-semibold ${tone(total)}`}>{fmtSignedPct(total)}</span>
          </>
        ) : (
          "Nessun dato per quest'anno"
        )}
      </p>
      <div className="relative ml-4 mr-3 mt-3" style={{ height: H }}>
        {/* Asse a destra con poche righe: lo zero tratteggiato, le altre appena accennate */}
        {ticks.map((t) => (
          <div key={t} className="pointer-events-none absolute left-0 right-[44px]" style={{ top: y(t) }} aria-hidden>
            <div className={Math.abs(t) < 1e-9 ? "border-t border-dashed border-faint/60" : "border-t border-sep/70"} />
          </div>
        ))}
        {ticks.map((t) => (
          <span key={`l${t}`} className="num pointer-events-none absolute right-0 w-[40px] -translate-y-1/2 text-right text-[11px] text-mut" style={{ top: y(t) }}>
            {axis(t)}
          </span>
        ))}
        <div className="absolute inset-y-0 left-0 right-[44px] grid grid-cols-12 gap-1.5">
          {vals.map((v, i) => {
            const h = v === undefined ? 0 : Math.max(3, Math.abs(v) * scale);
            const dim = open !== null && open !== i;
            return (
              <button
                key={i}
                disabled={v === undefined}
                onClick={() => setOpen(open === i ? null : i)}
                aria-label={v === undefined ? `${MONTH_NAMES[i]}: nessun dato` : `${MONTH_NAMES[i]}: ${fmtSignedPct(v)}`}
                aria-pressed={open === i}
                className="relative h-full"
              >
                {v !== undefined && (
                  <span
                    className={`grow-y absolute inset-x-0 transition-opacity ${v >= 0 ? "rounded-t-[5px] bg-up" : "rounded-b-[5px] bg-dn"} ${dim ? "opacity-30" : ""}`}
                    style={v >= 0 ? { bottom: H - zero, height: h, transformOrigin: "bottom" } : { top: zero, height: h, transformOrigin: "top" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="ml-4 mr-[56px] mt-2 grid grid-cols-12 gap-1.5 text-center">
        {MONTHS.map((m, i) => (
          <span key={i} className={`text-[12px] font-semibold ${open === i ? "text-ink" : "text-mut"}`}>
            {m}
          </span>
        ))}
      </div>
    </>
  );
}
